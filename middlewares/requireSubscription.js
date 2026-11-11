
module.exports = function createSubscriptionMiddleware(
  checkUserSubscription
) {
  if (typeof checkUserSubscription !== "function") {
    throw new TypeError(
      "checkUserSubscription deve ser uma função."
    );
  }

  return async function requireSubscription(
    req,
    res,
    next
  ) {
    if (!req.user) {
      return res.status(401).json({
        error: "Autenticação necessária.",
        code: "AUTH_REQUIRED",
      });
    }

    // Administradores possuem acesso
    // à reprodução para fins de gerenciamento.
    if (req.user.role === "admin") {
      return next();
    }

    const userId =
      req.user._id ||
      req.user.id ||
      req.user.userId;

    if (!userId) {
      return res.status(401).json({
        error: "Sessão inválida.",
        code: "AUTH_REQUIRED",
      });
    }

    try {
      const hasAccess =
        await checkUserSubscription(userId);

      // Somente o booleano true autoriza.
      // Objetos, null e undefined não liberam acesso.
      if (hasAccess !== true) {
        return res.status(403).json({
          error: "Assinatura ativa necessária.",
          code: "SUBSCRIPTION_REQUIRED",
        });
      }

      return next();
    } catch (error) {
      console.error(
        "[SUBSCRIPTION MIDDLEWARE]",
        error.message
      );

      return res.status(503).json({
        error:
          "Não foi possível verificar sua assinatura. Tente novamente.",
        code: "SUBSCRIPTION_UNAVAILABLE",
      });
    }
  };
};
