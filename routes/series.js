
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
  getEpisodePlayback,
} = require("../controllers/seriesController");

const authenticate = require("../middlewares/authenticate");
const requireAdmin = require("../middlewares/requireAdmin");

const {
  getSeriesProgress,
  saveSeriesProgress,
} = require("../controllers/watchProgressController");

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

// Mantemos GET /series para compatibilidade
// com o frontend administrativo existente,
// mas agora exigindo permissões de admin.

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

// O controller deve retornar somente séries
// publicadas e ocultar fontes de reprodução.

router.get("/:id", getSeriesById);

// =========================================
// REPRODUÇÃO
// =========================================

// PENDENTE:
// Adicionar verificação de assinatura
// antes de disponibilizar a fonte de mídia.
// Não alteramos esse fluxo sem revisar
// o módulo de assinaturas.


router.get(
  "/:id/seasons/:season/episodes/:episode/playback",
  authenticate,
  requireSubscription,
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
  requireSubscription,
  addEpisodeView
);


module.exports = router;
