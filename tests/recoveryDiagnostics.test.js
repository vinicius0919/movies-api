const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const User = require("../models/User");
const mail = require("../services/recoveryEmailService");
const rate = require("../services/recoveryRateLimit");
const controller = require("../controllers/passwordRecoveryController");
const secret = "sensitive-placeholder-never-log";
const cases = [
  ["configuration", mail, "configuration", { code: "RECOVERY_RESEND_INVALID" }, "invalid_resend_configuration"],
  ["account_rate_limit", rate, "allow", { name: "MongoNetworkError" }, "database_connection_failed"],
  ["token_generation", crypto, "randomBytes", {}, "unexpected_failure"],
  ["token_hashing", crypto, "createHash", {}, "unexpected_failure"],
  ["token_persistence", User, "findOneAndUpdate", { code: 13 }, "database_permission_denied"],
];
for (const [stage, dependency, method, fields, category] of cases) {
  test(`forgotPassword safe diagnostic for ${stage}`, async (t) => {
    const logs = [];
    t.mock.method(console, "error", (...args) => logs.push(args));
    t.mock.method(mail, "configuration", () => ({}));
    t.mock.method(rate, "allow", async () => true);
    const failure = Object.assign(new Error(secret), fields, { body: secret, response: secret, query: secret });
    t.mock.method(dependency, method, () => { throw failure; });
    const response = { headersSent: false, status(code) { this.code = code; return this; }, json(body) { this.body = body; this.headersSent = true; return this; } };
    await controller.forgotPassword({ body: { email: "fixture@example.com" } }, response);
    assert.equal(response.code, 503);
    assert.deepEqual(response.body, { error: "Recuperação temporariamente indisponível. Tente novamente mais tarde." });
    assert.deepEqual(logs, [[`[PASSWORD RECOVERY] Request unavailable stage=${stage} category=${category}`]]);
    assert.ok(!JSON.stringify(logs).includes(secret));
  });
}
test("IP limiter uses safe stage and category without serializing database errors", async (t) => {
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  t.mock.method(require("../models/RecoveryRateLimit"), "findOneAndUpdate", () => { throw Object.assign(new Error(secret), { code: 13 }); });
  const response = { set() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  await rate.ipLimit("forgot", 10)({ ip: "127.0.0.1" }, response, () => assert.fail("must fail closed"));
  assert.equal(response.code, 503);
  assert.deepEqual(logs, [["[PASSWORD RECOVERY] Rate limit storage unavailable stage=ip_rate_limit category=database_permission_denied"]]);
});
