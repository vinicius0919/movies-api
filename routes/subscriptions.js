
const express = require("express");

const authenticate = require(
  "../middlewares/authenticate"
);

const router = express.Router();

// =============================================
// CONFIGURAÇÃO
// =============================================

const SUBSCRIPTIONS_API_URL = (
  process.env.SUBSCRIPTIONS_API_URL || ""
).replace(/\/+$/, "");

const INTERNAL_API_KEY =
  process.env.INTERNAL_API_KEY;

const REQUEST_TIMEOUT = 15000;

// =============================================
// UTILITÁRIOS
// =============================================

function normalizeReturnPath(value) {
  if (
    typeof value !== "string" ||
    value.length > 1000 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(value)
  ) {
    return "/";
  }

  try {
    const url = new URL(
      value,
      "https://miqflix.site"
    );

    if (url.origin !== "https://miqflix.site") {
      return "/";
    }

    const blockedPaths = [
      "/login",
      "/register",
      "/subscription",
      "/checkout/retorno",
    ];

    if (blockedPaths.includes(url.pathname)) {
      return "/";
    }

    return (
      url.pathname +
      url.search +
      url.hash
    );
  } catch {
    return "/";
  }
}

function getAuthenticatedUserId(req) {
  const userId =
    req.user?._id ||
    req.user?.id ||
    req.user?.userId;

  return userId ? String(userId) : null;
}

function isValidObjectId(value) {
  return (
    typeof value === "string" &&
    /^[a-f\d]{24}$/i.test(value)
  );
}

// =============================================
// COMUNICAÇÃO COM API DE PAGAMENTOS
// =============================================

async function requestBilling(
  path,
  options = {}
) {
  if (
    !SUBSCRIPTIONS_API_URL ||
    !INTERNAL_API_KEY
  ) {
    const error = new Error(
      "Integração de assinaturas não configurada."
    );

    error.status = 503;
    throw error;
  }

  const response = await fetch(
    `${SUBSCRIPTIONS_API_URL}${path}`,
    {
      ...options,

      headers: {
        "Content-Type": "application/json",
        "x-internal-api-key":
          INTERNAL_API_KEY,
        ...options.headers,
      },

      signal: AbortSignal.timeout(
        REQUEST_TIMEOUT
      ),
    }
  );

  const contentType =
    response.headers.get("content-type") || "";

  let data;

  if (
    contentType.includes("application/json")
  ) {
    data = await response.json();
  } else {
    data = {
      error:
        "Resposta inválida da API de pagamentos.",
    };
  }

  return {
    response,
    data,
  };
}


router.post(
  "/confirm",
  authenticate,
  async (req, res, next) => {
    try {
      const userId =
        getAuthenticatedUserId(req);

      if (!userId) {
        return res.status(401).json({
          error: "Usuário não autenticado.",
        });
      }

      const { subscriptionId } =
        req.body || {};

      if (
        typeof subscriptionId !== "string" ||
        !/^[a-f\d]{24}$/i.test(subscriptionId)
      ) {
        return res.status(400).json({
          error:
            "Identificador de assinatura inválido.",
        });
      }

      const result = await requestBilling(
        `/api/internal/subscriptions/${subscriptionId}/confirm`,
        {
          method: "POST",
          body: {
            userId,
          },
        }
      );

      return res.json(result);
    } catch (error) {
      next(error);
    }
  }
);


// =============================================
// TRATAMENTO DE ERROS
// =============================================

function handleBillingError(
  error,
  res,
  context
) {
  console.error(
    `[SUBSCRIPTIONS ${context}]`,
    error.message
  );

  if (error.status === 503) {
    return res.status(503).json({
      error: error.message,
    });
  }

  if (
    error.name === "TimeoutError" ||
    error.name === "AbortError"
  ) {
    return res.status(504).json({
      error:
        "Tempo limite de comunicação com o serviço de assinaturas.",
    });
  }

  return res.status(502).json({
    error:
      "Serviço de assinaturas temporariamente indisponível.",
  });
}

// =============================================
// LISTAR PLANOS
// GET /api/subscriptions/plans
// =============================================

