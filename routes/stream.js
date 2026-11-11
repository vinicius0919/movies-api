
const router = require("express").Router();

const {
  stream,
  streamMovie,
} = require("../controllers/streamController");

const authenticate = require(
  "../middlewares/authenticate"
);

const requireActiveSubscription = require(
  "../middlewares/requireActiveSubscription"
);

// =========================================
// MOVIE STREAMING
// =========================================

router.get(
  "/movies/:id",
  authenticate,
  requireActiveSubscription,
  streamMovie
);

// =========================================
// LEGACY STREAMING
// =========================================

// Compatibilidade temporária.
// Remover após migrar todos os players,
// pois aceita uma URL fornecida pelo cliente.

router.get(
  "/",
  authenticate,
  requireActiveSubscription,
  stream
);

module.exports = router;
