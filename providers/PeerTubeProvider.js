// providers/PeerTubeProvider.js

const IStreamProvider = require("./IStreamProvider");

// Instâncias públicas conhecidas — expansível
const PEERTUBE_HOSTS = [
  "peertube.tv",
  "tube.tchncs.de",
  "video.ploud.fr",
  "peertube.social",
];

class PeerTubeProvider extends IStreamProvider {
  canHandle(url) {
    try {
      const { hostname } = new URL(url);
      return PEERTUBE_HOSTS.some((h) => hostname.includes(h))
        || url.includes("/videos/watch/"); // padrão universal PeerTube
    } catch { return false; }
  }

  extractVideoId(url) {
    const match = url.match(/\/videos\/watch\/([a-f0-9-]{36})/);
    return match ? match[1] : null;
  }

  async extractMp4(_html) { return null; }

  async stream(url, _req, res) {
    const { hostname } = new URL(url);
    const videoId = this.extractVideoId(url);

    if (!videoId)
      return res.status(400).json({ error: "UUID do vídeo PeerTube inválido" });

    res.json({
      provider: "peertube",
      videoId,
      embedUrl: `https://${hostname}/videos/embed/${videoId}?autoplay=1`,
    });
  }
}

module.exports = new PeerTubeProvider();