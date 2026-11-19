const test = require("node:test");
const assert = require("node:assert/strict");

const {
  analyzeHtml,
  normalizeUrl,
  parseEpisode,
} = require("../utils/contentImportParser");

test("extrai URLs relativas e absolutas sem executar HTML", () => {
  const result = analyzeHtml(`
    <script>window.executed = true</script>
    <a href="/br/video/planet-survival-dublado-pt-br-ep-26">Episódio 26</a>
    <a href="https://www.tokyvideo.com/br/video/planet-survival-dublado-pt-br-ep-26">duplicado</a>
    <a href="/br/video/planet-survival-dublado-pt-br-ep-26">duplicado relativo</a>
    <a href="javascript:alert(1)">inseguro</a>
  `);

  assert.equal(result.linksFound, 3);
  assert.equal(result.uniqueLinks, 1);
  assert.equal(result.duplicates, 2);
  assert.equal(result.records[0].sourceUrl, "https://www.tokyvideo.com/br/video/planet-survival-dublado-pt-br-ep-26");
  assert.equal(result.records[0].sourceUrl.includes("localhost"), false);
  assert.equal(result.records[0].suggestedType, "episode");
  assert.equal(result.records[0].episodeNumber, 26);
});

test("reconhece padrões compostos de temporada e episódio", () => {
  assert.deepEqual(parseEpisode("The Show S01E02"), { seasonNumber: 1, episodeNumber: 2 });
  assert.deepEqual(parseEpisode("The Show t01-ep02"), { seasonNumber: 1, episodeNumber: 2 });
  assert.deepEqual(parseEpisode("episodio-26"), { episodeNumber: 26 });
  assert.equal(parseEpisode("filme 2024"), null);
});

test("rejeita URLs perigosas e HTML acima do limite", () => {
  assert.equal(normalizeUrl("javascript:alert(1)"), null);
  assert.equal(normalizeUrl("data:text/html,<script>alert(1)</script>"), null);
  assert.throws(() => analyzeHtml("x".repeat(100_001)), /excede o limite/i);
});
