
const mongoose = require("mongoose");
const Series = require("../models/Series");
const streamRouter = require("../services/streamRouter");

function parseParams({ id, season, episode }) {
  if (!mongoose.isValidObjectId(id)) return null;
  if (!/^\d+$/.test(String(season)) || !/^\d+$/.test(String(episode))) {
    return null;
  }

  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);

  if (!Number.isSafeInteger(seasonNumber) || !Number.isSafeInteger(episodeNumber)) {
    return null;
  }

  return { id, seasonNumber, episodeNumber };
}

async function findEpisodeSource({ id, seasonNumber, episodeNumber }) {
  const series = await Series.findOne({ _id: id, published: true })
    .select("seasons")
    .lean();

  if (!series) {
    return { status: 404, error: "Série não encontrada." };
  }

  const selectedSeason = series.seasons?.find(
    (item) => item.seasonNumber === seasonNumber
  );
  const selectedEpisode = selectedSeason?.episodes?.find(
    (item) => item.episodeNumber === episodeNumber
  );

  if (!selectedEpisode) {
    return { status: 404, error: "Episódio não encontrado." };
  }

  const activeSource = (selectedEpisode.sources || [])
    .filter((item) => item.active && typeof item.url === "string" && item.url.trim())
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))[0];

  const videoUrl = (activeSource?.url || selectedEpisode.videoUrl || "").trim();

  if (!videoUrl) {
    return { status: 404, error: "Fonte de reprodução não cadastrada." };
  }

  return { videoUrl };
}

function youtubeEmbedUrl(videoUrl) {
  let url;
  try {
    url = new URL(videoUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;

  const host = url.hostname.toLowerCase();
  let id = null;

  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
    if (url.pathname === "/watch") {
      id = url.searchParams.get("v");
    } else {
      id = url.pathname.match(/^\/(?:embed|shorts)\/([\w-]{11})\/?$/)?.[1];
    }
  } else if (host === "youtu.be") {
    id = url.pathname.match(/^\/([\w-]{11})\/?$/)?.[1];
  }

  return id && /^[\w-]{11}$/.test(id)
    ? `https://www.youtube.com/embed/${id}`
    : null;
}

function classifySource(videoUrl, params) {
  let url;
  try {
    url = new URL(videoUrl);
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    return null;
  }

  const embedUrl = youtubeEmbedUrl(videoUrl);
  if (embedUrl) {
    return { provider: "youtube", embedUrl };
  }

  // Mesmo reconhecimento de provedores usado pelo streaming de filmes.
  // O cliente recebe somente um caminho interno, nunca a URL da fonte.
  if (streamRouter.isValidUrl(videoUrl)) {
    return {
      provider: "native",
      streamPath: `/api/stream/series/${params.id}/seasons/${params.seasonNumber}/episodes/${params.episodeNumber}`,
    };
  }

  return { provider: "external", watchUrl: url.toString() };
}

async function getEpisodePlayback(req, res) {
  res.set("Cache-Control", "private, no-store");

  const params = parseParams(req.params);
  if (!params) {
    return res.status(400).json({ error: "Parâmetros inválidos." });
  }

  try {
    const result = await findEpisodeSource(params);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const playback = classifySource(result.videoUrl, params);
    if (!playback) {
      return res.status(422).json({ error: "Fonte de reprodução inválida." });
    }

    return res.json(playback);
  } catch (error) {
    console.error("[SERIES PLAYBACK]", error);
    return res.status(500).json({ error: "Falha ao autorizar episódio." });
  }
}

async function streamSeriesEpisode(req, res) {
  res.set("Cache-Control", "private, no-store");

  const params = parseParams(req.params);
  if (!params) {
    return res.status(400).json({ error: "Parâmetros inválidos." });
  }

  try {
    const result = await findEpisodeSource(params);
    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    const playback = classifySource(result.videoUrl, params);
    if (playback?.provider !== "native") {
      return res.status(422).json({
        error: "Esta fonte não suporta transmissão pelo player nativo.",
      });
    }

    // Reutiliza o mesmo pipeline dos filmes, incluindo Range e recuperação.
    await streamRouter.streamWithFallback(result.videoUrl, req, res);
  } catch (error) {
    console.error("[SERIES STREAM]", {
      message: error?.message,
      code: error?.code,
      headersSent: res.headersSent,
    });

    if (res.destroyed || res.writableEnded || req.aborted) return;
    if (res.headersSent) {
      res.destroy();
      return;
    }

    return res.status(502).json({ error: "Falha na transmissão do episódio." });
  }
}

module.exports = { getEpisodePlayback, streamSeriesEpisode };
