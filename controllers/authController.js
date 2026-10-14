
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const COOKIE_NAME = "miqflix_session";

function createToken(user) {
  return jwt.sign(
    { sub: String(user._id) },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d",
      algorithm: "HS256",
    }
  );
}

function setSession(res, user) {
  const token = createToken(user);

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body || {};

    const normalizedName =
      typeof name === "string" ? name.trim() : "";

    const normalizedEmail =
      typeof email === "string"
        ? email.trim().toLowerCase()
        : "";

    if (
      !normalizedName ||
      normalizedName.length > 150 ||
      normalizedEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
      typeof password !== "string" ||
      password.length < 8 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({
        error: "Dados inválidos. A senha deve ter pelo menos 8 caracteres.",
      });
    }

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        error: "Este e-mail já está cadastrado.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: normalizedName,
      email: normalizedEmail,
      passwordHash,
    });

    setSession(res, user);

    return res.status(201).json({
      message: "Cadastro realizado com sucesso.",
      user: publicUser(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: "Este e-mail já está cadastrado.",
      });
    }

    console.error("Erro no cadastro:", error.message);

    return res.status(500).json({
      error: "Erro ao criar conta.",
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        error: "Informe e-mail e senha.",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+passwordHash");

    if (!user) {
      return res.status(401).json({
        error: "E-mail ou senha inválidos.",
      });
    }

    const validPassword = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!validPassword) {
      return res.status(401).json({
        error: "E-mail ou senha inválidos.",
      });
    }

    setSession(res, user);

    return res.json({
      message: "Login realizado com sucesso.",
      user: publicUser(user),
    });
  } catch (error) {
    console.error("Erro no login:", error.message);

    return res.status(500).json({
      error: "Erro ao realizar login.",
    });
  }
};

exports.logout = (_req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  return res.json({
    message: "Sessão encerrada.",
  });
};
