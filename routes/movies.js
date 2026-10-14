const router = require("express").Router();

const c = require("../controllers/movieController");
const authenticate = require("../middlewares/authenticate");
const requireAdmin = require("../middlewares/requireAdmin");

// =============================================
// CONSULTAS PÚBLICAS
// =============================================

router.get("/", c.list);

router.get("/home", c.getHome);

// =============================================
// FAVORITOS DO USUÁRIO AUTENTICADO
// =============================================

// Lista os filmes favoritos do usuário
router.get(
  "/favorites/list",
  authenticate,
  c.listFavorites
);

// Adiciona ou remove um filme dos favoritos
router.patch(
  "/:id/favorite",
  authenticate,
  c.toggleFavorite
);

// =============================================
// CONSULTA DE FILME
// =============================================

router.get("/:id", c.getById);

// =============================================
// GERENCIAMENTO DE FILMES
// =============================================

router.post("/", authenticate, requireAdmin, c.create);

router.put("/:id", authenticate, requireAdmin, c.update);

router.delete("/:id", authenticate, requireAdmin, c.remove);

// =============================================
// TMDB
// =============================================

router.post(
  "/:id/refresh-tmdb",
  authenticate,
  requireAdmin,
  c.refreshTmdb
);

// =============================================
// VISUALIZAÇÕES
// =============================================

router.post(
  "/:id/view",
  c.addView
);

module.exports = router;