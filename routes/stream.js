
const router = require("express").Router();

const {
  stream,
} = require("../controllers/streamController");



const authenticate = require("../middlewares/authenticate");
const requireSubscription = require("../middlewares/requireSubscription");

router.get(
  "/", authenticate,
  stream
);

module.exports = router;
