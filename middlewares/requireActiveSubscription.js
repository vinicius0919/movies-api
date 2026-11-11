
const createSubscriptionMiddleware = require(
  "./requireSubscription"
);

const {
  checkSubscriptionAccess,
} = require("../services/subscriptionAccessService");

// Converte a resposta do serviço em booleano.
async function checkUserSubscription(userId) {
  const access = await checkSubscriptionAccess(userId);

  return access.hasAccess === true;
}

// Exporta o middleware já inicializado.
module.exports = createSubscriptionMiddleware(
  checkUserSubscription
);
