
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

const app = express();

const PORT = Number(process.env.PORT) || 3001;

// ============================================
// VALIDAÇÃO DAS VARIÁVEIS DE AMBIENTE
// ============================================

if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 32
) {
  throw new Error(
    "Configure JWT_SECRET com pelo menos 32 caracteres."
  );
}

// ============================================
// CORS
// ============================================

const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://192.168.7.8:5173",
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
  })
);

// ============================================
// MIDDLEWARES
// ============================================

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

// ============================================
// ROTAS
// ============================================

app.use("/api/auth", authRoutes);

app.use("/api/movies", moviesRoutes);
app.use("/api/series", seriesRoutes);
app.use("/api/tmdb", tmdbRoutes);
app.use("/api/stream", streamRoutes);

app.use("/api/subscriptions", subscriptionsRoutes);

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

start().catch((error) => {
  console.error("Erro ao iniciar MiqFlix:", error);
  process.exit(1);
});
