const test = require("node:test");
const assert = require("node:assert/strict");

const Movie = require("../models/Movie");
const Series = require("../models/Series");
const {
  visibleDocumentQuery,
  isVisible,
} = require("../utils/publication");

test("documentos legados sem published continuam visíveis", () => {
  assert.deepEqual(visibleDocumentQuery(), {
    $or: [
      { published: true },
      { published: { $exists: false } },
    ],
  });
  assert.equal(isVisible(undefined), true);
  assert.equal(isVisible(true), true);
  assert.equal(isVisible(false), false);
});

test("modelos não aplicam default de publicação a documentos legados", () => {
  const movie = new Movie({
    title: "Filme legado",
    videoUrl: "https://example.com/video.mp4",
  }).toObject();
  const series = new Series({
    title: "Série legada",
    seasons: [
      {
        seasonNumber: 1,
        episodes: [
          {
            episodeNumber: 1,
            title: "Episódio legado",
          },
        ],
      },
    ],
  }).toObject();

  assert.equal(Object.hasOwn(movie, "published"), false);
  assert.equal(Object.hasOwn(series, "published"), false);
  assert.equal(Object.hasOwn(series.seasons[0].episodes[0], "published"), false);
});

test("conteúdo explicitamente não publicado permanece oculto", () => {
  assert.equal(isVisible(false), false);
});
