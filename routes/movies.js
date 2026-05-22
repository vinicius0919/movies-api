// routes/movies.js
const router = require("express").Router();
const c = require("../controllers/movieController");

router.get("/",                   c.list);
router.get("/favorites/list",     c.listFavorites);
router.get("/:id",                c.getById);
router.post("/",                  c.create);
router.put("/:id",                c.update);
router.delete("/:id",             c.remove);
router.patch("/:id/favorite",     c.toggleFavorite);
router.post("/:id/refresh-tmdb",  c.refreshTmdb);

module.exports = router;