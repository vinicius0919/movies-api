const express = require("express");

const {
  streamVideo,
} = require(
  "../services/tokyvideoService"
);

const router = express.Router();

router.get("/", streamVideo);

module.exports = router;