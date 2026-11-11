
const router = require("express").Router();

const {
  stream,
  streamMovie,
} = require("../controllers/streamController");

const {
  streamSeriesEpisode,
} = require("../controllers/seriesPlaybackController");

const authenticate = require("../middlewares/authenticate");
const requireActiveSubscription = require("../middlewares/requireActiveSubscription");

// Filmes: mantém o endpoint existente.
router.get(
  "/movies/:id",
  authenticate,
  requireActiveSubscription,
  streamMovie
);

// Séries: mesma infraestrutura de streaming dos filmes.
router.get(
  "/series/:id/seasons/:season/episodes/:episode",
  authenticate,
  requireActiveSubscription,
  streamSeriesEpisode
);

// Legado: manter apenas até migrar os consumidores antigos.
// Recebe uma URL do cliente; revisar proteção contra SSRF antes de manter em produção.
router.get(
  "/",
  authenticate,
  requireActiveSubscription,
  stream
);

module.exports = router;
