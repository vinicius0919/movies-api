
const express = require("express");

const router = express.Router();

const {
  getSeries,
  getSeriesById,
  getAdminSeriesById,
  getSeriesCatalog,
  getHomeSeries,

  createSeries,
  updateSeries,
  deleteSeries,

  addSeason,
  updateSeason,
  deleteSeason,

  addEpisode,
  updateEpisode,
  deleteEpisode,

  addSeriesView,
  addEpisodeView,

  toggleFavorite,
  listFavorites,
} = require("../controllers/seriesController");

const {
  getEpisodePlayback,
} = require("../controllers/seriesPlaybackController");

const authenticate = require(
  "../middlewares/authenticate"
);

const requireAdmin = require(
  "../middlewares/requireAdmin"
);

const {
  getSeriesProgress,
  saveSeriesProgress,
} = require("../controllers/watchProgressController");

const requireActiveSubscription = require(
  "../middlewares/requireActiveSubscription"
);

// =========================================
// CATÁLOGO PÚBLICO
// =========================================

router.get("/home", getHomeSeries);

router.get("/catalog", getSeriesCatalog);

// =========================================
// FAVORITOS
// =========================================

router.get(
  "/favorites/list",
  authenticate,
  listFavorites
);

// =========================================
// LISTAGEM ADMINISTRATIVA
// =========================================

router.get(
  "/",
  authenticate,
  requireAdmin,
  getSeries
);

// =========================================
// DETALHES ADMINISTRATIVOS
// =========================================

router.get(
  "/admin/:id",
  authenticate,
  requireAdmin,
  getAdminSeriesById
);

// =========================================
// DETALHES PÚBLICOS
// =========================================

// Retorna somente séries publicadas.
// As fontes privadas são ocultadas pelo controller.

router.get("/:id", getSeriesById);

// =========================================
// AUTORIZAÇÃO DE REPRODUÇÃO
// =========================================

router.get(
  "/:id/seasons/:season/episodes/:episode/playback",
  authenticate,
  requireActiveSubscription,
  getEpisodePlayback
);

// =========================================
// PROGRESSO
// =========================================

router.get(
  "/:id/progress",
  authenticate,
  getSeriesProgress
);

router.put(
  "/:id/progress",
  authenticate,
  saveSeriesProgress
);

// =========================================
// FAVORITAR SÉRIE
// =========================================

router.patch(
  "/:id/favorite",
  authenticate,
  toggleFavorite
);

// =========================================
// ADMIN - SÉRIES
// =========================================

router.post(
  "/",
  authenticate,
  requireAdmin,
  createSeries
);

router.put(
  "/:id",
  authenticate,
  requireAdmin,
  updateSeries
);

router.delete(
  "/:id",
  authenticate,
  requireAdmin,
  deleteSeries
);

// =========================================
// ADMIN - TEMPORADAS
// =========================================

router.post(
  "/:id/seasons",
  authenticate,
  requireAdmin,
  addSeason
);

router.put(
  "/:id/seasons/:season",
  authenticate,
  requireAdmin,
  updateSeason
);

router.delete(
  "/:id/seasons/:season",
  authenticate,
  requireAdmin,
  deleteSeason
);

// =========================================
// ADMIN - EPISÓDIOS
// =========================================

router.post(
  "/:id/episodes",
  authenticate,
  requireAdmin,
  addEpisode
);

router.put(
  "/:id/seasons/:season/episodes/:episode",
  authenticate,
  requireAdmin,
  updateEpisode
);

router.delete(
  "/:id/seasons/:season/episodes/:episode",
  authenticate,
  requireAdmin,
  deleteEpisode
);

// =========================================
// VISUALIZAÇÕES
// =========================================

router.post(
  "/:id/view",
  authenticate,
  addSeriesView
);

router.post(
  "/:id/seasons/:season/episodes/:episode/view",
  authenticate,
  requireActiveSubscription,
  addEpisodeView
);

module.exports = router;
