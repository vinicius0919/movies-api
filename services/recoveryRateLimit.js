const crypto = require("node:crypto");
const { logFailure } = require("./recoveryDiagnostics");
const Counter = require("../models/RecoveryRateLimit");
const WINDOW_MS = 30 * 60 * 1000;
async function allow(key, limit) {
  const bucket = Math.floor(Date.now() / WINDOW_MS);
  const id = crypto.createHash("sha256").update(`${bucket}:${key}`).digest("hex");
  const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 2) * WINDOW_MS) } };
  let counter;
  try {
    counter = await Counter.findOneAndUpdate({ _id: id }, update, { upsert: true, returnDocument: "after" });
  } catch (error) {
    if (error.code !== 11000) throw error;
    counter = await Counter.findOneAndUpdate({ _id: id }, update, { returnDocument: "after" });
  }
  return counter.count <= limit;
}
function ipLimit(action, limit) {
  return async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try {
      // Do not trust arbitrary forwarded headers. Express trust proxy is configured by the operator.
      if (!await allow(`${action}:ip:${req.ip}`, limit)) {
        res.set("Retry-After", String(WINDOW_MS / 1000));
        return res.status(429).json({ error: "Muitas tentativas. Tente novamente em 30 minutos." });
      }
      next();
    } catch (error) {
      logFailure("Rate limit storage unavailable", "ip_rate_limit", error);
      res.status(503).json({ error: "Recuperação temporariamente indisponível." });
    }
  };
}
module.exports = { allow, ipLimit };
