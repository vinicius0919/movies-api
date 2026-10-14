
const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async function authenticate(req, res, next) {
  const token = req.cookies?.miqflix_session;

  if (!token) {
    return res.status(401).json({
      error: "Autenticação necessária.",
    });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET,
      { algorithms: ["HS256"] }
    );

    const user = await User.findById(payload.sub);

    if (!user) {
      return res.status(401).json({
        error: "Usuário não encontrado.",
      });
    }

    req.user = user;

    next();
  } catch {
    return res.status(401).json({
      error: "Sessão inválida ou expirada.",
    });
  }
};
