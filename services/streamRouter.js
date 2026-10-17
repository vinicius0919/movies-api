
const tokyvideoProvider = require("../providers/TokyvideoProvider");
const streamtapeProvider = require("../providers/StreamtapeProvider");
const youtubeProvider = require("../providers/YoutubeProvider");
const VimeoProvider = require("../providers/VimeoProvider");
const PeerTubeProvider = require("../providers/PeerTubeProvider");
const ArchiveOrgProvider = require("../providers/ArchiveOrgProvider");

const PROVIDERS = [
  youtubeProvider,
  VimeoProvider,
  PeerTubeProvider,
  ArchiveOrgProvider,
  tokyvideoProvider,
  streamtapeProvider,
];

class StreamRouter {
  getProvider(url) {
    const provider = PROVIDERS.find(
      (item) => item.canHandle(url)
    );

    if (!provider) {
      throw new Error(
        `Nenhum provider suporta a URL: ${url}`
      );
    }

    return provider;
  }

  isValidUrl(url) {
    if (
      typeof url !== "string" ||
      !url.trim()
    ) {
      return false;
    }

    try {
      const parsed = new URL(url);

      if (
        !["http:", "https:"].includes(
          parsed.protocol
        )
      ) {
        return false;
      }

      return PROVIDERS.some(
        (provider) => provider.canHandle(url)
      );
    } catch {
      return false;
    }
  }

  async streamWithFallback(url, req, res) {
    const compatibleProviders =
      PROVIDERS.filter(
        (provider) => provider.canHandle(url)
      );

    if (!compatibleProviders.length) {
      throw new Error(
        "Nenhum provider disponível"
      );
    }

    let lastError = null;

    for (const provider of compatibleProviders) {
      if (
        res.headersSent ||
        res.destroyed ||
        res.writableEnded
      ) {
        break;
      }

      const name =
        provider.constructor?.name ||
        "UnknownProvider";

      try {
        console.log(
          `[StreamRouter] Executando ${name}`
        );

        await provider.stream(url, req, res);

        // O provider pode retornar depois que
        // o cliente cancelou a requisição.
        if (
          req.aborted ||
          res.destroyed
        ) {
          return;
        }

        // Alguns providers podem gerenciar
        // a resposta assincronamente.
        // Não iniciamos outro provider depois
        // de uma execução sem exceção.
        return;
      } catch (error) {
        lastError = error;

        console.error(
          `[StreamRouter] Falha em ${name}`,
          {
            message: error.message,
            code: error.code,
            headersSent: res.headersSent,
          }
        );

        // Não é possível trocar de provider
        // após o envio dos headers.
        if (
          res.headersSent ||
          res.destroyed ||
          res.writableEnded ||
          req.aborted
        ) {
          throw error;
        }
      }
    }

    throw (
      lastError ||
      new Error(
        "Todos os providers falharam"
      )
    );
  }
}

module.exports = new StreamRouter();
