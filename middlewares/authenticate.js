
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/User");

module.exports = async function authenticate(
  req,
  res,
  next
) {
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
      {
        algorithms: ["HS256"],
      }
    );
  } catch {
    return res.status(401).json({
      error: "Sessão inválida ou expirada.",
    });
  }

  const userId = payload?.sub;

  if (
    typeof userId !== "string" ||
    !mongoose.isValidObjectId(userId)
  ) {
    return res.status(401).json({
      error: "Sessão inválida.",
    });
  }

  try {
    const user = await User.findById(userId);

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
