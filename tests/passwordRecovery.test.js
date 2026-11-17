const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const request = require("supertest");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");
const User = require("../models/User");
const Counter = require("../models/RecoveryRateLimit");
const mail = require("../services/recoveryEmailService");
const originalSend = mail.sendResetEmail;
// Keep local HTTP fixtures independent of the real deployment mode in .env.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-with-at-least-thirty-two-characters";
const app = require("../index");
let mongo, user, delivered, failMail;
const oldPassword = "original-password";
const newPassword = "replacement-password";
const endpoint = (name) => `/api/auth/${name}`;
const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");
async function waitFor(predicate) {
  for (let i = 0; i < 100; i++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Background operation did not complete");
}
async function seedToken(expires = new Date(Date.now() + 1800000)) {
  const token = crypto.randomBytes(32).toString("hex");
  await User.updateOne({ _id: user._id }, { $set: { passwordResetHash: hash(token), passwordResetExpiresAt: expires } });
  return token;
}
before(async () => {
  process.env.JWT_SECRET = "test-secret-with-at-least-thirty-two-characters";
  process.env.PASSWORD_RESET_ORIGIN = "http://localhost:5173";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "1025";
  process.env.SMTP_FROM = "MiqFlix <no-reply@example.com>";
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), Counter.init()]);
  mail.sendResetEmail = async (email, token) => {
    delivered.push({ email, token });
    if (failMail) throw new Error(`sensitive ${token}`);
  };
});
after(async () => {
  mail.sendResetEmail = originalSend;
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Counter.deleteMany({})]);
  delivered = []; failMail = false;
  user = await User.create({ name: "Test", email: "person@example.com", passwordHash: await bcrypt.hash(oldPassword, 4), role: "admin" });
});
test("existing and missing email return identical responses; normalized email, hashed token, expiry and invalidation", async () => {
  const previous = await seedToken();
  const existing = await request(app).post(endpoint("forgot-password")).send({ email: " PERSON@EXAMPLE.COM " });
  const missing = await request(app).post(endpoint("forgot-password")).send({ email: "missing@example.com" });
  assert.equal(existing.status, 202); assert.equal(missing.status, 202);
  assert.deepEqual(existing.body, missing.body);
  await waitFor(() => delivered.length === 1);
  const stored = await User.findById(user._id).select("+passwordResetHash +passwordResetExpiresAt");
  assert.match(delivered[0].token, /^[a-f0-9]{64}$/);
  assert.equal(stored.passwordResetHash, hash(delivered[0].token));
  assert.notEqual(stored.passwordResetHash, hash(previous));
  assert.ok(Math.abs(stored.passwordResetExpiresAt.getTime() - Date.now() - 1800000) < 10000);
  assert.equal((await request(app).post(endpoint("reset-password")).send({ token: previous, password: newPassword })).status, 400);
  assert.equal(existing.headers["cache-control"], "no-store");
});
test("invalid inputs rejected", async () => {
  for (const email of ["bad", null, {}, "a".repeat(255) + "@a.co"]) {
    assert.equal((await request(app).post(endpoint("forgot-password")).send({ email })).status, 400);
  }
  for (const token of [null, {}, "bad", "a".repeat(64)]) {
    assert.equal((await request(app).post(endpoint("reset-password")).send({ token, password: newPassword })).status, 400);
  }
});
test("expired token is rejected without changing password", async () => {
  const token = await seedToken(new Date(Date.now() - 1));
  assert.equal((await request(app).post(endpoint("reset-password")).send({ token, password: newPassword })).status, 400);
  assert.equal((await request(app).post(endpoint("login")).send({ email: user.email, password: oldPassword })).status, 200);
});
test("password policy preserves token for retry including bcrypt UTF-8 limit", async () => {
  const token = await seedToken();
  for (const password of ["short", "a".repeat(73), "é".repeat(37), null, {}]) {
    assert.equal((await request(app).post(endpoint("reset-password")).send({ token, password })).status, 400);
  }
  assert.equal((await request(app).post(endpoint("reset-password")).send({ token, password: newPassword })).status, 200);
});
test("successful reset revokes old and legacy sessions; old login fails, new login works, role preserved, token consumed", async () => {
  const login = await request(app).post(endpoint("login")).send({ email: user.email, password: oldPassword });
  const cookie = login.headers["set-cookie"][0].split(";")[0];
  const legacy = "miqflix_session=" + jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET);
  assert.equal((await request(app).get(endpoint("me")).set("Cookie", legacy)).status, 200);
  const token = await seedToken();
  const result = await request(app).post(endpoint("reset-password")).send({ token, password: newPassword });
  assert.equal(result.status, 200);
  assert.ok(!JSON.stringify(result.body).includes(token));
  assert.equal((await request(app).post(endpoint("reset-password")).send({ token, password: newPassword })).status, 400);
  for (const session of [cookie, legacy]) assert.equal((await request(app).get(endpoint("me")).set("Cookie", session)).status, 401);
  assert.equal((await request(app).post(endpoint("login")).send({ email: user.email, password: oldPassword })).status, 401);
  const nextLogin = await request(app).post(endpoint("login")).send({ email: user.email, password: newPassword });
  assert.equal(nextLogin.status, 200); assert.equal(nextLogin.body.user.role, "admin");
  assert.equal((await request(app).get(endpoint("me")).set("Cookie", nextLogin.headers["set-cookie"][0].split(";")[0])).status, 200);
  const stored = await User.findById(user._id).select("+passwordResetHash +sessionVersion");
  assert.equal(stored.passwordResetHash, undefined); assert.equal(stored.sessionVersion, 1);
});
test("concurrent attempts consume token exactly once", async () => {
  const token = await seedToken();
  const results = await Promise.all([newPassword, "another-password"].map((password) => request(app).post(endpoint("reset-password")).send({ token, password })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
});
test("account throttling is generic and does not replace token after three emails", async () => {
  for (let i = 0; i < 4; i++) assert.equal((await request(app).post(endpoint("forgot-password")).send({ email: user.email })).status, 202);
  await waitFor(() => delivered.length === 3);
  assert.equal(delivered.length, 3);
});
test("IP rate limiting ignores spoofed forwarded headers and has Retry-After", async () => {
  for (let i = 0; i < 10; i++) assert.equal((await request(app).post(endpoint("forgot-password")).set("X-Forwarded-For", `10.0.0.${i}`).send({ email: "missing@example.com" })).status, 202);
  const result = await request(app).post(endpoint("forgot-password")).send({ email: user.email });
  assert.equal(result.status, 429); assert.equal(result.headers["retry-after"], "1800");
});
test("SMTP failure invalidates token and logs no sensitive data", async () => {
  failMail = true;
  const logs = [];
  const original = console.error;
  console.error = (...args) => logs.push(args.join(" "));
  try {
    assert.equal((await request(app).post(endpoint("forgot-password")).send({ email: user.email })).status, 202);
    await waitFor(async () => delivered.length && !(await User.findById(user._id).select("+passwordResetHash")).passwordResetHash);
    assert.ok(logs.some((line) => line.includes("Email delivery failed")));
    assert.ok(logs.every((line) => !line.includes(delivered[0].token) && !line.includes(user.email)));
  } finally { console.error = original; }
});
test("missing SMTP configuration fails equally for any account", async () => {
  const host = process.env.SMTP_HOST;
  delete process.env.SMTP_HOST;
  try {
    for (const email of [user.email, "missing@example.com"]) assert.equal((await request(app).post(endpoint("forgot-password")).send({ email })).status, 503);
  } finally { process.env.SMTP_HOST = host; }
});
test("recovery origin must be trusted configuration, production requires HTTPS", () => {
  const origin = process.env.PASSWORD_RESET_ORIGIN;
  for (const value of ["https://user:pass@example.com", "https://example.com/path", "javascript:alert(1)"]) {
    process.env.PASSWORD_RESET_ORIGIN = value;
    assert.throws(() => mail.configuration());
  }
  process.env.PASSWORD_RESET_ORIGIN = origin;
  process.env.NODE_ENV = "production";
  assert.throws(() => mail.configuration());
  delete process.env.NODE_ENV;
});

test("malformed request body never leaks token through production error logger", async () => {
  const token = "c".repeat(64);
  const logs = [];
  const original = console.error;
  console.error = (...args) => logs.push(args.join(" "));
  try {
    const response = await request(app).post(endpoint("reset-password")).set("Content-Type", "application/json").send(`{"token":"${token}",`);
    assert.equal(response.status, 400);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.ok(logs.length > 0);
    assert.ok(logs.every((line) => !line.includes(token)));
  } finally { console.error = original; }
});
test("reset endpoint has independent IP throttle", async () => {
  for (let i = 0; i < 20; i++) assert.equal((await request(app).post(endpoint("reset-password")).send({ token: "bad", password: newPassword })).status, 400);
  assert.equal((await request(app).post(endpoint("reset-password")).send({ token: "bad", password: newPassword })).status, 429);
});

test("existing registration, session and logout flow remains functional", async () => {
  const agent = request.agent(app);
  const result = await agent.post(endpoint("register")).send({ name: "New user", email: "new@example.com", password: "valid-password" });
  assert.equal(result.status, 201);
  assert.equal(result.body.user.role, "user");
  assert.equal((await agent.get(endpoint("me"))).status, 200);
  assert.equal((await agent.post(endpoint("logout"))).status, 200);
  assert.equal((await agent.get(endpoint("me"))).status, 401);
});
test("recovery preserves CORS rejection and never logs request secrets", async () => {
  const response = await request(app).post(endpoint("forgot-password")).set("Origin", "https://untrusted.example").send({ email: user.email });
  assert.equal(response.status, 403);
  assert.equal(delivered.length, 0);
});

test("production HTTP recovery origin fails before account/token operations; HTTPS fixes the request", async (t) => {
  const originalOrigin = process.env.PASSWORD_RESET_ORIGIN;
  const originalMode = process.env.NODE_ENV;
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  const limit = t.mock.method(require("../services/recoveryRateLimit"), "allow", async () => true);
  const previous = await seedToken();
  try {
    process.env.NODE_ENV = "production";
    process.env.PASSWORD_RESET_ORIGIN = "http://localhost:5173";
    for (const email of [user.email, "missing@example.com"]) {
      const response = await request(app).post(endpoint("forgot-password")).send({ email });
      assert.equal(response.status, 503);
      assert.deepEqual(response.body, { error: "Recuperação temporariamente indisponível. Tente novamente mais tarde." });
    }
    assert.equal(limit.mock.callCount(), 0);
    assert.equal(delivered.length, 0);
    assert.equal((await User.findById(user._id).select("+passwordResetHash")).passwordResetHash, hash(previous));
    assert.ok(logs.every((args) => args.length === 1 && typeof args[0] === "string"));
    assert.ok(logs.some(([line]) => line.includes("stage=configuration category=production_https_required")));
    assert.ok(logs.every(([line]) => !line.includes(user.email) && !line.includes(previous) && !line.includes(process.env.PASSWORD_RESET_ORIGIN)));
    process.env.PASSWORD_RESET_ORIGIN = "https://miqflix.example";
    assert.equal((await request(app).post(endpoint("forgot-password")).send({ email: user.email })).status, 202);
    await waitFor(() => delivered.length === 1);
  } finally {
    process.env.PASSWORD_RESET_ORIGIN = originalOrigin;
    if (originalMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalMode;
    t.mock.restoreAll();
  }
});
