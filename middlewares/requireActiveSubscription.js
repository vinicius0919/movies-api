
const createSubscriptionMiddleware = require(
  "./requireSubscription"
);

const {
  checkSubscriptionAccess,
} = require(
  "../services/subscriptionAccessService"
);

async function checkUserSubscription(userId) {
  const access = await checkSubscriptionAccess(
    userId
  );

  return access?.hasAccess === true;
}

module.exports = createSubscriptionMiddleware(
  checkUserSubscription
);
