const mongoose = require("mongoose");
const service = require("../services/contentImportService");

function handleError(res, error) {
  if (error?.code === 11000) return res.status(200).json({ error: "Registro já importado." });
  return res.status(error.status || 500).json({ error: error.message || "Erro interno do servidor." });
}

async function analyze(req, res) {
  try {
    return res.json(service.analyzeHtml(req.body?.html, req.body?.sourceOrigin));
  } catch (error) {
    return handleError(res, error);
  }
}

async function createBatch(req, res) {
  try {
    const result = await service.createBatch({
      html: req.body?.html,
      sourceOrigin: req.body?.sourceOrigin,
      selectedRecords: req.body?.selectedRecords,
      req,
    });
    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error);
  }
}

async function createStructuredBatch(req, res) {
  try {
    return res.status(201).json(await service.createStructuredBatch({ records: req.body?.records, sourceOrigin: req.body?.sourceOrigin, batchId: req.body?.batchId, req }));
  } catch (error) {
    return handleError(res, error);
  }
}

async function list(req, res) {
  try {
    return res.json(await service.list(req.query));
  } catch (error) {
    return handleError(res, error);
  }
}

async function getById(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Identificador inválido." });
  try {
    const item = await service.getById(req.params.id);
    return item ? res.json(item) : res.status(404).json({ error: "Importação não encontrada." });
  } catch (error) {
    return handleError(res, error);
  }
}

async function updatePrepared(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Identificador inválido." });
  try {
    const item = await service.updatePrepared(req.params.id, req.body || {}, req);
    return item ? res.json(item) : res.status(404).json({ error: "Importação não encontrada." });
  } catch (error) {
    return handleError(res, error);
  }
}

async function history(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "Identificador inválido." });
  try {
    const item = await service.getById(req.params.id);
    return item ? res.json({ history: item.history || [] }) : res.status(404).json({ error: "Importação não encontrada." });
  } catch (error) {
    return handleError(res, error);
  }
}

async function validate(req, res) {
  try { const item = await service.validateImport(req.params.id, req); return item ? res.json(item) : res.status(404).json({ error: "Importação não encontrada." }); } catch (error) { return handleError(res, error); }
}
async function linkTmdb(req, res) {
  try { const item = await service.linkTmdb(req.params.id, req.body || {}, req); return item ? res.json(item) : res.status(404).json({ error: "Importação não encontrada." }); } catch (error) { return handleError(res, error); }
}
async function confirmValidation(req, res) {
  try { const item = await service.confirmValidation(req.params.id, req.body || {}, req); return item ? res.json(item) : res.status(404).json({ error: "Importação não encontrada." }); } catch (error) { return handleError(res, error); }
}
async function previewOperation(req, res) {
  try { return res.json(await service.operationPreview(req.body?.ids || [], req.body?.operation, req.body?.fields || [])); } catch (error) { return handleError(res, error); }
}
async function processOperation(req, res) {
  try { return res.json({ results: await service.processMany(req.body?.ids || [], req.body?.operation, req.body || {}, req) }); } catch (error) { return handleError(res, error); }
}

module.exports = { analyze, createBatch, createStructuredBatch, list, getById, updatePrepared, history, validate, linkTmdb, confirmValidation, previewOperation, processOperation };