router.get(
  "/plans",
  async (req, res) => {
    try {
      if (!SUBSCRIPTIONS_API_URL) {
        return res.status(503).json({
          error:
            "Serviço de assinaturas não configurado.",
        });
      }

      const response = await fetch(
        `${SUBSCRIPTIONS_API_URL}/api/plans`,
        {
          signal: AbortSignal.timeout(
            REQUEST_TIMEOUT
          ),
        }
      );

      if (!response.ok) {
        return res.status(502).json({
          error:
            "Não foi possível consultar os planos.",
        });
      }

      const plans = await response.json();

      return res.json(plans);
    } catch (error) {
      return handleBillingError(
        error,
        res,
        "PLANS"
      );
    }
  }
);

// =============================================
// CONSULTAR ACESSO DO USUÁRIO
// GET /api/subscriptions/access
// =============================================

router.get(
  "/access",
  authenticate,
  async (req, res) => {
    try {
      const userId =
        getAuthenticatedUserId(req);

      if (
        !userId ||
        !isValidObjectId(userId)
      ) {
        return res.status(401).json({
          error:
            "Sessão inválida. Faça login novamente.",
        });
      }

      const { response, data } =
        await requestBilling(
          `/api/internal/access/${encodeURIComponent(
            userId
          )}`
        );

      if (!response.ok) {
        console.error(
          "[SUBSCRIPTIONS ACCESS]",
          response.status,
          data.error
        );

        return res.status(502).json({
          error:
            "Não foi possível verificar a assinatura.",
        });
      }

      return res.json(data);
    } catch (error) {
      return handleBillingError(
        error,
        res,
        "ACCESS"
      );
    }
  }
);

// =============================================
// INICIAR CHECKOUT
// POST /api/subscriptions/checkout
// =============================================

router.post(
  "/checkout",
  authenticate,
  async (req, res) => {
    try {
      const {
        planId,
        returnTo = "/",
      } = req.body || {};

      const userId =
        getAuthenticatedUserId(req);

      if (
        !userId ||
        !isValidObjectId(userId)
      ) {
        return res.status(401).json({
          error:
            "Sessão inválida. Faça login novamente.",
        });
      }

      if (!isValidObjectId(planId)) {
        return res.status(400).json({
          error: "Plano inválido.",
        });
      }

      const safeReturnTo =
        normalizeReturnPath(returnTo);

      const { response, data } =
        await requestBilling(
          "/api/internal/checkout",
          {
            method: "POST",

            body: JSON.stringify({
              userId,
              planId,
              returnTo: safeReturnTo,
            }),
          }
        );

      if (!response.ok) {
        const status =
          response.status >= 400 &&
          response.status < 500
            ? response.status
            : 502;

        return res.status(status).json({
          error:
            data.error ||
            "Não foi possível iniciar o pagamento.",
        });
      }

      if (
        typeof data.checkoutUrl !== "string"
      ) {
        return res.status(502).json({
          error:
            "O serviço de pagamentos não retornou uma URL de checkout.",
        });
      }

      let checkoutUrl;

      try {
        checkoutUrl = new URL(
          data.checkoutUrl
        );
      } catch {
        return res.status(502).json({
          error:
            "URL de pagamento inválida.",
        });
      }

      if (
        checkoutUrl.protocol !== "https:" ||
        !(
          checkoutUrl.hostname ===
            "mercadopago.com.br" ||
          checkoutUrl.hostname.endsWith(
            ".mercadopago.com.br"
          ) ||
          checkoutUrl.hostname ===
            "mercadopago.com" ||
          checkoutUrl.hostname.endsWith(
            ".mercadopago.com"
          )
        )
      ) {
        return res.status(502).json({
          error:
            "O serviço retornou um destino de pagamento não permitido.",
        });
      }

      return res.status(201).json({
        checkoutUrl:
          checkoutUrl.toString(),

        subscriptionId:
          data.subscriptionId,

        returnTo:
          safeReturnTo,
      });
    } catch (error) {
      return handleBillingError(
        error,
        res,
        "CHECKOUT"
      );
    }
  }
);

module.exports = router;
