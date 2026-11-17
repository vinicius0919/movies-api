const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { SMTPServer } = require("smtp-server");
const { sendResetEmail } = require("../services/recoveryEmailService");
let server, raw, reject;
before(async () => {
  server = new SMTPServer({
    authOptional: true, disabledCommands: ["STARTTLS", "AUTH"], logger: false,
    onRcptTo(_address, _session, callback) { callback(reject ? new Error("Rejected") : undefined); },
    onData(stream, _session, callback) {
      raw = "";
      stream.on("data", (chunk) => { raw += chunk.toString(); });
      stream.on("end", () => callback());
    },
  });
  await new Promise((resolve, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", resolve); });
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(server.server.address().port);
  process.env.SMTP_FROM = "MiqFlix <no-reply@example.com>";
  process.env.SMTP_SECURE = "false";
  process.env.PASSWORD_RESET_ORIGIN = "https://miqflix.example";
  delete process.env.SMTP_USER; delete process.env.SMTP_PASS;
});
after(async () => { await new Promise((resolve) => server.close(resolve)); });
test("SMTP transport sends branded text and HTML mail with trusted fragment URL and 30-minute expiry", async () => {
  const token = "a".repeat(64);
  await sendResetEmail("person@example.com", token);
  assert.match(raw, /To: person@example.com/);
  assert.match(raw, /multipart\/alternative/);
  assert.match(raw, /text\/plain/);
  assert.match(raw, /text\/html/);
  const decoded = raw.replace(/=\r\n/g, "").replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  assert.ok(decoded.includes(`https://miqflix.example/reset-password#token=${token}`));
  assert.ok(decoded.includes("30 minutos"));
  assert.ok(decoded.includes("MiqFlix"));
  assert.ok(decoded.includes("ignore este e-mail"));
});
test("SMTP rejection rejects promise rather than claiming delivery", async () => {
  reject = true;
  await assert.rejects(sendResetEmail("person@example.com", "b".repeat(64)));
});

test("transport matches validated timeouts and preserves implicit TLS and required STARTTLS", async (t) => {
  const nodemailer = require("nodemailer");
  const original = { ...process.env };
  const transports = [];
  t.mock.method(nodemailer, "createTransport", (options) => {
    transports.push(options);
    return { async sendMail() { return { accepted: ["fixture@example.com"], rejected: [] }; } };
  });
  try {
    process.env.NODE_ENV = "production";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_SECURE = "true";
    await sendResetEmail("fixture@example.com", "c".repeat(64));
    assert.equal(transports[0].secure, true);
    assert.equal(transports[0].requireTLS, false);
    process.env.SMTP_PORT = "587";
    process.env.SMTP_SECURE = "false";
    await sendResetEmail("fixture@example.com", "d".repeat(64));
    assert.equal(transports[1].secure, false);
    assert.equal(transports[1].requireTLS, true);
    for (const transport of transports) {
      assert.equal(transport.connectionTimeout, 15000);
      assert.equal(transport.greetingTimeout, 15000);
      assert.equal(transport.socketTimeout, 20000);
      assert.equal(transport.logger, false);
      assert.equal(transport.debug, false);
      assert.notEqual(transport.tls?.rejectUnauthorized, false);
    }
  } finally {
    for (const key of ["NODE_ENV", "SMTP_PORT", "SMTP_SECURE"]) {
      if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
    }
  }
});
