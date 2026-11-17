const TRUSTED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://192.168.7.8:5173",
  "http://192.168.1.2:5173",
  "https://endless-properly-unicorn.ngrok-free.app",
  process.env.FRONTEND_URL,
]
  .filter(Boolean)
  .map((origin) => origin.replace(/\/+$/, ""));

function getOriginFromRequest(req) {
  const origin = req.get("origin");
  if (origin) return origin;

  const referer = req.get("referer");
  if (!referer) return null;

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

module.exports = function requireCsrfOrigin(req, res, next) {
  const origin = getOriginFromRequest(req);

  if (!origin || !TRUSTED_ORIGINS.includes(origin)) {
    return res.status(403).json({
      error: "Origem não autorizada.",
    });
  }

  return next();
};
