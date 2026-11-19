const router = require("express").Router();
const authenticate = require("../middlewares/authenticate");
const requireAdmin = require("../middlewares/requireAdmin");
const controller = require("../controllers/contentImportController");

router.use(authenticate, requireAdmin);
router.post("/analyze", controller.analyze);
router.post("/batches", controller.createBatch);
router.post("/structured-batches", controller.createStructuredBatch);
router.get("/", controller.list);
router.patch("/:id", controller.updatePrepared);
router.get("/:id/history", controller.history);
router.post("/:id/validate", controller.validate);
router.post("/:id/tmdb-link", controller.linkTmdb);
router.post("/:id/validation-confirm", controller.confirmValidation);
router.post("/batch/preview", controller.previewOperation);
router.post("/batch/process", controller.processOperation);
router.get("/:id", controller.getById);

module.exports = router;
