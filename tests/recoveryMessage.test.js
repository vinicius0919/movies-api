const { test } = require("node:test");
const assert = require("node:assert/strict");
const client = require("../services/resendClient");
// Every test installs a fetch mock. These tests never contact Resend.
const message = { from: "sender@example.com", to: "recipient@example.com", subject: "fixture", text: "fixture" };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, async json() { return body; } });
test("uses documented fixed HTTPS endpoint, backend Bearer key and bounded abort signal", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.method, "POST"); assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer test-only-key");
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.ok(options.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(options.body), message);
    return response({ id: "fixture-id" });
  });
  assert.deepEqual(await client.send(message, "test-only-key"), { data: { id: "fixture-id" }, error: null });
});
for (const [status, body, expected] of [
  [401, { name: "validation_error", message: "API key is invalid" }, "RESEND_AUTHENTICATION"],
  [403, { name: "restricted_api_key", message: "API key is not active" }, "RESEND_AUTHENTICATION"],
  [403, { name: "validation_error", message: "The example.com domain is not verified. Please, add and verify your domain." }, "RESEND_DOMAIN_UNVERIFIED"],
  [403, { name: "validation_error", message: "You can only send testing emails to your own email address (private@example.com). To send emails to other recipients, please verify a domain." }, "RESEND_RECIPIENT_UNAUTHORIZED"],
  [403, { name: "invalid_permission", message: "private" }, "RESEND_FORBIDDEN"],
  [429, { name: "rate_limit_exceeded" }, "RESEND_RATE_LIMIT"],
  [503, { name: "service_unavailable" }, "RESEND_UNAVAILABLE"],
  [422, { name: "validation_error", message: "private" }, "RESEND_REJECTED"],
  [200, { error: { name: "validation_error", message: "private" }, id: "not-success" }, "RESEND_REJECTED"],
  [200, {}, "RESEND_INVALID_RESPONSE"],
  [200, { id: "" }, "RESEND_INVALID_RESPONSE"],
]) {
  test(`returned API failure ${status} / ${expected} is not success`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => response(body, status));
    const result = await client.send(message, "test-only-key");
    assert.equal(result.data, null); assert.equal(result.error.code, expected);
    assert.equal(result.error.message, "Recovery email delivery failed");
    assert.ok(!JSON.stringify(result.error).includes("private"));
  });
}
for (const [error, expected] of [
  [new TypeError("private endpoint"), "RESEND_CONNECTION"],
  [Object.assign(new Error("private"), { name: "TimeoutError" }), "RESEND_TIMEOUT"],
  [Object.assign(new Error("private"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }), "RESEND_TIMEOUT"],
]) {
  test(`thrown transport failure becomes safe ${expected}`, async (t) => {
    t.mock.method(globalThis, "fetch", async () => { throw error; });
    const result = await client.send(message, "test-only-key");
    assert.equal(result.error.code, expected); assert.equal(result.data, null);
    assert.ok(!JSON.stringify(result.error).includes("private"));
  });
}
test("abort signal enforces timeout, including response reading", async (t) => {
  const reason = new DOMException("private", "TimeoutError");
  t.mock.method(AbortSignal, "timeout", (ms) => { assert.equal(ms, 20000); return AbortSignal.abort(reason); });
  t.mock.method(globalThis, "fetch", async (_url, options) => ({ ok: true, status: 200, async json() { throw options.signal.reason; } }));
  assert.equal((await client.send(message, "test-only-key")).error.code, "RESEND_TIMEOUT");
});
test("non-JSON provider result never leaks the response body", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 502, async json() { throw new SyntaxError("private response"); } }));
  assert.equal((await client.send(message, "test-only-key")).error.code, "RESEND_INVALID_RESPONSE");
});

test("connection interrupted while reading response remains a connection failure", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, status: 200, async json() { throw new TypeError("private connection detail"); } }));
  assert.equal((await client.send(message, "test-only-key")).error.code, "RESEND_CONNECTION");
});
