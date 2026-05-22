// providers/ArchiveOrgProvider.js

const axios = require("axios");
const IStreamProvider = require("./IStreamProvider");

class ArchiveOrgProvider extends IStreamProvider {
  canHandle(url) {
    try {
      return new URL(url).hostname.includes("archive.org");
    } catch { return false; }
  }

  /**
   * Archive.org tem API pública que lista os arquivos do item.
   * Retorna a URL do MP4 sem nenhum scraping.
   */
  async resolveMp4Url(pageUrl) {
    const identifier = this._extractIdentifier(pageUrl);
    if (!identifier) throw new Error("Identifier não encontrado");

    const { data } = await axios.get(
      `https://archive.org/metadata/${identifier}`,
      { timeout: 10000 }
    );

    const mp4File = data.files?.find(
      (f) => f.name.endsWith(".mp4") && f.source === "derivative"
    ) || data.files?.find((f) => f.name.endsWith(".mp4"));

    if (!mp4File) throw new Error("MP4 não encontrado no item");

    return `https://archive.org/download/${identifier}/${mp4File.name}`;
  }

  async extractMp4(html) {
    // Fallback via HTML caso a API falhe
    const match = html.match(/https?:\/\/archive\.org\/download\/[^"' ]+\.mp4/);
    return match ? match[0] : null;
  }

  async stream(pageUrl, req, res) {
    const mp4Url = await this.resolveMp4Url(pageUrl);

    const response = await axios({
      method: "GET",
      url: mp4Url,
      responseType: "stream",
      decompress: false,
      timeout: 30000,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Range: req.headers.range || "bytes=0-",
      },
      validateStatus: () => true,
    });

    if (response.status >= 400)
      throw new Error(`Archive.org CDN retornou ${response.status}`);

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

  _extractIdentifier(url) {
    // https://archive.org/details/IDENTIFIER
    // https://archive.org/embed/IDENTIFIER
    const match = url.match(/archive\.org\/(?:details|embed|download)\/([^/?#]+)/);
    return match ? match[1] : null;
  }
}

module.exports = new ArchiveOrgProvider();