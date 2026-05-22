// controllers/streamController.js

const streamRouter = require("../services/streamRouter");

async function stream(req, res) {
  const { page: pageUrl } = req.query;

  if (!pageUrl) {
    return res.status(400).send("Parâmetro 'page' ausente");
  }

  if (!streamRouter.isValidUrl(pageUrl)) {
    return res.status(400).send("URL de provider não suportado");
  }

  try {
    await streamRouter.streamWithFallback(pageUrl, req, res);
  } catch (err) {
    console.error("[StreamController] Erro no stream:", err.message);
    if (!res.headersSent) {
      res.status(502).send("Falha no streaming — todos os providers falharam");
    }
  }
}

module.exports = { stream };