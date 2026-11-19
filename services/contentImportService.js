const { randomUUID } = require("node:crypto");

const ContentImport = require("../models/ContentImport");
const Movie = require("../models/Movie");
const Series = require("../models/Series");
const { analyzeHtml: parseHtml } = require("../utils/contentImportParser");
const tmdbService = require("./tmdbService");
const streamRouter = require("./streamRouter");

function administratorId(req) {
  return req.user?._id || req.user?.id;
}

function historyEntry(req, operation, result, message) {
  return {
    operation,
    administratorId: administratorId(req),
    result,
    message,
  };
}

function analyzeHtml(html, sourceOrigin) {
  return parseHtml(html, sourceOrigin);
}

async function createBatch({ html, sourceOrigin, selectedRecords, req }) {
  const analysis = analyzeHtml(html, sourceOrigin);
  const selectedKeys = selectedRecords === undefined
    ? new Set(analysis.records.map((record) => record.sourceKey))
    : new Set(Array.isArray(selectedRecords) ? selectedRecords : []);
  const records = analysis.records.filter((record) => selectedKeys.has(record.sourceKey));

  if (!records.length) {
    throw Object.assign(new Error("Nenhum registro válido foi selecionado."), { status: 400 });
  }

  const batchId = randomUUID();
  const operations = records.map((record) => ({
    updateOne: {
      filter: { sourceKey: record.sourceKey },
      update: {
        $setOnInsert: {
          ...record,
          sourceOrigin: typeof sourceOrigin === "string" ? sourceOrigin.trim().slice(0, 200) : undefined,
          batchId,
          processingStatus: "pending",
          history: [historyEntry(req, "import", "success", "Registro criado para revisão")],
        },
      },
      upsert: true,
    },
  }));

  const result = await ContentImport.bulkWrite(operations, { ordered: false });
  const imports = await ContentImport.find({ sourceKey: { $in: records.map((record) => record.sourceKey) } })
    .sort({ createdAt: -1 })
    .lean();

  return {
    batchId,
    analysis,
    imported: result.upsertedCount,
    existing: records.length - result.upsertedCount,
    records: imports,
  };
}

const STRUCTURED_MAX_RECORDS = 50;
const STRUCTURED_MAX_BYTES = 80_000;

function normalizeStructuredRecord(record) {
  const { normalizeUrl, normalizeTitle } = require("../utils/contentImportParser");
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Registro inválido.");
  const sourceUrl = normalizeUrl(record.sourceUrl);
  if (!sourceUrl) throw new Error("URL de origem inválida.");
  const title = typeof record.extractedTitle === "string" ? record.extractedTitle.trim() : "";
  if (!title || title.length > 500) throw new Error("Título inválido.");
  if (!["movie", "series", "episode"].includes(record.suggestedType)) throw new Error("Tipo de conteúdo inválido.");
  const integer = (value) => value === undefined || value === null ? undefined : Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const seasonNumber = integer(record.seasonNumber);
  const episodeNumber = integer(record.episodeNumber);
  if (seasonNumber === null || episodeNumber === null) throw new Error("Temporada ou episódio inválido.");
  return {
    sourceUrl,
    sourceKey: sourceUrl.toLowerCase(),
    extractedTitle: title,
    normalizedTitle: normalizeTitle(title),
    suggestedType: record.suggestedType,
    seasonNumber,
    episodeNumber,
    duration: record.duration === undefined || record.duration === null ? undefined : integer(record.duration),
    thumbnail: record.thumbnail ? normalizeUrl(record.thumbnail) : undefined,
    metadata: typeof record.metadata === "object" && record.metadata ? record.metadata : {},
  };
}

