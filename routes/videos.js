const express = require("express");

const {
  getVideoData,
  streamVideo,
} = require("../services/tokyvideoService");

const router = express.Router();

router.get("/extract", async (req, res) => {
  try {
    const pageUrl = req.query.url;

    if (!pageUrl) {
      return res.status(400).json({
        error: "URL obrigatória",
      });
    }

    const data = await getVideoData(pageUrl);

    res.json(data);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erro ao extrair vídeo",
    });
  }
});

router.get("/stream", streamVideo);

module.exports = router;