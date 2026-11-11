const streamRouter = require("../services/streamRouter");
const mongoose = require("mongoose");
const Movie = require("../models/Movie");

// =========================================
// STREAM CONTROLLER
// =========================================

async function streamMovie(req, res) {
  const { id } = req.params;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      error: "Identificador do filme inválido.",
    });
  }

  try {
    const movie = await Movie.findById(id).select("videoUrl").lean();

    if (!movie) {
      return res.status(404).json({
        error: "Filme não encontrado.",
      });
    }

    if (!movie.videoUrl || !streamRouter.isValidUrl(movie.videoUrl)) {
      return res.status(422).json({
        error: "Fonte de reprodução indisponível.",
      });
    }

    // A URL vem exclusivamente do banco.
    // O cliente informa apenas o ID do filme.
    await streamRouter.streamWithFallback(movie.videoUrl, req, res);
  } catch (error) {
    console.error("[STREAM MOVIE]", error.message);

    if (res.destroyed || res.writableEnded || req.aborted) {
      return;
    }

    if (res.headersSent) {
      return res.destroy();
    }

    return res.status(502).json({
      error: "Falha na transmissão do filme.",
    });
  }
}

async function stream(req, res) {
  const pageUrl = req.query.page;

  // =======================================
  // 1. VALIDAR PARÂMETROS
  // =======================================

  if (typeof pageUrl !== "string" || !pageUrl.trim()) {
    return res
      .status(400)
      .type("text/plain")
      .send("Parâmetro 'page' inválido ou ausente");
  }

  if (!streamRouter.isValidUrl(pageUrl)) {
    return res
      .status(400)
      .type("text/plain")
      .send("URL de provider não suportado");
  }

  const startedAt = Date.now();
  const requestedRange = req.headers.range || null;

  // =======================================
  // 2. REGISTRAR REQUISIÇÃO
  // =======================================

  // =======================================
  // 3. INICIAR TRANSMISSÃO
  // =======================================

  try {
    await streamRouter.streamWithFallback(pageUrl, req, res);

    // O provider pode retornar normalmente
    // após um cancelamento do navegador.
    if (res.destroyed && !res.writableFinished) {
      console.info("[StreamController] Conexão encerrada", {
        elapsedMs: Date.now() - startedAt,
        range: requestedRange,
      });

      return;
    }
  } catch (error) {
    // =====================================
    // 4. REGISTRAR ERRO
    // =====================================

    const elapsedMs = Date.now() - startedAt;

    console.error("[StreamController] Falha no streaming", {
      message: error?.message || "Erro desconhecido",
      code: error?.code || null,
      elapsedMs,
      range: requestedRange,
      headersSent: res.headersSent,
      responseDestroyed: res.destroyed,
      responseFinished: res.writableFinished,
    });

    // =====================================
    // 5. CONEXÃO JÁ ENCERRADA
    // =====================================

    // O pipeline pode destruir a resposta
    // quando ocorre uma falha no upstream.
    //
    // Nesse caso, não podemos escrever
    // novos cabeçalhos ou conteúdo.

    if (res.destroyed || res.writableEnded || req.aborted) {
      return;
    }

    // =====================================
    // 6. ERRO ANTES DOS CABEÇALHOS
    // =====================================

    // Se a transmissão ainda não começou,
    // podemos retornar um HTTP 502.

    if (!res.headersSent) {
      return res
        .status(502)
        .type("text/plain")
        .send("Não foi possível transmitir o vídeo");
    }

    // =====================================
    // 7. ERRO APÓS OS CABEÇALHOS
    // =====================================

    // Se já enviamos HTTP 200 ou 206,
    // não é possível alterar o status.
    //
    // Encerramos a conexão incompleta
    // para que o navegador detecte a falha
    // e o useStreamRecovery possa reagir.

    console.warn("[StreamController] Encerrando transmissão incompleta", {
      elapsedMs,
      range: requestedRange,
    });

    // O erro já foi registrado acima.
    // Não precisamos emitir outro evento
    // de erro no ServerResponse.
    res.destroy();
  }
}

module.exports = { stream, streamMovie };
