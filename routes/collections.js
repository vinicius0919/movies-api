
const router = require("express").Router();

const controller = require(
  "../controllers/collectionController"
);

const authenticate = require(
  "../middlewares/authenticate"
);

const requireAdmin = require(
  "../middlewares/requireAdmin"
);

// ========================================
// PUBLIC
// ========================================

router.get(
  "/",
  controller.listPublic
);

// ========================================
// ADMIN
// ========================================

router.get(
  "/admin",
  authenticate,
  requireAdmin,
  controller.listAdmin
);

router.post(
  "/",
  authenticate,
  requireAdmin,
  controller.create
);

router.put(
  "/:id",
  authenticate,
  requireAdmin,
  controller.update
);

router.delete(
  "/:id",
  authenticate,
  requireAdmin,
  controller.remove
);

module.exports = router;
