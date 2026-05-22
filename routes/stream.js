
// routes/stream.js
const router = require("express").Router();
const { stream } = require("../controllers/streamController");

router.get("/", stream);

module.exports = router;