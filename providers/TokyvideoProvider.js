
const axios = require("axios");
const { pipeline } = require("node:stream/promises");

const IStreamProvider = require("./IStreamProvider");
const { extractMp4Url } = require("../utils/extractVideos");

// ======================================================
// CONFIGURAÇÕES
// ======================================================

const PAGE_TIMEOUT_MS = 15000;
const CDN_CONNECTION_TIMEOUT_MS = 20000;
const CDN_IDLE_TIMEOUT_MS = 45000;
const WATCHDOG_INTERVAL_MS = 5000;

const USER_AGENT = "Mozilla/5.0";

class TokyvideoProvider extends IStreamProvider {
  // ====================================================
  // IDENTIFICAÇÃO DO PROVIDER
  // ====================================================

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

  // ====================================================
  // EXTRAÇÃO DA URL MP4
  // ====================================================

  async extractMp4(html) {
    return extractMp4Url(html);
  }

  // ====================================================
  // TRANSMISSÃO
  // ====================================================

  async stream(pageUrl, req, res) {
    const controller = new AbortController();

    let upstream = null;
    let watchdog = null;

    let clientDisconnected = false;
    let finished = false;

    let upstreamFailure = null;
    let upstreamPrematureClose = false;

    let transferredBytes = 0;
    let lastActivity = Date.now();

    const startedAt = Date.now();

    const requestedRange = req.headers.range || null;

    // ==================================================
    // EVENTOS DA RESPOSTA HTTP
    // ==================================================

    const onResponseFinish = () => {
      finished = true;
    };

    const onClientClose = () => {
      // Resposta enviada integralmente.
      if (res.writableFinished) {
        return;
      }

      // Uma falha no upstream pode provocar
      // o fechamento da resposta pelo pipeline.
      if (upstreamFailure || upstreamPrematureClose) {
        console.warn(
          "[Tokyvideo] Resposta encerrada após falha no upstream",
          {
            transferredBytes,
            elapsedMs: Date.now() - startedAt,
            upstreamFailure:
              upstreamFailure?.message || null,
            upstreamPrematureClose,
          }
        );

        // Cancela operações ainda pendentes.
        if (!controller.signal.aborted) {
          controller.abort();
        }

        return;
      }

      // Não é possível determinar apenas pelo
      // evento close se foi uma ação do usuário.
      clientDisconnected = true;

      console.info(
        "[Tokyvideo] Resposta interrompida antes da conclusão",
        {
          transferredBytes,
          elapsedMs: Date.now() - startedAt,
          range: requestedRange,
        }
      );

      if (!controller.signal.aborted) {
        controller.abort();
      }

      if (upstream && !upstream.destroyed) {
        upstream.destroy();
      }
    };

    res.once("finish", onResponseFinish);
    res.once("close", onClientClose);

    try {
      // ==================================================
      // 1. RESOLVER A PÁGINA DO TOKYVIDEO
      // ==================================================

      console.log("[Tokyvideo] Resolvendo página", {
        range: requestedRange,
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

      if (clientDisconnected || res.destroyed) {
        return;
      }

      // ==================================================
      // 2. EXTRAIR A URL DO ARQUIVO
      // ==================================================

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
        throw new Error(
          "Protocolo de vídeo inválido"
        );
      }

      // ==================================================
      // 3. PREPARAR REQUISIÇÃO AO CDN
      // ==================================================

      const requestHeaders = {
        "User-Agent": USER_AGENT,
        Referer: pageUrl,
        Origin: new URL(pageUrl).origin,
        Accept: "*/*",
        "Accept-Encoding": "identity",
      };

      if (requestedRange) {
        requestHeaders.Range = requestedRange;
      }

      // ==================================================
      // 4. CONECTAR AO CDN
      // ==================================================

      // Limita o tempo para receber a resposta
      // inicial do CDN.
      //
      // Após a conexão, o watchdog assume o
      // monitoramento da transmissão.

      const connectionTimer = setTimeout(() => {
        controller.abort(
          new Error(
            "Timeout ao conectar ao CDN"
          )
        );
      }, CDN_CONNECTION_TIMEOUT_MS);

      let response;

      try {
        response = await axios({
          method: "GET",
          url: mp4Url,
          responseType: "stream",

          // Preserva os bytes originais.
          decompress: false,

          // Desativa o timeout geral do Axios.
          // O watchdog controla a inatividade.
          timeout: 0,

          signal: controller.signal,
          maxRedirects: 5,
          validateStatus: () => true,
          headers: requestHeaders,
        });
      } finally {
        clearTimeout(connectionTimer);
      }

      upstream = response.data;

      // ==================================================
      // 5. MONITORAR FALHAS DO UPSTREAM
      // ==================================================

      upstream.once("error", (error) => {
        upstreamFailure = error;
      });

      upstream.once("close", () => {
        if (
          !upstream.readableEnded &&
          !clientDisconnected
        ) {
          upstreamPrematureClose = true;
        }
      });

      if (clientDisconnected || res.destroyed) {
        upstream.destroy();
        return;
      }

      // ==================================================
      // 6. VALIDAR RESPOSTA DO CDN
      // ==================================================

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

      // O navegador solicitou um intervalo.
      // O CDN precisa respeitar essa solicitação.
      if (requestedRange && status !== 206) {
        throw new Error(
          "CDN ignorou a solicitação HTTP Range"
        );
      }

      const contentType =
        response.headers["content-type"] ||
        "video/mp4";

      if (
        contentType
          .toLowerCase()
          .includes("text/html")
      ) {
        throw new Error(
          "CDN retornou HTML em vez de vídeo"
        );
      }

      // ==================================================
      // 7. PREPARAR CABEÇALHOS HTTP
      // ==================================================

      const outgoingHeaders = {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      };

      // Preserva os cabeçalhos necessários
      // para seek e reprodução parcial.
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

      // ==================================================
      // 8. CONTABILIZAR TRANSFERÊNCIA
      // ==================================================

      upstream.on("data", (chunk) => {
        transferredBytes += chunk.length;
        lastActivity = Date.now();
      });

      // ==================================================
      // 9. WATCHDOG DE INATIVIDADE
      // ==================================================

      watchdog = setInterval(() => {
        if (
          finished ||
          clientDisconnected ||
          res.destroyed ||
          upstream.destroyed
        ) {
          return;
        }

        // Quando há backpressure, o Node pode
        // pausar a leitura legitimamente.
        if (upstream.isPaused()) {
          return;
        }

        const idleMs =
          Date.now() - lastActivity;

        if (idleMs < CDN_IDLE_TIMEOUT_MS) {
          return;
        }

        console.error(
          "[Tokyvideo] CDN paralisado",
          {
            idleMs,
            transferredBytes,
            range: requestedRange,
          }
        );

        upstream.destroy(
          new Error(
            `CDN sem dados por ${idleMs}ms`
          )
        );
      }, WATCHDOG_INTERVAL_MS);

      watchdog.unref?.();

      // ==================================================
      // 10. INICIAR TRANSMISSÃO
      // ==================================================

      console.log(
        "[Tokyvideo] Transmissão iniciada",
        {
          status,
          range: requestedRange,
          contentRange:
            response.headers["content-range"] ||
            null,
          contentLength:
            response.headers["content-length"] ||
            null,
        }
      );

      res.writeHead(
        status,
        outgoingHeaders
      );

      // O pipeline controla o backpressure
      // e propaga erros de transmissão.
      await pipeline(upstream, res);

      finished = true;

      // ==================================================
      // 11. TRANSMISSÃO CONCLUÍDA
      // ==================================================

      console.log(
        "[Tokyvideo] Transmissão concluída",
        {
          transferredBytes,
          elapsedMs:
            Date.now() - startedAt,
          range: requestedRange,
        }
      );
    } catch (error) {
      // ==================================================
      // 12. TRATAMENTO DE ERROS
      // ==================================================

      // Interrupção da resposta ou cancelamento
      // explícito da requisição pelo cliente.
      if (
        clientDisconnected ||
        req.aborted
      ) {
        return;
      }

      const errorMessage =
        controller.signal.aborted &&
        controller.signal.reason?.message
          ? controller.signal.reason.message
          : error.message;

      console.error(
        "[Tokyvideo] Erro no streaming",
        {
          message: errorMessage,
          code: error.code || null,
          transferredBytes,
          elapsedMs:
            Date.now() - startedAt,
          headersSent: res.headersSent,
          range: requestedRange,
          upstreamPrematureClose,
          upstreamFailure:
            upstreamFailure?.message || null,
        }
      );

      // Deixa o StreamController tratar
      // a falha e a resposta HTTP, quando possível.
      throw error;
    } finally {
      // ==================================================
      // 13. LIMPEZA DE RECURSOS
      // ==================================================

      if (watchdog) {
        clearInterval(watchdog);
        watchdog = null;
      }

      res.removeListener(
        "finish",
        onResponseFinish
      );

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
