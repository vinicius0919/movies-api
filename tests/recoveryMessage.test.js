const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const nodemailer = require("nodemailer");
const { sendResetEmail } = require("../services/recoveryEmailService");
const { logFailure } = require("../services/recoveryDiagnostics");
beforeEach(() => {
  Object.assign(process.env, { NODE_ENV: "test", PASSWORD_RECOVERY_DIAGNOSTICS: "true", PASSWORD_RESET_ORIGIN: "https://fixture.example", SMTP_HOST: "127.0.0.1", SMTP_PORT: "1025", SMTP_FROM: "MiqFlix <sender@example.com>", SMTP_SECURE: "false" });
  delete process.env.SMTP_USER; delete process.env.SMTP_PASS;
});
test("message uses configured sender, normalized recipient argument, subject and escaped trusted reset link", async (t) => {
  let message;
  t.mock.method(nodemailer, "createTransport", () => ({ async sendMail(value) { message = value; return { accepted: ["recipient@example.com"], rejected: [] }; } }));
  const token = "a".repeat(64);
  await sendResetEmail("recipient@example.com", token);
  assert.equal(message.from, process.env.SMTP_FROM);
  assert.equal(message.to, "recipient@example.com");
  assert.equal(message.subject, "Redefina sua senha do MiqFlix");
  assert.ok(message.text.includes(`https://fixture.example/reset-password#token=${token}`));
  assert.ok(message.html.includes(`href="https://fixture.example/reset-password#token=${token}"`));
  assert.ok(message.html.includes("30 minutos"));
  assert.ok(!Object.hasOwn(message, "password"));
});
for (const [code, command, category] of [["EENVELOPE", "RCPT TO", "smtp_envelope_rejected"], ["EMESSAGE", "DATA", "smtp_message_rejected"]]) {
  test(`awaited ${code} rejection retains error identity and logs safe SMTP operation`, async (t) => {
    const secret = "never-log-payload";
    const error = Object.assign(new Error(secret), { code, command, responseCode: 550, response: secret, rejected: ["recipient@example.com"] });
    const logs = [];
    t.mock.method(console, "error", (...args) => logs.push(args));
    t.mock.method(nodemailer, "createTransport", () => ({ async sendMail() { await Promise.resolve(); throw error; } }));
    await assert.rejects(sendResetEmail("recipient@example.com", "b".repeat(64)), (caught) => {
      assert.equal(caught, error);
      logFailure("Email delivery failed", "email_delivery", caught);
      return true;
    });
    assert.deepEqual(logs, [[`[PASSWORD RECOVERY] Email delivery failed stage=email_delivery category=${category} operation=smtp_send error_name=Error code=${code} command=${command.replaceAll(" ", "_")} smtp_status=550`]]);
    assert.ok(!JSON.stringify(logs).includes(secret));
    assert.ok(!JSON.stringify(logs).includes("recipient@example.com"));
  });
}
test("local transport construction and post-send acceptance failures identify different operations", async (t) => {
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  const create = t.mock.method(nodemailer, "createTransport", () => { throw new TypeError("private data"); });
  await assert.rejects(sendResetEmail("recipient@example.com", "c".repeat(64)), (error) => { logFailure("Email delivery failed", "email_delivery", error); return true; });
  assert.ok(logs[0][0].includes("operation=smtp_transport error_name=TypeError code=unknown command=unknown"));
  create.mock.mockImplementation(() => ({ async sendMail() { return { accepted: [], rejected: ["recipient@example.com"] }; } }));
  await assert.rejects(sendResetEmail("recipient@example.com", "d".repeat(64)), (error) => { logFailure("Email delivery failed", "email_delivery", error); return true; });
  assert.ok(logs[1][0].includes("operation=smtp_acceptance error_name=Error code=RECOVERY_SMTP_NOT_ACCEPTED"));
});
test("diagnostic fields discard injected values and can be disabled", (t) => {
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  const secret = "secret@example.com";
  logFailure("Email delivery failed", "email_delivery", { name: secret, code: secret, command: `RCPT TO:<${secret}>`, responseCode: secret, message: secret });
  assert.ok(logs[0][0].endsWith("operation=unknown error_name=unknown code=unknown command=unknown smtp_status=unknown"));
  process.env.PASSWORD_RECOVERY_DIAGNOSTICS = "false";
  logFailure("Email delivery failed", "email_delivery", { code: "EMESSAGE", command: "DATA", responseCode: 550 });
  assert.deepEqual(logs[1], ["[PASSWORD RECOVERY] Email delivery failed stage=email_delivery category=smtp_message_rejected"]);
});
