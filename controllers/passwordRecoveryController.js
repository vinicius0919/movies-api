const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const emailService = require("../services/recoveryEmailService");
const rateLimit = require("../services/recoveryRateLimit");
const { logFailure } = require("../services/recoveryDiagnostics");
const MESSAGE = "Se houver uma conta com esse e-mail, você receberá as instruções de recuperação.";
const INVALID = "Link inválido, expirado ou já utilizado. Solicite uma nova recuperação.";
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
exports.forgotPassword = async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Informe um e-mail válido." });
  }
  let stage = "configuration";
  try {
    // Check for every request, including nonexistent accounts, to avoid enumeration.
    emailService.configuration();
    stage = "account_rate_limit";
    if (!await rateLimit.allow(`account:${email}`, 3)) return res.status(202).json({ message: MESSAGE });
    stage = "token_generation";
    const token = crypto.randomBytes(32).toString("hex");
    stage = "token_hashing";
    const tokenHash = hashToken(token);
    stage = "token_persistence";
    const user = await User.findOneAndUpdate({ email }, { $set: {
      passwordResetHash: tokenHash,
      passwordResetExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
    } });
    // SMTP runs after responding so delivery latency/errors cannot enumerate accounts.
    // 202 means accepted, never an assertion that an email was delivered.
    stage = "response";
    res.status(202).json({ message: MESSAGE });
    if (user) {
      try {
        stage = "email_delivery";
        await emailService.sendResetEmail(email, token);
      } catch (error) {
        logFailure("Email delivery failed", stage, error);
        stage = "token_cleanup";
        await User.updateOne({ _id: user._id, passwordResetHash: tokenHash }, {
          $unset: { passwordResetHash: 1, passwordResetExpiresAt: 1 },
        });
      }
    }
  } catch (error) {
    logFailure("Request unavailable", stage, error);
    if (!res.headersSent) res.status(503).json({ error: "Recuperação temporariamente indisponível. Tente novamente mais tarde." });
  }
};
exports.resetPassword = async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) {
    return res.status(400).json({ error: INVALID });
  }
  if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({ error: "A senha deve ter pelo menos 8 caracteres e no máximo 72 bytes UTF-8." });
  }
  try {
    const tokenHash = hashToken(token);
    // Cheap lookup before bcrypt; the conditional atomic update below remains authoritative.
    if (!await User.exists({ passwordResetHash: tokenHash, passwordResetExpiresAt: { $gt: new Date() } })) {
      return res.status(400).json({ error: INVALID });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.findOneAndUpdate({ passwordResetHash: tokenHash, passwordResetExpiresAt: { $gt: new Date() } }, {
      $set: { passwordHash },
      $unset: { passwordResetHash: 1, passwordResetExpiresAt: 1 },
      $inc: { sessionVersion: 1 },
    });
    if (!user) return res.status(400).json({ error: INVALID });
    res.clearCookie("miqflix_session", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
    return res.json({ message: "Senha redefinida. Entre com sua nova senha." });
  } catch {
    console.error("[PASSWORD RECOVERY] Reset unavailable");
    return res.status(503).json({ error: "Não foi possível redefinir a senha. Tente novamente mais tarde." });
  }
};
