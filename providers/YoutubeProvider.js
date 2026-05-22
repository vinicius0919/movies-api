// providers/YoutubeProvider.js

const IStreamProvider = require("./IStreamProvider");

class YoutubeProvider extends IStreamProvider {
  canHandle(url) {
    try {
      const { hostname } = new URL(url);
      return (
        hostname.includes("youtube.com") ||
        hostname.includes("youtu.be")
      );
    } catch {
      return false;
    }
  }

  extractVideoId(url) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes("youtu.be")) {
        return parsed.pathname.slice(1);
      }
      return parsed.searchParams.get("v");
    } catch {
      return null;
    }
  }

  // YouTube não tem MP4 extraível legitimamente
  async extractMp4(_html) {
    return null;
  }

  /**
   * Não faz stream — responde com os dados necessários
   * para o frontend montar o embed do player oficial.
   */
  async stream(url, req, res) {
    const videoId = this.extractVideoId(url);

    if (!videoId) {
      return res.status(400).json({ error: "ID do vídeo inválido" });
    }

    // Responde com JSON em vez de bytes de vídeo
    // O frontend detecta esse content-type e renderiza o iframe
    res.json({
      provider: "youtube",
      videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      watchUrl: url,
    });
  }
}

module.exports = new YoutubeProvider();