const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");
const crypto = require("node:crypto");
const { MongoMemoryServer } = require("mongodb-memory-server");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "resend-integration-secret-at-least-32-characters";
const app = require("../index");
const User = require("../models/User");
const Counter = require("../models/RecoveryRateLimit");
let mongo, user;
before(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await Promise.all([User.init(), Counter.init()]); });
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Counter.deleteMany({})]);
  Object.assign(process.env, { PASSWORD_RECOVERY_DIAGNOSTICS: "true", RESEND_API_KEY: "test-only-key", RESEND_FROM: "MiqFlix <sender@example.com>", PASSWORD_RESET_ORIGIN: "https://fixture.example" });
  user = await User.create({ name: "Fixture", email: "fixture@example.com", passwordHash: "fixture-only-hash" });
});
async function waitFor(predicate) {
  for (let i = 0; i < 100; i++) { if (await predicate()) return; await new Promise((r) => setTimeout(r, 20)); }
  assert.fail("background delivery did not finish");
}
for (const mode of ["recipient", "domain", "authentication", "timeout", "connection"]) {
  test(`failed Resend ${mode} delivery preserves generic response and revokes token`, async (t) => {
    const logs = []; let calls = 0;
    t.mock.method(console, "error", (...args) => logs.push(args));
    t.mock.method(globalThis, "fetch", async () => {
      calls++;
      if (mode === "timeout") throw Object.assign(new Error("private"), { name: "TimeoutError" });
      if (mode === "connection") throw new TypeError("private");
      const status = mode === "authentication" ? 401 : 403;
      const message = mode === "recipient" ? "You can only send testing emails to your own email address (private@example.com)." : mode === "domain" ? "The private.example domain is not verified." : "API key is invalid";
      return { ok: false, status, async json() { return { name: "validation_error", message }; } };
    });
    const existing = await request(app).post("/api/auth/forgot-password").send({ email: user.email });
    const missing = await request(app).post("/api/auth/forgot-password").send({ email: "missing@example.com" });
    assert.equal(existing.status, 202); assert.equal(missing.status, 202); assert.deepEqual(existing.body, missing.body);
    await waitFor(async () => logs.length && !(await User.findById(user._id).select("+passwordResetHash")).passwordResetHash);
    assert.equal(calls, 1);
    assert.ok(logs.every((args) => args.length === 1 && typeof args[0] === "string"));
    for (const secret of ["private", user.email, "test-only-key", "https://fixture.example"]) assert.ok(!JSON.stringify(logs).includes(secret));
  });
}
test("generic HTTP response does not wait for HTTPS acceptance; successful send preserves hashed token", async (t) => {
  let complete, payload;
  t.mock.method(globalThis, "fetch", async (_url, options) => { payload = JSON.parse(options.body); await new Promise((resolve) => { complete = resolve; }); return { ok: true, status: 200, async json() { return { id: "fixture-id" }; } }; });
  const response = await request(app).post("/api/auth/forgot-password").send({ email: user.email }).timeout({ response: 3000 });
  assert.equal(response.status, 202); assert.ok(complete); complete();
  const token = payload.text.match(/#token=([a-f0-9]{64})/)[1];
  const stored = await User.findById(user._id).select("+passwordResetHash +passwordResetExpiresAt");
  assert.equal(stored.passwordResetHash, crypto.createHash("sha256").update(token).digest("hex"));
  assert.ok(stored.passwordResetExpiresAt > new Date());
});
