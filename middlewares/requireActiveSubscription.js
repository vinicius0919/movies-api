
const createSubscriptionMiddleware = require(
  "./requireSubscription"
);

const {
  checkSubscriptionAccess,
} = require("../services/subscriptionAccess");

// =========================================
// CHECK USER SUBSCRIPTION
// =========================================

async function checkUserSubscription(userId) {
  const access = await checkSubscriptionAccess(
    userId
  );

  // Apenas true libera o acesso.
  return access?.hasAccess === true;
}

// =========================================
// INITIALIZE MIDDLEWARE
// =========================================

const requireActiveSubscription =
  createSubscriptionMiddleware(
    checkUserSubscription
  );

module.exports = requireActiveSubscription;
