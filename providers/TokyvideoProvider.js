// providers/TokyvideoProvider.js

const axios = require("axios");
const IStreamProvider = require("./IStreamProvider");
const { extractMp4Url } = require("../utils/extractVideos");

class TokyvideoProvider extends IStreamProvider {
  canHandle(url) {
    try {
      return new URL(url).hostname.includes("tokyvideo.com");
    } catch {
      return false;
    }
  }

  async extractMp4(html) {
    return extractMp4Url(html); // reutiliza util existente
  }

  async stream(pageUrl, req, res) {
    const pageResponse = await axios.get(pageUrl, {
      timeout: 15000,
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const mp4Url = await this.extractMp4(pageResponse.data);

    if (!mp4Url) {
      throw new Error("MP4 não encontrado na página");
    }

    return this._proxyStream(mp4Url, pageUrl, req, res);
  }

  async _proxyStream(mp4Url, referer, req, res) {
    const response = await axios({
      method: "GET",
      url: mp4Url,
      responseType: "stream",
      decompress: false,
      timeout: 30000,
      maxRedirects: 5,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: referer,
        Origin: "https://www.tokyvideo.com",
        Accept: "*/*",
        Connection: "keep-alive",
        Range: req.headers.range || "bytes=0-",
      },
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      throw new Error(`CDN retornou ${response.status}`);
    }

    const headers = {
      "Content-Type": response.headers["content-type"] || "video/mp4",
      "Accept-Ranges": "bytes",
    };

    if (response.headers["content-length"])
      headers["Content-Length"] = response.headers["content-length"];

    if (response.headers["content-range"])
      headers["Content-Range"] = response.headers["content-range"];

    res.writeHead(response.status === 206 ? 206 : 200, headers);
    response.data.pipe(res);
  }
}

module.exports = new TokyvideoProvider();