async function createStructuredBatch({ records, sourceOrigin, batchId, req }) {
  if (!Array.isArray(records) || records.length === 0 || records.length > STRUCTURED_MAX_RECORDS) throw Object.assign(new Error(`Envie entre 1 e ${STRUCTURED_MAX_RECORDS} registros.`), { status: 400 });
  const serialized = JSON.stringify({ records, sourceOrigin, batchId });
  if (Buffer.byteLength(serialized, "utf8") > STRUCTURED_MAX_BYTES) throw Object.assign(new Error("Lote excede o limite de tamanho."), { status: 413 });
  const operationBatchId = typeof batchId === "string" && batchId.length <= 100 ? batchId : randomUUID();
  const results = [];
  for (const raw of records) {
    try {
      const record = normalizeStructuredRecord(raw);
      const result = await ContentImport.updateOne(
        { sourceKey: record.sourceKey },
        { $setOnInsert: { ...record, sourceOrigin: typeof sourceOrigin === "string" ? sourceOrigin.trim().slice(0, 200) : undefined, batchId: operationBatchId, processingStatus: "pending", history: [historyEntry(req, "import-structured", "success", "Registro recebido") ] } },
        { upsert: true },
      );
      results.push({ sourceKey: record.sourceKey, result: result.upsertedCount ? "imported" : "duplicate" });
    } catch (error) {
      results.push({ sourceKey: raw?.sourceUrl || null, result: "error", message: error.message });
    }
  }
  return { batchId: operationBatchId, results, imported: results.filter((item) => item.result === "imported").length, duplicates: results.filter((item) => item.result === "duplicate").length, errors: results.filter((item) => item.result === "error").length };
}

