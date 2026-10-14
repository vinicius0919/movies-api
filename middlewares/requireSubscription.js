module.exports = function createSubscriptionMiddleware(
  checkUserSubscription
) {
  return async function requireSubscription(req, res, next) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Autenticação necessária.",
        });
      }

      // Administrador tem acesso total.
      if (req.user.role === "admin") {
        return next();
      }

      // Usa a verificação real de assinatura.
      const hasAccess = await checkUserSubscription(
        req.user._id
      );

      if (!hasAccess) {
        return res.status(403).json({
          error: "Assinatura ativa necessária.",
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
};