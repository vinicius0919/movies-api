
const axios = require("axios");
const { pipeline } = require("node:stream/promises");

const IStreamProvider = require("./IStreamProvider");
const { extractMp4Url } = require("../utils/extractVideos");

const PAGE_TIMEOUT_MS = 15000;
const CDN_CONNECTION_TIMEOUT_MS = 20000;
const CDN_IDLE_TIMEOUT_MS = 45000;
const WATCHDOG_INTERVAL_MS = 5000;

const USER_AGENT = "Mozilla/5.0";

class TokyvideoProvider extends IStreamProvider {
  canHandle(url) {
    try {
      const parsed = new URL(url);

      return (
        ["http:", "https:"].includes(parsed.protocol) &&
        (
          parsed.hostname === "tokyvideo.com" ||
          parsed.hostname.endsWith(".tokyvideo.com")
        )
      );
    } catch {
      return false;
    }
  }

  async extractMp4(html) {
    return extractMp4Url(html);
  }

  async stream(pageUrl, req, res) {
    const controller = new AbortController();

    let upstream = null;
    let watchdog = null;
    let clientDisconnected = false;
    let finished = false;
    let transferredBytes = 0;
    let lastActivity = Date.now();

    const startedAt = Date.now();

    const onClientClose = () => {
      if (res.writableFinished) return;

      clientDisconnected = true;
      controller.abort();

      if (upstream && !upstream.destroyed) {
        upstream.destroy();
      }
    };

    res.once("close", onClientClose);

    try {
      console.log("[Tokyvideo] Resolvendo página", {
        range: req.headers.range || null,
      });

      const pageResponse = await axios.get(pageUrl, {
        timeout: PAGE_TIMEOUT_MS,
        signal: controller.signal,
        responseType: "text",
        maxRedirects: 5,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html",
        },
      });

      if (clientDisconnected) return;

      const mp4Url = await this.extractMp4(
        pageResponse.data
      );

      if (!mp4Url) {
        throw new Error(
          "Não foi possível extrair a URL do MP4"
        );
      }

      const parsedMp4Url = new URL(mp4Url);

      if (
        !["http:", "https:"].includes(
          parsedMp4Url.protocol
        )
      ) {
        throw new Error("Protocolo de vídeo inválido");
      }

      const requestHeaders = {
        "User-Agent": USER_AGENT,
        Referer: pageUrl,
        Origin: new URL(pageUrl).origin,
        Accept: "*/*",
        "Accept-Encoding": "identity",
      };

      if (req.headers.range) {
        requestHeaders.Range = req.headers.range;
      }

      const response = await axios({
        method: "GET",
        url: mp4Url,
        responseType: "stream",
        decompress: false,
        timeout: CDN_CONNECTION_TIMEOUT_MS,
        signal: controller.signal,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: requestHeaders,
      });

      upstream = response.data;

      if (clientDisconnected || res.destroyed) {
        upstream.destroy();
        return;
      }

      const status = response.status;

      if (![200, 206].includes(status)) {
        throw new Error(
          `CDN retornou HTTP ${status}`
        );
      }

      if (
        status === 206 &&
        !response.headers["content-range"]
      ) {
        throw new Error(
          "Resposta 206 sem Content-Range"
        );
      }

      // Se o navegador pediu um intervalo e o CDN
      // respondeu 200, não podemos fingir que o
      // intervalo foi respeitado.
      if (req.headers.range && status !== 206) {
        throw new Error(
          "CDN ignorou a solicitação HTTP Range"
        );
      }

      const contentType =
        response.headers["content-type"] ||
        "video/mp4";

      if (
        contentType.toLowerCase().includes("text/html")
      ) {
        throw new Error(
          "CDN retornou HTML em vez de vídeo"
        );
      }

      const outgoingHeaders = {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      };

      for (const header of [
        "content-length",
        "content-range",
        "accept-ranges",
        "etag",
        "last-modified",
      ]) {
        if (response.headers[header] != null) {
          outgoingHeaders[header] =
            response.headers[header];
        }
      }

      upstream.on("data", (chunk) => {
        transferredBytes += chunk.length;
        lastActivity = Date.now();
      });

      // Só considera o CDN paralisado quando o
      // fluxo está ativo. Durante backpressure,
      // o Node pode pausar a leitura legitimamente.
      watchdog = setInterval(() => {
        if (
          finished ||
          clientDisconnected ||
          res.destroyed ||
          upstream.destroyed ||
          upstream.isPaused()
        ) {
          return;
        }

        const idleMs =
          Date.now() - lastActivity;

        if (idleMs >= CDN_IDLE_TIMEOUT_MS) {
          console.error(
            "[Tokyvideo] CDN paralisado",
            {
              idleMs,
              transferredBytes,
              range: req.headers.range || null,
            }
          );

          upstream.destroy(
            new Error(
              `CDN sem dados por ${idleMs}ms`
            )
          );
        }
      }, WATCHDOG_INTERVAL_MS);

      watchdog.unref?.();

      console.log(
        "[Tokyvideo] Transmissão iniciada",
        {
          status,
          range: req.headers.range || null,
          contentRange:
            response.headers["content-range"] ||
            null,
          contentLength:
            response.headers["content-length"] ||
            null,
        }
      );

      res.writeHead(status, outgoingHeaders);

      // Aguarda a conclusão ou falha real.
      await pipeline(upstream, res);

      finished = true;

      console.log(
        "[Tokyvideo] Transmissão concluída",
        {
          transferredBytes,
          elapsedMs: Date.now() - startedAt,
        }
      );
    } catch (error) {
      if (
        clientDisconnected ||
        req.aborted ||
        (
          controller.signal.aborted &&
          res.destroyed
        )
      ) {
        console.log(
          "[Tokyvideo] Cliente desconectado"
        );
        return;
      }

      console.error(
        "[Tokyvideo] Erro no streaming",
        {
          message: error.message,
          code: error.code,
          transferredBytes,
          elapsedMs: Date.now() - startedAt,
          headersSent: res.headersSent,
        }
      );

      throw error;
    } finally {
      if (watchdog) {
        clearInterval(watchdog);
      }

      res.removeListener(
        "close",
        onClientClose
      );

      if (
        upstream &&
        !upstream.destroyed
      ) {
        upstream.destroy();
      }

      if (!controller.signal.aborted) {
        controller.abort();
      }
    }
  }
}

module.exports = new TokyvideoProvider();
