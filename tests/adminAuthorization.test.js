const test = require("node:test");
const assert = require("node:assert/strict");

const requireAdmin = require("../middlewares/requireAdmin");

function responseDouble() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("requireAdmin rejeita requisição sem autenticação", () => {
  const res = responseDouble();
  let called = false;

  requireAdmin({}, res, () => {
    called = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(called, false);
});

test("requireAdmin rejeita usuário comum", () => {
  const res = responseDouble();
  let called = false;

  requireAdmin({ user: { role: "user" } }, res, () => {
    called = true;
  });

  assert.equal(res.statusCode, 403);
  assert.equal(called, false);
});

test("requireAdmin permite administrador autenticado", () => {
  const res = responseDouble();
  let called = false;

  requireAdmin({ user: { role: "admin" } }, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(res.statusCode, null);
});
