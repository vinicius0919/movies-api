
module.exports = function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: "Autenticação necessária.",
    });
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({
      error: "Acesso exclusivo para administradores.",
    });
  }

  return next();
};
