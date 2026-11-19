const test = require("node:test");
const assert = require("node:assert/strict");

const ContentImport = require("../models/ContentImport");
const Series = require("../models/Series");
const service = require("../services/contentImportService");

function importItem(overrides = {}) {
  return {
    _id: "import-id",
    processingStatus: "ready",
    validation: { status: "validated", tmdbStatus: "unlinked" },
    suggestedType: "episode",
    seasonNumber: 1,
    episodeNumber: 2,
    extractedTitle: "Série - Episódio 2",
    finalReference: undefined,
    history: [],
    toObject() { return { ...this, history: [...this.history] }; },
    async save() { return this; },
    ...overrides,
  };
}

async function withMocks(item, series, callback) {
  const originalFindOneAndUpdate = ContentImport.findOneAndUpdate;
  const originalFindById = Series.findById;
  ContentImport.findOneAndUpdate = async () => item;
  Series.findById = async () => series;
  try {
    return await callback();
  } finally {
    ContentImport.findOneAndUpdate = originalFindOneAndUpdate;
    Series.findById = originalFindById;
  }
}

function seriesWithSeason(episodes = []) {
  return {
    seasons: [{ seasonNumber: 1, title: "Temporada 1", episodes }],
    saved: 0,
    async save() { this.saved += 1; return this; },
  };
}

const playbackPayload = {
  objectId: "series-id",
  reproductionUrl: "https://www.youtube.com/watch?v=abcdefghijk",
  reproductionAuthorizationConfirmed: true,
};

test("cria episódio novo em temporada existente sem substituir episódios", async () => {
  const existing = { episodeNumber: 1, title: "Episódio 1", videoUrl: "https://www.youtube.com/watch?v=12345678901" };
  const series = seriesWithSeason([existing]);
  const item = importItem();

  const result = await withMocks(item, series, () => service.processOne(item._id, "create", { ...playbackPayload, title: "Episódio 2" }, {}));

  assert.equal(result.result, "success");
  assert.equal(series.seasons[0].episodes.length, 2);
  assert.equal(series.seasons[0].episodes[1].episodeNumber, 2);
  assert.equal(series.seasons[0].episodes[1].title, "Episódio 2");
  assert.equal(series.seasons[0].episodes[1].published, false);
  assert.equal(series.seasons[0].episodes[1].videoUrl, playbackPayload.reproductionUrl);
  assert.equal(series.seasons[0].episodes[0], existing);
});

test("atualiza somente campos selecionados do episódio existente", async () => {
  const existing = { episodeNumber: 2, title: "Título antigo", overview: "Sinopse", videoUrl: "https://www.youtube.com/watch?v=12345678901", published: true, views: 17 };
  const series = seriesWithSeason([existing]);
  const item = importItem();

  const result = await withMocks(item, series, () => service.processOne(item._id, "update", { objectId: "series-id", title: "Título novo" }, {}));

  assert.equal(result.result, "success");
  assert.equal(existing.title, "Título novo");
  assert.equal(existing.overview, "Sinopse");
  assert.equal(existing.videoUrl, "https://www.youtube.com/watch?v=12345678901");
  assert.equal(existing.published, true);
  assert.equal(existing.views, 17);
});

test("recusa episódio duplicado sem alterar a temporada", async () => {
  const series = seriesWithSeason([{ episodeNumber: 2, title: "Já existe" }]);
  const item = importItem();

  const result = await withMocks(item, series, () => service.processOne(item._id, "create", playbackPayload, {}));

  assert.equal(result.result, "error");
  assert.match(result.message, /já existe/i);
  assert.equal(series.seasons[0].episodes.length, 1);
  assert.equal(series.saved, 0);
});

test("exige autorização explícita para criar temporada ausente", async () => {
  const series = { seasons: [], async save() { throw new Error("não deveria salvar"); } };
  const item = importItem({ seasonNumber: 3 });

  const result = await withMocks(item, series, () => service.processOne(item._id, "create", playbackPayload, {}));

  assert.equal(result.result, "error");
  assert.match(result.message, /temporada não encontrada/i);
  assert.equal(series.seasons.length, 0);
});

test("cria temporada ausente somente com createSeason confirmado", async () => {
  const series = { seasons: [], async save() { return this; } };
  const item = importItem({ seasonNumber: 3 });

  const result = await withMocks(item, series, () => service.processOne(item._id, "create", { ...playbackPayload, createSeason: true }, {}));

  assert.equal(result.result, "success");
  assert.equal(series.seasons[0].seasonNumber, 3);
  assert.equal(series.seasons[0].episodes[0].episodeNumber, 2);
});

test("não processa registro apenas com TMDB validado", async () => {
  const series = seriesWithSeason([]);
  const item = importItem({ validation: { status: "pending", tmdbStatus: "validated" } });

  const result = await withMocks(item, series, () => service.processOne(item._id, "create", { ...playbackPayload }, {}));

  assert.equal(result.result, "error");
  assert.match(result.message, /validação administrativa/i);
});

