const axios = require("axios");

const {
  extractMp4Url,
} = require("../utils/extractVideos");

async function getVideoData(pageUrl) {
  const response = await axios.get(pageUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0",
    },
  });

  const html = response.data;

  const videoUrl = extractMp4Url(html);

  if (!videoUrl) {
    throw new Error("Vídeo não encontrado");
  }

  return {
    success: true,
    videoUrl,
  };
}

async function streamVideo(req, res) {
  try {
    const videoUrl = req.query.url;

    if (!videoUrl) {
      return res.status(400).send("URL ausente");
    }

    const range = req.headers.range;

    const response = await axios({
      method: "GET",
      url: videoUrl,
      responseType: "stream",
      headers: {
        Referer: "https://www.tokyvideo.com/",
        Origin: "https://www.tokyvideo.com",
        Range: range || "bytes=0-",
        "User-Agent":
          "Mozilla/5.0",
      },
    });

    res.setHeader(
      "Content-Type",
      response.headers["content-type"]
    );

    res.setHeader(
      "Content-Length",
      response.headers["content-length"]
    );

    res.setHeader(
      "Accept-Ranges",
      "bytes"
    );

    if (response.headers["content-range"]) {
      res.setHeader(
        "Content-Range",
        response.headers["content-range"]
      );

      res.status(206);
    }

    response.data.pipe(res);
  } catch (error) {
    console.error(error.message);

    res.status(500).send("Erro no streaming");
  }
}

module.exports = {
  getVideoData,
  streamVideo,
};