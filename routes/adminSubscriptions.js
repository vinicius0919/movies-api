const express = require("express");

const authenticate = require("../middlewares/authenticate");
const requireAdmin = require("../middlewares/requireAdmin");
const requireCsrfOrigin = require("../middlewares/requireCsrfOrigin");
const User = require("../models/User");

const router = express.Router();

const SUBSCRIPTIONS_API_URL = (
  process.env.SUBSCRIPTIONS_API_URL || ""
).replace(/\/+$/, "");

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const REQUEST_TIMEOUT = 15000;

class SubscriptionAdminBridgeError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.name = "SubscriptionAdminBridgeError";
    this.status = status;
  }
}

function validateObjectId(value, label) {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) {
    throw new SubscriptionAdminBridgeError(`Identificador de ${label} inválido.`, 400);
  }
  return value;
}

async function requestInternalAdmin(path, { method = "GET", body, adminUserId } = {}) {
  if (!SUBSCRIPTIONS_API_URL || !INTERNAL_API_KEY) {
    throw new SubscriptionAdminBridgeError("Serviço de assinaturas não configurado.");
  }

  const headers = {
    Accept: "application/json",
    "x-internal-api-key": INTERNAL_API_KEY,
    "x-admin-user-id": adminUserId,
  };

  const options = {
    method,
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT),
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${SUBSCRIPTIONS_API_URL}${path}`, options);
  } catch (error) {
    console.error("[ADMIN SUBSCRIPTIONS] Falha de comunicação:", error.message);
    throw new SubscriptionAdminBridgeError("Serviço de assinaturas temporariamente indisponível.");
  }

  if (!response.ok) {
    console.error("[ADMIN SUBSCRIPTIONS] Serviço respondeu:", response.status);
    throw new SubscriptionAdminBridgeError(
      response.status >= 400 && response.status < 500
        ? "Não foi possível concluir a operação administrativa."
        : "Serviço de assinaturas temporariamente indisponível.",
      response.status >= 400 && response.status < 500 ? response.status : 503,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new SubscriptionAdminBridgeError("Resposta inválida do serviço de assinaturas.");
  }
}

function handleBridgeError(error, res) {
  if (error instanceof SubscriptionAdminBridgeError) {
    return res.status(error.status).json({ error: error.message });
  }

  console.error("[ADMIN SUBSCRIPTIONS] Erro inesperado:", error.message);
  return res.status(503).json({ error: "Serviço de assinaturas temporariamente indisponível." });
}

async function forward(req, res, path, options = {}) {
  try {
    return res.json(await requestInternalAdmin(path, {
      ...options,
      adminUserId: String(req.user._id),
    }));
  } catch (error) {
    return handleBridgeError(error, res);
  }
}

router.use(authenticate, requireAdmin);

router.get("/dashboard", async (req, res) => {
  try {
    const params = new URLSearchParams();
    for (const field of ["from", "to"]) {
      if (req.query[field] !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(req.query[field]))) {
        throw new SubscriptionAdminBridgeError("Intervalo de datas inválido.", 422);
      }
      if (typeof req.query[field] === "string") params.set(field, req.query[field]);
    }
    const to = req.query.to ? new Date(`${req.query.to}T23:59:59.999Z`) : new Date();
    const from = req.query.from ? new Date(`${req.query.from}T00:00:00.000Z`) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [metrics, totalUsers, newUsers] = await Promise.all([
      requestInternalAdmin(`/api/internal/admin/metrics?${params.toString()}`, { adminUserId: String(req.user._id) }),
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: from, $lte: to } }),
    ]);
    return res.json({ ...metrics, users: { ...metrics.users, total: totalUsers, newInPeriod: newUsers, withoutSubscription: Math.max(totalUsers - metrics.users.usersWithSubscription, 0) } });
  } catch (error) {
    return handleBridgeError(error, res);
  }
});

router.get("/plans", (req, res) => forward(req, res, "/api/internal/admin/plans"));

router.get("/plans/:planId", (req, res) => {
  const planId = validateObjectId(req.params.planId, "plano");
  return forward(req, res, `/api/internal/admin/plans/${planId}`);
});

router.post("/plans", requireCsrfOrigin, (req, res) => {
  return forward(req, res, "/api/internal/admin/plans", {
    method: "POST",
    body: req.body,
  });
});

router.patch("/plans/reorder", requireCsrfOrigin, (req, res) => {
  return forward(req, res, "/api/internal/admin/plans/reorder", {
    method: "PATCH",
    body: req.body,
  });
});

router.patch("/plans/:planId", requireCsrfOrigin, (req, res) => {
  const planId = validateObjectId(req.params.planId, "plano");
  return forward(req, res, `/api/internal/admin/plans/${planId}`, {
    method: "PATCH",
    body: req.body,
  });
});

for (const action of ["activate", "deactivate", "archive", "duplicate"]) {
  router.post(`/plans/:planId/${action}`, requireCsrfOrigin, (req, res) => {
    const planId = validateObjectId(req.params.planId, "plano");
    return forward(req, res, `/api/internal/admin/plans/${planId}/${action}`, {
      method: "POST",
    });
  });
}

router.get("/users", (req, res) => forward(req, res, `/api/internal/admin/users${req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : ""}`));

router.get("/users/:userId", (req, res) => {
  const userId = validateObjectId(req.params.userId, "usuário");
  return forward(req, res, `/api/internal/admin/users/${userId}`);
});

router.get("/users/:userId/access-history", (req, res) => {
  const userId = validateObjectId(req.params.userId, "usuário");
  return forward(req, res, `/api/internal/admin/users/${userId}/access-history`);
});

router.post("/users/:userId/access/extend", requireCsrfOrigin, (req, res) => {
  const userId = validateObjectId(req.params.userId, "usuário");
  return forward(req, res, `/api/internal/admin/users/${userId}/access/extend`, { method: "POST", body: req.body });
});

router.post("/users/:userId/access/set-expiration", requireCsrfOrigin, (req, res) => {
  const userId = validateObjectId(req.params.userId, "usuário");
  return forward(req, res, `/api/internal/admin/users/${userId}/access/set-expiration`, { method: "POST", body: req.body });
});

router.post("/users/:userId/access/grant", requireCsrfOrigin, (req, res) => {
  const userId = validateObjectId(req.params.userId, "usuário");
  return forward(req, res, `/api/internal/admin/users/${userId}/access/grant`, { method: "POST", body: req.body });
});

router.post("/users/:userId/access/grants/:grantId/revoke", requireCsrfOrigin, (req, res) => {
  const userId = validateObjectId(req.params.userId, "usuário");
  const grantId = validateObjectId(req.params.grantId, "concessão");
  return forward(req, res, `/api/internal/admin/users/${userId}/access/grants/${grantId}/revoke`, { method: "POST", body: req.body });
});

module.exports = router;
