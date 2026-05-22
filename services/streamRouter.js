// services/streamRouter.js

// services/streamRouter.js

const tokyvideoProvider  = require("../providers/TokyvideoProvider");
const streamtapeProvider = require("../providers/StreamtapeProvider");
const youtubeProvider    = require("../providers/YoutubeProvider"); // ← adiciona
const VimeoProvider = require("../providers/VimeoProvider");
const PeerTubeProvider = require("../providers/PeerTubeProvider");
const ArchiveOrgProvider = require("../providers/ArchiveOrgProvider");
/**
 * Ordem de preferência dos providers.
 * StreamRouter tenta cada um em sequência até um funcionar.
 * Para adicionar um novo provider: basta incluir aqui.
 */

const PROVIDERS = [
    youtubeProvider,      // detecção inequívoca
    VimeoProvider,        // detecção inequívoca
    PeerTubeProvider,     // detecção inequívoca
    ArchiveOrgProvider,   // stream direto — antes dos outros genéricos
    tokyvideoProvider,
    streamtapeProvider,
  ];
class StreamRouter {
  /**
   * Retorna o provider adequado para a URL.
   * Lança erro se nenhum provider reconhecer a URL.
   */
  getProvider(url) {
    const provider = PROVIDERS.find((p) => p.canHandle(url));
    if (!provider) {
      throw new Error(`Nenhum provider suporta a URL: ${url}`);
    }
    return provider;
  }

  /**
   * Valida se a URL é de algum provider suportado.
   * Substitui o videoValidationService anterior.
   */
  isValidUrl(url) {
    try {
      return PROVIDERS.some((p) => p.canHandle(url));
    } catch {
      return false;
    }
  }

  /**
   * Faz stream com fallback automático.
   * Se o provider primário falhar, tenta os demais
   * que também conseguem lidar com a URL.
   */
  async streamWithFallback(url, req, res) {
    const compatibleProviders = PROVIDERS.filter((p) => p.canHandle(url));

    if (compatibleProviders.length === 0) {
      throw new Error("Nenhum provider disponível para esta URL");
    }

    let lastError;
    for (const provider of compatibleProviders) {
      try {
        await provider.stream(url, req, res);
        return; // sucesso — encerra
      } catch (err) {
        lastError = err;
        console.warn(
          `[StreamRouter] Provider ${provider.constructor.name} falhou:`,
          err.message
        );
        // Só continua se a resposta ainda não foi iniciada
        if (res.headersSent) throw err;
      }
    }

    throw lastError;
  }
}

module.exports = new StreamRouter();