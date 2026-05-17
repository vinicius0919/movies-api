const express = require("express");

const axios = require("axios");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const videoUrl = req.query.url;

    const response = await axios({
      method: "GET",
      url: videoUrl,
      responseType: "stream",
      headers: {
        Referer:
          "https://www.tokyvideo.com/",
        Origin:
          "https://www.tokyvideo.com",
        "User-Agent":
          "Mozilla/5.0",
        Range:
          req.headers.range ||
          "bytes=0-",
      },
    });

    res.setHeader(
      "Content-Type",
      response.headers[
        "content-type"
      ]
    );

    res.setHeader(
      "Content-Length",
      response.headers[
        "content-length"
      ]
    );

    res.setHeader(
      "Accept-Ranges",
      "bytes"
    );

    if (
      response.headers[
        "content-range"
      ]
    ) {
      res.setHeader(
        "Content-Range",
        response.headers[
          "content-range"
        ]
      );

      res.status(206);
    }

    response.data.pipe(res);
  } catch (error) {
    console.error(error.message);

    res.status(500).send(
      "Erro no streaming"
    );
  }
});

module.exports = router;