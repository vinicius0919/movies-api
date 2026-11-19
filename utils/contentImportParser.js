const cheerio = require("cheerio");

const MAX_HTML_LENGTH = 100_000;
const MAX_RECORDS = 500;
const DEFAULT_SOURCE_ORIGIN = "https://www.tokyvideo.com";

function isUnsafeOrigin(url) {
  const hostname = url.hostname.toLowerCase();
  return hostname === "localhost" || hostname === "[::1]" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function sourceOrigin(value) {
  try {
    const origin = new URL(value || process.env.CONTENT_IMPORT_SOURCE_ORIGIN || DEFAULT_SOURCE_ORIGIN);
    if (origin.protocol !== "https:" || origin.username || origin.password || isUnsafeOrigin(origin)) throw new Error("unsafe origin");
    origin.pathname = "";
    origin.search = "";
    origin.hash = "";
    return origin;
  } catch {
    return new URL(DEFAULT_SOURCE_ORIGIN);
  }
}

function normalizeUrl(rawUrl, baseOrigin = DEFAULT_SOURCE_ORIGIN) {
  if (typeof rawUrl !== "string") return null;

  const value = rawUrl.trim();
  if (!value || value.startsWith("//")) return null;

  if (value.startsWith("/")) {
    try {
      const url = new URL(value, sourceOrigin(baseOrigin));
      url.hash = "";
      return url.toString();
    } catch {
      return null;
    }
  }

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || isUnsafeOrigin(url)) {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function titleFromUrl(url) {
  const path = url.split("?")[0];
  const slug = path.substring(path.lastIndexOf("/") + 1);
  return decodeURIComponent(slug || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b(?:dublado|legendado|pt br|online)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEpisode(value) {
  const text = String(value || "");
  const compound = text.match(/(?:s|t)(\d{1,3})[\s._-]*(?:e|ep)(\d{1,4})/i) ||
    text.match(/(?:t|temporada)[\s._-]*(\d{1,3})[\s._-]*(?:ep|epis[oó]dio)[\s._-]*(\d{1,4})/i);

  if (compound) {
    return {
      seasonNumber: Number(compound[1]),
      episodeNumber: Number(compound[2]),
    };
  }

  const episode = text.match(/(?:ep|epis[oó]dio)[\s._-]*(\d{1,4})\b/i);
  if (episode) return { episodeNumber: Number(episode[1]) };

  return null;
}

function parseDuration(value) {
  const match = String(value || "").match(/\b(\d{1,3})(?::([0-5]\d))?\s*(?:min|m|h)?\b/i);
  if (!match) return null;
  const first = Number(match[1]);
  return match[2] ? first * 60 + Number(match[2]) : first;
}

function extractRecord($, element, baseOrigin) {
  const node = $(element);
  const rawUrl = node.attr("href") || node.attr("data-url");
  const sourceUrl = normalizeUrl(rawUrl, baseOrigin);
  if (!sourceUrl) return null;

  const container = node.closest("article, li, [data-video], [data-content]");
  const scope = container.length ? container : node;
  const title = (
    node.attr("data-title") ||
    node.attr("title") ||
    node.attr("aria-label") ||
    scope.find("[data-title], .title, .name, h1, h2, h3, h4").first().text() ||
    node.text() ||
    titleFromUrl(sourceUrl)
  ).trim();
  const image = scope.find("img").first();
  const rawThumbnail = image.attr("src") || image.attr("data-src") || image.attr("data-lazy-src") || null;
  const thumbnail = rawThumbnail ? normalizeUrl(rawThumbnail, baseOrigin) : null;
  const rawDuration = node.attr("data-duration") || scope.find("[data-duration], .duration, time").first().text();
  const episode = parseEpisode(`${title} ${sourceUrl}`);

  return {
    sourceUrl,
    sourceKey: sourceUrl.toLowerCase(),
    extractedTitle: title.slice(0, 500),
    normalizedTitle: normalizeTitle(title),
    suggestedType: episode ? "episode" : /\b(series|série|temporada|season)\b/i.test(`${title} ${sourceUrl}`) ? "series" : "movie",
    seasonNumber: episode?.seasonNumber,
    episodeNumber: episode?.episodeNumber,
    duration: parseDuration(rawDuration),
    thumbnail,
    metadata: {
      htmlTag: element.tagName,
    },
  };
}

function analyzeHtml(html, baseOrigin) {
  if (typeof html !== "string" || !html.trim()) {
    throw Object.assign(new Error("HTML obrigatório."), { status: 400 });
  }
  if (html.length > MAX_HTML_LENGTH) {
    throw Object.assign(new Error("HTML excede o limite permitido."), { status: 413 });
  }

  const $ = cheerio.load(html, { decodeEntities: true });
  let linksFound = 0;
  const records = [];
  const seen = new Set();

  $("a[href], [data-url]").each((_, element) => {
    const record = extractRecord($, element, baseOrigin);
    if (!record) return;
    linksFound += 1;
    if (seen.has(record.sourceKey)) return;
    seen.add(record.sourceKey);
    records.push(record);
  });

  if (records.length > MAX_RECORDS) {
    throw Object.assign(new Error(`A análise excede o limite de ${MAX_RECORDS} registros.`), { status: 413 });
  }

  return {
    linksFound,
    uniqueLinks: records.length,
    duplicates: Math.max(0, linksFound - records.length),
    records,
  };
}

module.exports = {
  MAX_HTML_LENGTH,
  MAX_RECORDS,
  normalizeUrl,
  normalizeTitle,
  parseEpisode,
  analyzeHtml,
};