async function list(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 25));
  const filter = {};
  if (typeof query.search === "string" && query.search.trim()) {
    filter.normalizedTitle = { $regex: query.search.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") };
  }
  if (["movie", "series", "episode"].includes(query.type)) filter.suggestedType = query.type;
  if (["pending", "ready", "processed", "rejected", "error"].includes(query.status)) filter.processingStatus = query.status;
  if (typeof query.origin === "string" && query.origin.trim()) filter.sourceOrigin = query.origin.trim();
  if (typeof query.batchId === "string" && query.batchId.trim()) filter.batchId = query.batchId.trim();

  const sortField = ["createdAt", "updatedAt", "extractedTitle", "processingStatus"].includes(query.sort)
    ? query.sort
    : "createdAt";
  const sortDirection = query.order === "asc" ? 1 : -1;
  const [data, total] = await Promise.all([
    ContentImport.find(filter).sort({ [sortField]: sortDirection }).skip((page - 1) * limit).limit(limit).lean(),
    ContentImport.countDocuments(filter),
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function getById(id) {
  return ContentImport.findById(id).lean();
}

async function updatePrepared(id, payload = {}, req) {
  const item = await ContentImport.findById(id);
  if (!item) return null;
  if (["processed", "rejected"].includes(item.processingStatus)) throw Object.assign(new Error("Registros processados ou rejeitados não podem ser editados."), { status: 409 });

  const { normalizeUrl, normalizeTitle } = require("../utils/contentImportParser");
  const before = {
    extractedTitle: item.extractedTitle,
    suggestedType: item.suggestedType,
    seasonNumber: item.seasonNumber,
    episodeNumber: item.episodeNumber,
    duration: item.duration,
    thumbnail: item.thumbnail,
    metadata: item.metadata,
    reproductionCandidateUrl: item.reproductionCandidateUrl,
    reproductionCandidateStatus: item.reproductionCandidateStatus,
  };
  const title = typeof payload.extractedTitle === "string" ? payload.extractedTitle.trim() : item.extractedTitle;
  const suggestedType = payload.suggestedType || item.suggestedType;
  if (!title || title.length > 500) throw Object.assign(new Error("Título extraído inválido."), { status: 400 });
  if (!["movie", "series", "episode"].includes(suggestedType)) throw Object.assign(new Error("Tipo de conteúdo inválido."), { status: 400 });

  const integer = (value, label) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (!Number.isSafeInteger(Number(value)) || Number(value) < 0) throw Object.assign(new Error(`${label} inválido.`), { status: 400 });
    return Number(value);
  };
  const seasonNumber = suggestedType === "episode" ? integer(payload.seasonNumber, "Temporada") : undefined;
  const episodeNumber = suggestedType === "episode" ? integer(payload.episodeNumber, "Episódio") : undefined;
  const duration = payload.duration === undefined || payload.duration === "" ? undefined : integer(payload.duration, "Duração");
  const thumbnail = payload.thumbnail === undefined || payload.thumbnail === "" ? undefined : normalizeUrl(payload.thumbnail);
  if (payload.thumbnail && !thumbnail) throw Object.assign(new Error("Thumbnail inválida."), { status: 400 });
  const metadata = payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata) ? payload.metadata : item.metadata || {};
  const candidateProvided = Object.prototype.hasOwnProperty.call(payload, "reproductionCandidateUrl");
  const reproductionCandidateUrl = candidateProvided
    ? (payload.reproductionCandidateUrl === "" ? undefined : normalizeUrl(payload.reproductionCandidateUrl))
    : item.reproductionCandidateUrl;
  if (candidateProvided && payload.reproductionCandidateUrl && !reproductionCandidateUrl) throw Object.assign(new Error("URL candidata de reprodução inválida."), { status: 400 });
  const reproductionCandidateStatus = candidateProvided
    ? (reproductionCandidateUrl ? (streamRouter.isValidUrl(reproductionCandidateUrl) ? "compatible" : "incompatible") : "unknown")
    : item.reproductionCandidateStatus;

  const after = { extractedTitle: title, suggestedType, seasonNumber, episodeNumber, duration, thumbnail, metadata };
  if (candidateProvided || reproductionCandidateUrl || reproductionCandidateStatus) {
    after.reproductionCandidateUrl = reproductionCandidateUrl;
    after.reproductionCandidateStatus = reproductionCandidateStatus || "unknown";
  }
  const changedFields = Object.keys(after).filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
  if (changedFields.length === 0) return item.toObject();

  item.extractedTitle = title;
  item.normalizedTitle = normalizeTitle(title);
  item.suggestedType = suggestedType;
  item.seasonNumber = seasonNumber;
  item.episodeNumber = episodeNumber;
  item.duration = duration;
  item.thumbnail = thumbnail;
  item.metadata = metadata;
  item.reproductionCandidateUrl = reproductionCandidateUrl;
  if (reproductionCandidateStatus) item.reproductionCandidateStatus = reproductionCandidateStatus;
  item.validation = { status: "unreviewed", tmdbStatus: "unlinked", matches: [] };
  item.finalReference = undefined;
  item.processingStatus = "pending";
  const entry = historyEntry(req, "prepared-update", "success", "Dados preparados atualizados; validação reiniciada");
  entry.fields = changedFields;
  entry.before = before;
  entry.after = after;
  item.history.push(entry);
  await item.save();
  return item.toObject();
}

async function appendHistory(id, req, operation, result, message) {
  return ContentImport.findByIdAndUpdate(
    id,
    { $push: { history: historyEntry(req, operation, result, message) } },
    { new: true, runValidators: true },
  ).lean();
}

function safeId(value) {
  return value && typeof value.toString === "function" ? value.toString() : value;
}

async function findMatches(item) {
  const matches = [];
  const tmdbId = item.validation?.tmdbId;
  if (item.suggestedType === "movie") {
    const query = tmdbId ? { tmdbId } : { title: new RegExp(`^${item.extractedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
    const movies = await Movie.find(query).select("_id tmdbId title year poster published").limit(10).lean();
    matches.push(...movies.map((movie) => ({ model: "Movie", objectId: movie._id, score: tmdbId ? 1 : 0.7, data: movie })));
  } else {
    const query = tmdbId ? { tmdbId } : { title: new RegExp(`^${item.extractedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
    const series = await Series.find(query).select("_id tmdbId title year poster published seasons").limit(10).lean();
    for (const value of series) {
      if (item.suggestedType === "episode") {
        const season = value.seasons?.find((entry) => entry.seasonNumber === item.seasonNumber);
        const episode = season?.episodes?.find((entry) => entry.episodeNumber === item.episodeNumber);
        matches.push({ model: "Series", objectId: value._id, seasonNumber: item.seasonNumber, episodeNumber: item.episodeNumber, score: tmdbId ? 1 : 0.9, data: { ...value, seasons: undefined, episode: episode || null } });
      } else matches.push({ model: "Series", objectId: value._id, score: tmdbId ? 1 : 0.7, data: value });
    }
  }
  return matches;
}

async function validateImport(id, req) {
  const item = await ContentImport.findById(id);
  if (!item) return null;
  const matches = await findMatches(item);
  item.validation.matches = matches;
  item.validation.status = "pending";
  item.processingStatus = "ready";
  item.history.push(historyEntry(req, "validate", "success", `${matches.length} correspondência(s) encontrada(s)`));
  await item.save();
  return item.toObject();
}

async function linkTmdb(id, { tmdbId, tmdbType }, req) {
  if (!Number.isSafeInteger(Number(tmdbId)) || !["movie", "tv"].includes(tmdbType)) throw Object.assign(new Error("Vínculo TMDB inválido."), { status: 400 });
  const item = await ContentImport.findById(id);
  if (!item) return null;
  if ((item.suggestedType === "movie" && tmdbType !== "movie") || (item.suggestedType !== "movie" && tmdbType !== "tv")) throw Object.assign(new Error("O tipo TMDB não corresponde ao registro."), { status: 400 });
  if (item.validation?.tmdbId === Number(tmdbId) && item.validation?.tmdbType === tmdbType && item.validation?.tmdbStatus === "validated") return item.toObject();
  if (tmdbType === "movie") await tmdbService.getMovieDetails(Number(tmdbId));
  item.validation.tmdbId = Number(tmdbId);
  item.validation.tmdbType = tmdbType;
  item.validation.tmdbStatus = "validated";
  item.validation.status = "pending";
  item.history.push(historyEntry(req, "tmdb-link", "success", `TMDB ${tmdbId} vinculado`));
  await item.save();
  return validateImport(id, req);
}

async function confirmValidation(id, { matchIndex = null, operation = "create", objectId, createSeriesConfirmed = false }, req) {
  const item = await ContentImport.findById(id);
  if (!item) return null;
  const matches = item.validation?.matches || [];
  if (matchIndex !== null && (!Number.isInteger(matchIndex) || !matches[matchIndex])) throw Object.assign(new Error("Correspondência inválida."), { status: 400 });
  if (matchIndex !== null) {
    const match = matches[matchIndex];
    item.finalReference = { model: match.model, objectId: match.objectId, seasonNumber: match.seasonNumber, episodeNumber: match.episodeNumber };
  }
  if (item.validation?.tmdbStatus !== "validated") throw Object.assign(new Error("Vincule e confirme o TMDB antes da revisão administrativa."), { status: 409 });
  const destinationId = item.finalReference?.objectId || objectId;
  if (matches.length > 0 && !destinationId) throw Object.assign(new Error("Selecione uma correspondência local antes de confirmar a revisão."), { status: 409 });
  if (item.suggestedType === "series" && operation === "create" && !destinationId && createSeriesConfirmed !== true) throw Object.assign(new Error("Confirme explicitamente a criação da série."), { status: 409 });
  if (item.suggestedType === "episode" && !destinationId && !(operation === "create" && createSeriesConfirmed === true)) throw Object.assign(new Error("Selecione uma série existente ou confirme a criação da série."), { status: 409 });
  if (matches.length === 0 && !destinationId && item.suggestedType === "movie" && operation !== "create") throw Object.assign(new Error("Selecione o filme de destino antes de confirmar a revisão."), { status: 409 });
  item.validation.status = "validated";
  item.history.push(historyEntry(req, "validation-confirm", "success", "Validação confirmada pelo administrador"));
  await item.save(); return item.toObject();
}

const MOVIE_UPDATE_FIELDS = ["title", "overview", "poster", "backdrop", "year", "genres"];
const SERIES_UPDATE_FIELDS = ["title", "overview", "poster", "backdrop", "year", "genres", "status"];
const EPISODE_UPDATE_FIELDS = ["title", "overview", "duration", "still"];
const EPISODE_CREATE_FIELDS = ["title", "overview", "duration", "still"];

function pick(data, fields) {
  return Object.fromEntries(fields.filter((field) => data?.[field] !== undefined).map((field) => [field, data[field]]));
}

async function operationPreview(ids, operation, fields = []) {
  const items = await ContentImport.find({ _id: { $in: ids } }).lean();
  const eligible = items.filter((item) => item.processingStatus !== "processed" && item.processingStatus !== "rejected" && (operation === "reject" || item.validation?.status === "validated"));
  return { total: items.length, eligible: eligible.length, conflicts: items.filter((item) => (item.validation?.matches || []).length > 1).length, manualReview: items.length - eligible.length, ignored: items.length - eligible.length, fields, items: eligible };
}

async function processOne(id, operation, payload, req) {
  const lock = randomUUID();
  const item = await ContentImport.findOneAndUpdate({ _id: id, processingStatus: { $in: ["pending", "ready", "error"] }, operationLock: { $exists: false } }, { $set: { operationLock: lock } }, { new: true });
  if (!item) return { id, result: "skipped", message: "Registro já processado ou em processamento." };
  try {
    if (operation === "reject" || operation === "ignore") {
      item.processingStatus = "rejected";
      item.history.push(historyEntry(req, operation, "success", "Registro rejeitado pelo administrador"));
    } else {
      if (item.validation?.status !== "validated") throw new Error("Registro exige validação administrativa antes do processamento.");
      if (item.suggestedType === "movie") {
        const data = pick(payload, MOVIE_UPDATE_FIELDS);
        if (operation === "create") {
          if (payload.reproductionAuthorizationConfirmed !== true || !payload.reproductionUrl || !streamRouter.isValidUrl(payload.reproductionUrl)) throw new Error("Informe uma URL de reprodução válida e confirme sua autorização separadamente.");
          const movie = await Movie.create({ ...data, tmdbId: item.validation.tmdbId, videoUrl: payload.reproductionUrl.trim(), published: false, validationStatus: "validated" });
          item.finalReference = { model: "Movie", objectId: movie._id };
        } else {
          const movie = await Movie.findById(item.finalReference?.objectId || payload.objectId);
          if (!movie) throw new Error("Filme existente não encontrado.");
          const before = pick(movie.toObject(), Object.keys(data));
          Object.assign(movie, data); await movie.save();
          item.finalReference = { model: "Movie", objectId: movie._id };
          item.history.push(historyEntry(req, "update", "success", "Atualização parcial aplicada"));
          item.history[item.history.length - 1].fields = Object.keys(data); item.history[item.history.length - 1].before = before; item.history[item.history.length - 1].after = data;
        }
      } else {
        if (operation === "create" && item.suggestedType === "series") {
          if (payload.createSeriesConfirmed !== true) throw new Error("Confirme explicitamente a criação da série antes do processamento.");
          const series = await Series.create({ title: payload.title || item.extractedTitle, tmdbId: item.validation.tmdbId, overview: payload.overview || "", poster: payload.poster || item.thumbnail, published: false, validationStatus: "validated", seasons: [] });
          item.finalReference = { model: "Series", objectId: series._id };
        } else {
        let series = await Series.findById(item.finalReference?.objectId || payload.objectId);
        if (!series && item.suggestedType === "episode" && operation === "create" && payload.createSeriesConfirmed === true) {
          if (!item.validation?.tmdbId) throw new Error("Vincule o TMDB da série antes de criar uma série nova.");
          series = await Series.create({
            title: payload.seriesTitle || item.metadata?.seriesName || item.extractedTitle,
            tmdbId: item.validation.tmdbId,
            overview: payload.overview || "",
            poster: payload.poster || item.thumbnail,
            published: false,
            validationStatus: "validated",
            seasons: [],
          });
        }
        if (!series) throw new Error("Série existente não encontrada.");
        if (item.suggestedType === "episode") {
          if (!Number.isSafeInteger(item.seasonNumber) || !Number.isSafeInteger(item.episodeNumber)) throw new Error("Temporada e episódio precisam ser identificados antes do processamento.");
          let season = series.seasons.find((value) => value.seasonNumber === item.seasonNumber);
          if (!season && operation === "create" && payload.createSeason === true) {
            series.seasons.push({ seasonNumber: item.seasonNumber, title: item.seasonNumber === 0 ? "Especiais" : `Temporada ${item.seasonNumber}`, episodes: [] });
            season = series.seasons.find((value) => value.seasonNumber === item.seasonNumber);
          }
          if (!season) throw new Error("Temporada não encontrada. Confirme a criação da temporada para continuar.");
          const episode = season.episodes.find((value) => value.episodeNumber === item.episodeNumber);
          if (operation === "create") {
            if (episode) throw new Error("Episódio já existe nesta série e temporada.");
            if (payload.reproductionAuthorizationConfirmed !== true || !payload.reproductionUrl || !streamRouter.isValidUrl(payload.reproductionUrl)) throw new Error("Informe uma URL de reprodução válida e confirme sua autorização separadamente.");
            const data = pick(payload, EPISODE_CREATE_FIELDS);
            season.episodes.push({ ...data, title: data.title || item.extractedTitle, episodeNumber: item.episodeNumber, videoUrl: payload.reproductionUrl.trim(), published: false, validationStatus: "validated", views: 0 });
          } else {
            if (!episode) throw new Error("Episódio existente não encontrado.");
            const data = pick(payload, EPISODE_UPDATE_FIELDS);
            Object.assign(episode, data);
            if (payload.reproductionUrl !== undefined) {
              if (payload.reproductionAuthorizationConfirmed !== true || !payload.reproductionUrl || !streamRouter.isValidUrl(payload.reproductionUrl)) throw new Error("A nova URL de reprodução precisa ser válida e autorizada.");
              episode.videoUrl = payload.reproductionUrl.trim();
            }
          }
          await series.save();
          item.finalReference = { model: "Series", objectId: series._id, seasonNumber: item.seasonNumber, episodeNumber: item.episodeNumber };
        } else {
          const data = pick(payload, SERIES_UPDATE_FIELDS); Object.assign(series, data); await series.save(); item.finalReference = { model: "Series", objectId: series._id };
        }
        }
      }
      item.processingStatus = "processed";
      item.history.push(historyEntry(req, operation, "success", "Processamento concluído"));
    }
    item.operationLock = undefined; await item.save(); return { id, result: "success" };
  } catch (error) {
    item.processingStatus = "error"; item.operationLock = undefined; item.history.push(historyEntry(req, operation, "error", error.message)); await item.save(); return { id, result: "error", message: error.message };
  }
}

async function processMany(ids, operation, payload, req) {
  const results = [];
  for (const id of ids) results.push(await processOne(id, operation, payload, req));
  return results;
}

module.exports = {
  analyzeHtml,
  createBatch,
  createStructuredBatch,
  list,
  getById,
  updatePrepared,
  appendHistory,
  validateImport,
  linkTmdb,
  confirmValidation,
  operationPreview,
  processOne,
  processMany,
};
