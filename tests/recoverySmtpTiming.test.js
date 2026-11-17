const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const request = require("supertest");
const { SMTPServer } = require("smtp-server");
const { MongoMemoryServer } = require("mongodb-memory-server");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "smtp-timing-test-secret-at-least-32-characters";
const app = require("../index");
const User = require("../models/User");
const Counter = require("../models/RecoveryRateLimit");
const mail = require("../services/recoveryEmailService");

test("HTTP recovery survives delayed SMTP greeting and acceptance beyond the previous limits", { timeout: 35000 }, async (t) => {
  let mongo, smtp, storedToken, complete;
  const delivery = new Promise((resolve) => { complete = resolve; });
  const timers = new Set();
  const later = (fn, ms) => {
    const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms);
    timers.add(timer);
  };
  try {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([User.init(), Counter.init()]);
    smtp = new SMTPServer({
      authOptional: true, disabledCommands: ["AUTH", "STARTTLS"], logger: false,
      // Legitimate response times exceeded both former 5s greeting and 10s socket limits.
      onConnect(_session, callback) { later(callback, 6000); },
      onData(stream, _session, callback) {
        stream.resume();
        stream.on("end", () => later(callback, 11000));
      },
    });
    await new Promise((resolve, reject) => { smtp.once("error", reject); smtp.listen(0, "127.0.0.1", resolve); });
    Object.assign(process.env, {
      SMTP_HOST: "127.0.0.1", SMTP_PORT: String(smtp.server.address().port), SMTP_SECURE: "false",
      SMTP_FROM: "MiqFlix <no-reply@example.com>", PASSWORD_RESET_ORIGIN: "https://miqflix.example",
    });
    delete process.env.SMTP_USER; delete process.env.SMTP_PASS;
    const user = await User.create({ name: "Timing fixture", email: "fixture@example.com", passwordHash: await bcrypt.hash("fixture-password", 4) });
    const original = mail.sendResetEmail;
    t.mock.method(mail, "sendResetEmail", async (email, token) => {
      storedToken = token;
      try {
        await original(email, token);
        complete(true);
      } catch (error) {
        complete(false);
        throw error;
      }
    });
    // The API responds generically without waiting for SMTP, even when delivery takes >15s.
    const response = await request(app).post("/api/auth/forgot-password").send({ email: user.email }).timeout({ response: 3000, deadline: 5000 });
    assert.equal(response.status, 202);
    assert.ok(!JSON.stringify(response.body).includes(storedToken));
    const accepted = await delivery;
    if (!accepted) {
      // Let the controller finish its existing token cleanup before closing MongoDB.
      for (let attempt = 0; attempt < 100; attempt++) {
        if (!(await User.findById(user._id).select("+passwordResetHash")).passwordResetHash) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    assert.equal(accepted, true, "SMTP must finish successfully with the validated timeout profile");
    const stored = await User.findById(user._id).select("+passwordResetHash +passwordResetExpiresAt");
    assert.equal(stored.passwordResetHash, crypto.createHash("sha256").update(storedToken).digest("hex"));
    assert.ok(stored.passwordResetExpiresAt > new Date());
  } finally {
    for (const timer of timers) clearTimeout(timer);
    if (smtp) await new Promise((resolve) => smtp.close(resolve));
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
  }
});
