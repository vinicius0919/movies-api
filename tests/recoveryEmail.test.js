const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const client = require("../services/resendClient");
const { sendResetEmail, configuration } = require("../services/recoveryEmailService");
const { logFailure } = require("../services/recoveryDiagnostics");
beforeEach(() => {
  Object.assign(process.env, { NODE_ENV: "test", PASSWORD_RESET_ORIGIN: "https://fixture.example", RESEND_API_KEY: "test-only-key", RESEND_FROM: "MiqFlix <sender@example.com>", PASSWORD_RECOVERY_DIAGNOSTICS: "false" });
});
test("Resend message preserves sender, recipient, subject, HTML, text and trusted fragment link", async (t) => {
  let message;
  t.mock.method(client, "send", async (value, key) => { message = value; assert.equal(key, "test-only-key"); return { data: { id: "fixture-id" }, error: null }; });
  const token = "a".repeat(64);
  await sendResetEmail("recipient@example.com", token);
  assert.equal(message.from, process.env.RESEND_FROM);
  assert.equal(message.to, "recipient@example.com");
  assert.equal(message.subject, "Redefina sua senha do MiqFlix");
  assert.ok(message.text.includes(`https://fixture.example/reset-password#token=${token}`));
  assert.ok(message.html.includes(`href="https://fixture.example/reset-password#token=${token}"`));
  assert.ok(message.html.includes("30 minutos"));
  assert.ok(message.text.includes("ignore este e-mail"));
  assert.deepEqual(Object.keys(message).sort(), ["from", "html", "subject", "text", "to"]);
});
test("non-throwing client error is rejected even when data contains an id", async (t) => {
  const failure = Object.assign(new Error("safe"), { code: "RESEND_RECIPIENT_UNAUTHORIZED" });
  t.mock.method(client, "send", async () => ({ data: { id: "not-success" }, error: failure }));
  await assert.rejects(sendResetEmail("recipient@example.com", "b".repeat(64)), (error) => error === failure);
});
test("missing acceptance is a failure", async (t) => {
  t.mock.method(client, "send", async () => ({ data: null, error: null }));
  await assert.rejects(sendResetEmail("recipient@example.com", "c".repeat(64)), { code: "RESEND_INVALID_RESPONSE" });
});
test("missing key or sender fails before any client call", async (t) => {
  const mock = t.mock.method(client, "send", () => assert.fail("must not send"));
  for (const field of ["RESEND_API_KEY", "RESEND_FROM"]) {
    const value = process.env[field]; delete process.env[field];
    assert.throws(configuration, { code: "RECOVERY_RESEND_INVALID" });
    process.env[field] = value;
  }
  assert.equal(mock.mock.callCount(), 0);
});
for (const [code, category] of [
  ["RESEND_CONNECTION", "resend_connection_failed"], ["RESEND_TIMEOUT", "resend_timeout"],
  ["RESEND_AUTHENTICATION", "resend_authentication_failed"], ["RESEND_DOMAIN_UNVERIFIED", "resend_domain_unverified"],
  ["RESEND_RECIPIENT_UNAUTHORIZED", "resend_recipient_unauthorized"], ["RESEND_FORBIDDEN", "resend_permission_denied"],
]) {
  test(`safe diagnosis: ${category}`, async (t) => {
    const logs = [];
    process.env.PASSWORD_RECOVERY_DIAGNOSTICS = "true";
    t.mock.method(console, "error", (...args) => logs.push(args));
    t.mock.method(client, "send", async () => ({ data: null, error: Object.assign(new Error("never-log-secret"), { code, status: 403, response: "recipient@example.com" }) }));
    await assert.rejects(sendResetEmail("recipient@example.com", "d".repeat(64)), (error) => { logFailure("Email delivery failed", "email_delivery", error); return true; });
    assert.deepEqual(logs, [[`[PASSWORD RECOVERY] Email delivery failed stage=email_delivery category=${category} operation=resend_send error_name=Error code=${code} http_status=403`]]);
  });
}
test("diagnostics discard arbitrary names, codes, statuses and provider messages", (t) => {
  process.env.PASSWORD_RECOVERY_DIAGNOSTICS = "true";
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  logFailure("Email delivery failed", "email_delivery", { name: "secret", code: "secret", status: "secret", message: "secret", response: "secret" });
  assert.deepEqual(logs, [["[PASSWORD RECOVERY] Email delivery failed stage=email_delivery category=unexpected_failure operation=unknown error_name=unknown code=unknown http_status=unknown"]]);
});
