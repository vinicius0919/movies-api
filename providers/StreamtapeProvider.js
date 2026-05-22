// providers/StreamtapeProvider.js

const axios = require("axios");
const IStreamProvider = require("./IStreamProvider");

class StreamtapeProvider extends IStreamProvider {
  canHandle(url) {
    try {
      return new URL(url).hostname.includes("streamtape.com");
    } catch {
      return false;
    }
  }

  async extractMp4(html) {
    // Streamtape ofusca a URL em JS; padrão específico do site
    const match = html.match(
      /id="ideoolink"[^>]*>[^<]*<\/span>'([^']+)'/
    ) || html.match(/\.mp4[^"' ]*/g);

    if (!match) return null;
    const raw = match[1] || match[0];
    return raw.startsWith("http") ? raw : `https:${raw}`;
  }

  async stream(pageUrl, req, res) {
    const pageResponse = await axios.get(pageUrl, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://streamtape.com",
      },
    });

    const mp4Url = await this.extractMp4(pageResponse.data);

    if (!mp4Url) throw new Error("MP4 não encontrado no Streamtape");

    const response = await axios({
      method: "GET",
      url: mp4Url,
      responseType: "stream",
      decompress: false,
      timeout: 30000,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: pageUrl,
        Range: req.headers.range || "bytes=0-",
      },
      validateStatus: () => true,
    });

    if (response.status >= 400)
      throw new Error(`Streamtape CDN retornou ${response.status}`);

    res.writeHead(response.status === 206 ? 206 : 200, {
      "Content-Type": response.headers["content-type"] || "video/mp4",
      "Accept-Ranges": "bytes",
      ...(response.headers["content-length"] && {
        "Content-Length": response.headers["content-length"],
      }),
      ...(response.headers["content-range"] && {
        "Content-Range": response.headers["content-range"],
      }),
    });

    response.data.pipe(res);
  }
}

module.exports = new StreamtapeProvider();