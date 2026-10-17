
const streamRouter = require("../services/streamRouter");

async function stream(req, res) {
  const pageUrl = req.query.page;

  if (
    typeof pageUrl !== "string" ||
    !pageUrl.trim()
  ) {
    return res.status(400).send(
      "Parâmetro 'page' inválido ou ausente"
    );
  }

  if (!streamRouter.isValidUrl(pageUrl)) {
    return res.status(400).send(
      "URL de provider não suportado"
    );
  }

  const startedAt = Date.now();

  console.log(
    "[StreamController] Nova requisição",
    {
      pageUrl,
      range: req.headers.range || null,
    }
  );

  try {
    await streamRouter.streamWithFallback(
      pageUrl,
      req,
      res
    );
  } catch (error) {
    console.error(
      "[StreamController] Falha",
      {
        message: error.message,
        code: error.code,
        elapsedMs:
          Date.now() - startedAt,
        headersSent: res.headersSent,
      }
    );

    if (
      res.destroyed ||
      res.writableEnded
    ) {
      return;
    }

    if (!res.headersSent) {
      return res.status(502).send(
        "Não foi possível transmitir o vídeo"
      );
    }

    // O status HTTP já foi enviado.
    // Encerra a conexão para que o navegador
    // possa detectar a falha.
    res.destroy(error);
  }
}

module.exports = { stream };
