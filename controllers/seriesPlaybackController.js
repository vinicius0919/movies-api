
const mongoose = require("mongoose");
const Series = require("../models/Series");
const streamRouter = require("../services/streamRouter");

// Hosts autorizados para retransmissão.
// Exemplo: SERIES_STREAM_HOSTS=media.exemplo.com
const STREAM_HOSTS = new Set(
  (process.env.SERIES_STREAM_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
);

// =========================================
// VALIDAR PARÂMETROS
// =========================================

function parseEpisodeParams(params) {
  const { id, season, episode } = params;

  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);

  if (
    !mongoose.isValidObjectId(id) ||
    !/^\d+$/.test(String(season)) ||
    !/^\d+$/.test(String(episode)) ||
    !Number.isSafeInteger(seasonNumber) ||
    !Number.isSafeInteger(episodeNumber)
  ) {
    return null;
  }

  return { id, seasonNumber, episodeNumber };
}

// =========================================
// LOCALIZAR FONTE NO BANCO
// =========================================

async function loadEpisode(params) {
  const series = await Series.findOne({
    _id: params.id,
    published: true,
  })
    .select("seasons")
    .lean();

  if (!series) {
    return { error: "Série não encontrada." };
  }

  const season = series.seasons?.find(
    (item) =>
      item.seasonNumber === params.seasonNumber
  );

  const episode = season?.episodes?.find(
    (item) =>
      item.episodeNumber === params.episodeNumber
  );

  if (!episode) {
    return { error: "Episódio não encontrado." };
  }

  const source = [...(episode.sources || [])]
    .filter(
      (item) =>
        item.active &&
        typeof item.url === "string" &&
        item.url.trim()
    )
    .sort(
      (a, b) =>
        (a.priority ?? 0) - (b.priority ?? 0)
    )[0];

  const videoUrl = source?.url || episode.videoUrl;

  if (
    typeof videoUrl !== "string" ||
    !videoUrl.trim()
  ) {
    return {
      error: "Nenhuma fonte cadastrada para o episódio.",
    };
  }

  return { videoUrl: videoUrl.trim() };
}

// =========================================
// YOUTUBE EMBED
// =========================================

function getYouTubeEmbed(url) {
  const host = url.hostname.toLowerCase();
  let videoId = null;

  if (
    [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
    ].includes(host)
  ) {
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v");
    } else {
      videoId = url.pathname.match(
        /^\/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})\/?$/
      )?.[1];
    }
  } else if (host === "youtu.be") {
    videoId = url.pathname.match(
      /^\/([a-zA-Z0-9_-]{11})\/?$/
    )?.[1];
  }

  return videoId &&
    /^[a-zA-Z0-9_-]{11}$/.test(videoId)
    ? `https://www.youtube.com/embed/${videoId}`
    : null;
}

// =========================================
// CLASSIFICAR REPRODUÇÃO
// =========================================

function classifyPlayback(videoUrl, params) {
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
    url.password ||
    url.port
  ) {
    return null;
  }

  const embedUrl = getYouTubeEmbed(url);

  if (embedUrl) {
    return {
      provider: "youtube",
      embedUrl,
    };
  }

  // Streaming interno somente para hosts
  // autorizados e suportados pelo serviço.
  if (
    STREAM_HOSTS.has(url.hostname.toLowerCase()) &&
    streamRouter.isValidUrl(url.toString())
  ) {
    return {
      provider: "native",
      streamPath:
        `/api/stream/series/${encodeURIComponent(params.id)}` +
        `/seasons/${params.seasonNumber}` +
        `/episodes/${params.episodeNumber}`,
    };
  }

  // Página externa: não usar como src de video.
  return {
    provider: "external",
    watchUrl: url.toString(),
  };
}

// =========================================
// AUTORIZAR EPISÓDIO
// =========================================

async function getEpisodePlayback(req, res) {
  res.set("Cache-Control", "private, no-store");

  const params = parseEpisodeParams(req.params);

  if (!params) {
    return res.status(400).json({
      error: "Parâmetros inválidos.",
    });
  }

  try {
    const result = await loadEpisode(params);

    if (result.error) {
      return res.status(404).json({
        error: result.error,
      });
    }

    const playback = classifyPlayback(
      result.videoUrl,
      params
    );

    if (!playback) {
      return res.status(422).json({
        error: "Fonte de reprodução inválida.",
      });
    }

    return res.json(playback);
  } catch (error) {
    console.error("[SERIES PLAYBACK]", error);

    return res.status(500).json({
      error: "Falha ao autorizar episódio.",
    });
  }
}

// =========================================
// TRANSMITIR EPISÓDIO
// =========================================

async function streamSeriesEpisode(req, res) {
  res.set("Cache-Control", "private, no-store");

  const params = parseEpisodeParams(req.params);

  if (!params) {
    return res.status(400).json({
      error: "Parâmetros inválidos.",
    });
  }

  try {
    const result = await loadEpisode(params);

    if (result.error) {
      return res.status(404).json({
        error: result.error,
      });
    }

    const playback = classifyPlayback(
      result.videoUrl,
      params
    );

    if (playback?.provider !== "native") {
      return res.status(422).json({
        error:
          "Esta fonte não está autorizada para streaming interno.",
      });
    }

    await streamRouter.streamWithFallback(
      result.videoUrl,
      req,
      res
    );
  } catch (error) {
    console.error("[SERIES STREAM]", error);

    if (
      res.destroyed ||
      res.writableEnded ||
      req.aborted
    ) {
      return;
    }

    if (res.headersSent) {
      res.destroy();
      return;
    }

    return res.status(502).json({
      error: "Falha na transmissão do episódio.",
    });
  }
}

module.exports = {
  getEpisodePlayback,
  streamSeriesEpisode,
};
