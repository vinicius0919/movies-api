// providers/VimeoProvider.js

const IStreamProvider = require("./IStreamProvider");

class VimeoProvider extends IStreamProvider {
  canHandle(url) {
    try {
      return new URL(url).hostname.includes("vimeo.com");
    } catch { return false; }
  }

  extractVideoId(url) {
    // vimeo.com/123456789 ou player.vimeo.com/video/123456789
    const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    return match ? match[1] : null;
  }

  async extractMp4(_html) { return null; }

  async stream(url, _req, res) {
    const videoId = this.extractVideoId(url);
    if (!videoId)
      return res.status(400).json({ error: "ID do vídeo Vimeo inválido" });

    res.json({
      provider: "vimeo",
      videoId,
      embedUrl: `https://player.vimeo.com/video/${videoId}?autoplay=1&title=0&byline=0`,
    });
  }
}

module.exports = new VimeoProvider();