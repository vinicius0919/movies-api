const test = require("node:test");
const assert = require("node:assert/strict");

const requireCsrfOrigin = require("../middlewares/requireCsrfOrigin");

function responseDouble() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function request(headers = {}) {
  return { get(name) { return headers[name.toLowerCase()] || headers[name] || undefined; } };
}

test("CSRF rejeita mutação sem Origin ou Referer", () => {
  const res = responseDouble();
  let called = false;
  requireCsrfOrigin(request(), res, () => { called = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(called, false);
});

test("CSRF aceita origem confiável", () => {
  const res = responseDouble();
  let called = false;
  requireCsrfOrigin(request({ origin: "http://localhost:5173" }), res, () => { called = true; });
  assert.equal(called, true);
  assert.equal(res.statusCode, null);
});

test("CSRF rejeita origem desconhecida", () => {
  const res = responseDouble();
  let called = false;
  requireCsrfOrigin(request({ origin: "https://evil.example" }), res, () => { called = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(called, false);
});