test("edita dados preparados, registra a alteração e reinicia a validação", async () => {
  const item = importItem({ suggestedType: "movie", seasonNumber: undefined, episodeNumber: undefined, validation: { status: "validated", tmdbStatus: "validated" }, finalReference: { model: "Movie", objectId: "movie-id" } });
  const originalFindById = ContentImport.findById;
  ContentImport.findById = async () => item;
  try {
    const updated = await service.updatePrepared(item._id, { extractedTitle: "Título corrigido", suggestedType: "movie", duration: 90 }, { user: { id: "admin-id" } });
    assert.equal(updated.extractedTitle, "Título corrigido");
    assert.equal(item.validation.status, "unreviewed");
    assert.equal(item.validation.tmdbStatus, "unlinked");
    assert.equal(item.finalReference, undefined);
    assert.equal(item.history.at(-1).operation, "prepared-update");
    assert.deepEqual(item.history.at(-1).fields.sort(), ["duration", "extractedTitle", "metadata"].sort());
  } finally {
    ContentImport.findById = originalFindById;
  }
});

test("separa candidato de reprodução e registra compatibilidade sem usar a URL de origem automaticamente", async () => {
  const item = importItem({ suggestedType: "movie", seasonNumber: undefined, episodeNumber: undefined, sourceUrl: "https://www.tokyvideo.com/br/video/original" });
  const originalFindById = ContentImport.findById;
  ContentImport.findById = async () => item;
  try {
    const updated = await service.updatePrepared(item._id, {
      extractedTitle: item.extractedTitle,
      suggestedType: "movie",
      reproductionCandidateUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    }, {});
    assert.equal(updated.reproductionCandidateUrl, "https://www.youtube.com/watch?v=abcdefghijk");
    assert.equal(updated.reproductionCandidateStatus, "compatible");
    assert.equal(updated.sourceUrl, "https://www.tokyvideo.com/br/video/original");
  } finally {
    ContentImport.findById = originalFindById;
  }
});

test("confirma revisão administrativa para criação sem correspondência local", async () => {
  const item = importItem({ validation: { status: "pending", tmdbStatus: "validated", tmdbId: 238841, tmdbType: "tv", matches: [] } });
  const originalFindById = ContentImport.findById;
  ContentImport.findById = async () => item;
  try {
    const confirmed = await service.confirmValidation(item._id, { operation: "create", createSeriesConfirmed: true }, {});
    assert.equal(confirmed.validation.status, "validated");
    assert.equal(item.history.at(-1).operation, "validation-confirm");
  } finally {
    ContentImport.findById = originalFindById;
  }
});

test("não confirma criação de episódio sem série selecionada ou criação autorizada", async () => {
  const item = importItem({ validation: { status: "pending", tmdbStatus: "validated", tmdbId: 238841, tmdbType: "tv", matches: [] } });
  const originalFindById = ContentImport.findById;
  ContentImport.findById = async () => item;
  try {
    await assert.rejects(() => service.confirmValidation(item._id, { operation: "create" }, {}), /confirme a criação da série/i);
    assert.equal(item.validation.status, "pending");
  } finally {
    ContentImport.findById = originalFindById;
  }
});

test("não cria histórico nem reinicia validação ao salvar dados idênticos", async () => {
  const item = importItem({
    suggestedType: "movie",
    seasonNumber: undefined,
    episodeNumber: undefined,
    duration: 90,
    thumbnail: "https://www.tokyvideo.com/cover.jpg",
    metadata: {},
    reproductionCandidateUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    reproductionCandidateStatus: "compatible",
    validation: { status: "validated", tmdbStatus: "validated", tmdbId: 321, tmdbType: "movie", matches: [] },
  });
  const originalFindById = ContentImport.findById;
  ContentImport.findById = async () => item;
  try {
    await service.updatePrepared(item._id, {
      extractedTitle: item.extractedTitle,
      suggestedType: "movie",
      duration: 90,
      thumbnail: item.thumbnail,
      reproductionCandidateUrl: item.reproductionCandidateUrl,
    }, {});
    assert.equal(item.validation.status, "validated");
    assert.equal(item.history.length, 0);
  } finally {
    ContentImport.findById = originalFindById;
  }
});

test("cria série e temporada somente com confirmações explícitas ao processar episódio", async () => {
  const series = { seasons: [], async save() { return this; } };
  const item = importItem({ metadata: { seriesName: "Hero Inside" }, validation: { status: "validated", tmdbStatus: "validated", tmdbId: 238841, tmdbType: "tv", matches: [] } });
  const originalFindById = Series.findById;
  const originalCreate = Series.create;
  const originalImportLock = ContentImport.findOneAndUpdate;
  ContentImport.findOneAndUpdate = async () => item;
  Series.findById = async () => null;
  Series.create = async (data) => Object.assign(series, data);
  try {
    const result = await service.processOne(item._id, "create", { ...playbackPayload, createSeriesConfirmed: true, createSeason: true }, {});
    assert.equal(result.result, "success");
    assert.equal(series.title, "Hero Inside");
    assert.equal(series.seasons[0].seasonNumber, 1);
    assert.equal(series.seasons[0].episodes[0].episodeNumber, 2);
  } finally {
    Series.findById = originalFindById;
    Series.create = originalCreate;
    ContentImport.findOneAndUpdate = originalImportLock;
  }
});
