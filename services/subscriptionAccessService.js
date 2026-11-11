
const mongoose = require("mongoose");

const REQUEST_TIMEOUT = 15000;

class SubscriptionAccessError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.name = "SubscriptionAccessError";
    this.status = status;
  }
}

async function checkSubscriptionAccess(userId) {
  const id = String(userId || "");

  if (!mongoose.isValidObjectId(id)) {
    throw new SubscriptionAccessError(
      "Sessão inválida.",
      401
    );
  }

  const baseUrl = (
    process.env.SUBSCRIPTIONS_API_URL || ""
  ).replace(/\/+$/, "");

  const apiKey = process.env.INTERNAL_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new SubscriptionAccessError(
      "Verificação de assinatura indisponível.",
      503
    );
  }

  let response;

  try {
    response = await fetch(
      `${baseUrl}/api/internal/access/${encodeURIComponent(id)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "x-internal-api-key": apiKey,
        },
        signal: AbortSignal.timeout(
          REQUEST_TIMEOUT
        ),
      }
    );
  } catch (error) {
    console.error(
      "[SUBSCRIPTION ACCESS] Falha de comunicação:",
      error.message
    );

    throw new SubscriptionAccessError(
      "Não foi possível verificar sua assinatura.",
      503
    );
  }

  if (!response.ok) {
    console.error(
      "[SUBSCRIPTION ACCESS] Resposta HTTP:",
      response.status
    );

    throw new SubscriptionAccessError(
      "Serviço de assinaturas indisponível.",
      503
    );
  }

  let access;

  try {
    access = await response.json();
  } catch {
    throw new SubscriptionAccessError(
      "Resposta inválida do serviço de assinaturas.",
      503
    );
  }

  if (
    !access ||
    typeof access !== "object" ||
    typeof access.hasAccess !== "boolean"
  ) {
    throw new SubscriptionAccessError(
      "Não foi possível validar o acesso.",
      503
    );
  }

  return access;
}

module.exports = {
  checkSubscriptionAccess,
  SubscriptionAccessError,
};
