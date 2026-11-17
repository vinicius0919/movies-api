const { test } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");
const { SMTPServer } = require("smtp-server");
const { MongoMemoryServer } = require("mongodb-memory-server");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "smtp-rejection-test-secret-at-least-32-characters";
const app = require("../index");
const User = require("../models/User");
const Counter = require("../models/RecoveryRateLimit");
test("SMTP DATA rejection preserves generic response, logs no message and revokes reset token", async (t) => {
  let mongo, smtp;
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  try {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([User.init(), Counter.init()]);
    smtp = new SMTPServer({ authOptional: true, disabledCommands: ["AUTH", "STARTTLS"], logger: false,
      onData(stream, _session, callback) { stream.resume(); stream.on("end", () => callback(Object.assign(new Error("private provider text"), { responseCode: 550 }))); },
    });
    await new Promise((resolve, reject) => { smtp.once("error", reject); smtp.listen(0, "127.0.0.1", resolve); });
    Object.assign(process.env, { PASSWORD_RECOVERY_DIAGNOSTICS: "true", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtp.server.address().port), SMTP_SECURE: "false", SMTP_FROM: "MiqFlix <sender@example.com>", PASSWORD_RESET_ORIGIN: "https://fixture.example" });
    delete process.env.SMTP_USER; delete process.env.SMTP_PASS;
    const user = await User.create({ name: "Fixture", email: "fixture@example.com", passwordHash: "fixture-only-password-hash" });
    const existing = await request(app).post("/api/auth/forgot-password").send({ email: user.email });
    const missing = await request(app).post("/api/auth/forgot-password").send({ email: "missing@example.com" });
    assert.equal(existing.status, 202); assert.equal(missing.status, 202); assert.deepEqual(existing.body, missing.body);
    let finished = false;
    for (let i = 0; i < 100; i++) {
      const stored = await User.findById(user._id).select("+passwordResetHash");
      if (logs.length && !stored.passwordResetHash) { finished = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(finished, "controller must revoke failed delivery token");
    assert.ok(logs.some(([line]) => line.includes("category=smtp_message_rejected operation=smtp_send error_name=Error code=EMESSAGE command=DATA smtp_status=550")));
    assert.ok(logs.every((args) => args.length === 1 && typeof args[0] === "string"));
    assert.ok(!JSON.stringify(logs).includes("private provider text"));
    assert.ok(!JSON.stringify(logs).includes("fixture@example.com"));
    assert.ok(!JSON.stringify(logs).includes("https://fixture.example"));
  } finally {
    if (smtp) await new Promise((resolve) => smtp.close(resolve));
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
  }
});
