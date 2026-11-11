
const router = require("express").Router();

const {
  stream,
  streamMovie,
} = require("../controllers/streamController");

const {
  streamSeriesEpisode,
} = require("../controllers/seriesPlaybackController");

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
// SERIES STREAMING
// =========================================

router.get(
  "/series/:id/seasons/:season/episodes/:episode",
  authenticate,
  requireActiveSubscription,
  streamSeriesEpisode
);

// =========================================
// LEGACY STREAMING
// =========================================

// Compatibilidade temporária com players antigos.
// Esta rota recebe uma URL do cliente.
// Deve ser removida após a migração completa.

router.get(
  "/",
  authenticate,
  requireActiveSubscription,
  stream
);

module.exports = router;
