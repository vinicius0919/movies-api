require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const connectDatabase = require("./config/database");

const authRoutes = require("./routes/auth");
const moviesRoutes = require("./routes/movies");
const seriesRoutes = require("./routes/series");
const tmdbRoutes = require("./routes/tmdb");
const streamRoutes = require("./routes/stream");
const subscriptionsRoutes = require("./routes/subscriptions");
const adminSubscriptionsRoutes = require("./routes/adminSubscriptions");
const collectionsRoutes =  require("./routes/collections")
const app = express();
// Set exact trusted proxy IPs/CIDRs in deployment; never blindly trust client headers.
if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY.split(",").map((value) => value.trim()));

const PORT = Number(process.env.PORT) || 3001;

// ============================================
// VALIDAÇÃO DAS VARIÁVEIS DE AMBIENTE
// ============================================

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error("Configure JWT_SECRET com pelo menos 32 caracteres.");
}

// ============================================
// CORS
// ============================================

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://192.168.7.11:5173",
  "http://192.168.1.2:5173",
  "https://endless-properly-unicorn.ngrok-free.app/",
  process.env.FRONTEND_URL,
]
  .filter(Boolean)
  .map((origin) => origin.replace(/\/+$/, ""));

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origem não permitida pelo CORS"));
    },
    credentials: true,
  }),
);

// ============================================
// MIDDLEWARES
// ============================================

app.use(["/api/auth/forgot-password", "/api/auth/reset-password"], (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

// ============================================
// ROTAS
// ============================================

app.use("/api/auth", authRoutes);

app.use("/api/movies", moviesRoutes);
app.use("/api/series", seriesRoutes);
app.use("/api/tmdb", tmdbRoutes);
app.use("/api/collections", collectionsRoutes);
app.use("/api/stream", streamRoutes);
app.use("/api/subscriptions", subscriptionsRoutes);
app.use("/api/admin/subscriptions", adminSubscriptionsRoutes);

// ============================================
// HEALTH CHECK
// ============================================

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "miqflix-api",
  });
});

// ============================================
// ROTA NÃO ENCONTRADA
// ============================================

app.use((req, res) => {
  res.status(404).json({
    error: "Rota não encontrada",
    path: req.originalUrl,
  });
});

// ============================================
// TRATAMENTO DE ERROS
// ============================================

app.use((error, req, res, next) => {
  if (/^\/api\/auth\/(forgot-password|reset-password)(?:\/|$)/.test(req.path)) {
    // Body parser errors may contain the raw body. Never log the error object here.
    console.error("[PASSWORD RECOVERY] Request processing failed");
    const status = error.message === "Origem não permitida pelo CORS" ? 403 : error.type === "entity.parse.failed" ? 400 : error.type === "entity.too.large" ? 413 : 500;
    return res.status(status).json({ error: status === 500 ? "Erro interno do servidor" : "Dados da solicitação inválidos." });
  }
  console.error("[MIQFLIX ERROR]", error);

  if (error.message === "Origem não permitida pelo CORS") {
    return res.status(403).json({
      error: "Origem não permitida",
    });
  }

  res.status(500).json({
    error: "Erro interno do servidor",
  });
});

// ============================================
// INICIALIZAÇÃO
// ============================================

async function start() {
  await connectDatabase();

  app.listen(PORT, () => {
    console.log(`MiqFlix API iniciada na porta ${PORT}`);
  });
}

if (require.main === module) start().catch((error) => {
  console.error("Erro ao iniciar MiqFlix:", error);
  process.exit(1);
});

module.exports = app;
