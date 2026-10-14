
const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async function authenticate(req, res, next) {
  const token = req.cookies?.miqflix_session;

  if (!token) {
    return res.status(401).json({
      error: "Autenticação necessária.",
    });
  }

  let payload;

  try {
    payload = jwt.verify(
      token,
      process.env.JWT_SECRET,
      { algorithms: ["HS256"] }
    );
  } catch {
    return res.status(401).json({
      error: "Sessão inválida ou expirada.",
    });
  }

  if (
    typeof payload.sub !== "string" ||
    !payload.sub
  ) {
    return res.status(401).json({
      error: "Sessão inválida.",
    });
  }

  try {
    const user = await User.findById(payload.sub);

    if (!user) {
      return res.status(401).json({
        error: "Usuário não encontrado.",
      });
    }

    req.user = user;

    return next();
  } catch (error) {
    return next(error);
  }
};
