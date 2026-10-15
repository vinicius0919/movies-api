const express = require("express");

const router = express.Router();

const {
  getSeries,
  getSeriesById,
  createSeries,
  updateSeries,
  deleteSeries,

  addSeason,
  updateSeason,
  deleteSeason,

  addEpisode,
  updateEpisode,
  deleteEpisode,

  getHomeSeries,
  getSeriesCatalog,

  addSeriesView,
  addEpisodeView,

  toggleFavorite,
  listFavorites,
  getEpisodePlayback,
} = require("../controllers/seriesController");

// =========================================
// AUTH MIDDLEWARES
// =========================================

// Ajuste este import para o caminho e a exportação
// do middleware de autenticação existente no projeto.
const authenticate = require("../middlewares/authenticate");
const {
  getSeriesProgress,
  saveSeriesProgress,
} = require("../controllers/watchProgressController");

// Somente administradores podem alterar o catálogo.
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") {
    return res.status(403).json({
      error: "Acesso restrito a administradores",
    });
  }

  next();
};

// =========================================
// HOME
// =========================================

router.get("/home", getHomeSeries);

// =========================================
// CATALOG
// =========================================

router.get("/catalog", getSeriesCatalog);

// =========================================
// FAVORITES
// =========================================

// IMPORTANTE:
// Rotas específicas antes de /:id.

router.get("/favorites/list", authenticate, listFavorites);

router.patch("/:id/favorite", authenticate, toggleFavorite);

// =========================================
// SERIES - READ
// =========================================

router.get("/", getSeries);

router.get("/:id", getSeriesById);

router.get(
  "/:id/seasons/:season/episodes/:episode/playback",
  authenticate,
  getEpisodePlayback,
);
router.get("/:id/progress", authenticate, getSeriesProgress);

router.put("/:id/progress", authenticate, saveSeriesProgress);
// =========================================
// SERIES - ADMIN
// =========================================

router.post("/", authenticate, requireAdmin, createSeries);

router.put("/:id", authenticate, requireAdmin, updateSeries);

router.delete("/:id", authenticate, requireAdmin, deleteSeries);

// =========================================
// SEASONS - ADMIN
// =========================================

router.post("/:id/seasons", authenticate, requireAdmin, addSeason);

router.put("/:id/seasons/:season", authenticate, requireAdmin, updateSeason);

router.delete("/:id/seasons/:season", authenticate, requireAdmin, deleteSeason);

// =========================================
// EPISODES - ADMIN
// =========================================

// Mantém o endpoint antigo de cadastro,
// inclusive a criação automática da temporada.

router.post("/:id/episodes", authenticate, requireAdmin, addEpisode);

router.put(
  "/:id/seasons/:season/episodes/:episode",
  authenticate,
  requireAdmin,
  updateEpisode,
);

router.delete(
  "/:id/seasons/:season/episodes/:episode",
  authenticate,
  requireAdmin,
  deleteEpisode,
);

// =========================================
// VIEWS
// =========================================

// Contagem de acesso à página da série.
router.post("/:id/view", authenticate, addSeriesView);

// Contagem de reprodução do episódio.
// O controle de assinatura deve ser aplicado
// aqui se este endpoint fizer parte do fluxo
// de reprodução protegida.
router.post(
  "/:id/seasons/:season/episodes/:episode/view",
  authenticate,
  addEpisodeView,
);

module.exports = router;
