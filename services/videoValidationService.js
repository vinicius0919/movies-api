const axios = require("axios");

async function validateVideoUrl(url) {
  try {
    if (!url.startsWith("http")) {
      return false;
    }

    if (
      !url.includes(".mp4") &&
      !url.includes(".m3u8")
    ) {
      return false;
    }

    const response = await axios({
      method: "GET",
      url,
      headers: {
        Range: "bytes=0-1",
        Referer:
          "https://www.tokyvideo.com/",
        Origin:
          "https://www.tokyvideo.com",
        "User-Agent":
          "Mozilla/5.0",
      },
      validateStatus: () => true,
    });

    return (
      response.status === 200 ||
      response.status === 206
    );
  } catch (error) {
    return false;
  }
}

module.exports = {
  validateVideoUrl,
};