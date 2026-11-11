
const router = require("express").Router();

const {
  stream,
  streamMovie,
} = require("../controllers/streamController");

const authenticate = require(
  "../middlewares/authenticate"
);

const requireActiveSubscription = require(
  "../middlewares/requireActiveSubscription"
);

// Nova rota: streaming por ID.
router.get(
  "/movies/:id",
  authenticate,
  requireActiveSubscription,
  streamMovie
);

// Rota antiga: manter somente durante
// a migração dos players.
// Ela ainda aceita URLs do cliente.
router.get(
  "/",
  authenticate,
  requireActiveSubscription,
  stream
);

module.exports = router;
