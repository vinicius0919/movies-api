// tokyvideoService.js

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
    const pageUrl =
      req.query.page;

    if (!pageUrl) {
      return res
        .status(400)
        .send("Página ausente");
    }

    if (
      !pageUrl.includes(
        "tokyvideo.com"
      )
    ) {
      return res
        .status(400)
        .send("Página inválida");
    }

    // baixa página
    const pageResponse =
      await axios.get(pageUrl, {
        timeout: 15000,

        headers: {
          "User-Agent":
            "Mozilla/5.0",
        },
      });

    // extrai mp4
    const videoUrl =
      extractMp4Url(
        pageResponse.data
      );

    console.log(
      "MP4:",
      videoUrl
    );

    if (!videoUrl) {
      return res
        .status(404)
        .send(
          "Vídeo não encontrado"
        );
    }

    const range =
      req.headers.range;

    // stream do vídeo
    const response =
      await axios({
        method: "GET",

        url: videoUrl,

        responseType: "stream",

        decompress: false,

        timeout: 30000,

        maxRedirects: 5,

        headers: {
          "User-Agent":
            "Mozilla/5.0",

          Referer: pageUrl,

          Origin:
            "https://www.tokyvideo.com",

          Accept: "*/*",

          Connection:
            "keep-alive",

          Range:
            range || "bytes=0-",
        },

        validateStatus:
          () => true,
      });

    console.log(
      "CDN STATUS:",
      response.status
    );

    if (
      response.status >= 400
    ) {
      return res
        .status(response.status)
        .send("Erro CDN");
    }

    const headers = {
      "Content-Type":
        response.headers[
          "content-type"
        ] || "video/mp4",

      "Accept-Ranges":
        "bytes",
    };

    if (
      response.headers[
        "content-length"
      ]
    ) {
      headers[
        "Content-Length"
      ] =
        response.headers[
          "content-length"
        ];
    }

    if (
      response.headers[
        "content-range"
      ]
    ) {
      headers[
        "Content-Range"
      ] =
        response.headers[
          "content-range"
        ];
    }

    res.writeHead(
      response.status === 206
        ? 206
        : 200,
      headers
    );

    response.data.pipe(res);
  } catch (error) {
    console.error(
      "STREAM ERROR:"
    );

    console.error(
      error.response?.status
    );

    console.error(
      error.message
    );

    res
      .status(500)
      .send(
        "Erro no streaming"
      );
  }
}

module.exports = {
  getVideoData,
  streamVideo,
};