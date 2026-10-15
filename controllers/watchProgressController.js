
const mongoose = require("mongoose");

const Series = require("../models/Series");
const WatchProgress = require("../models/WatchProgress");

const getUserId = (req) =>
  req.user?._id ||
  req.user?.id ||
  req.user?.userId;

const isAdmin = (req) => req.user?.role === "admin";

const validNumber = (value) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0;

async function getSeriesProgress(req, res) {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        error: "Sessão inválida",
      });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: "Identificador inválido",
      });
    }

    const progress = await WatchProgress.findOne({
      user: userId,
      series: id,
    }).lean();

    return res.json({ progress: progress || null });
  } catch (error) {
    console.error("[WatchProgress] GET:", error);
    return res.status(500).json({
      error: "Erro ao consultar progresso",
    });
  }
}

async function saveSeriesProgress(req, res) {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const {
      seasonNumber,
      episodeNumber,
      currentTime,
      duration,
      completed,
    } = req.body || {};

    if (!userId) {
      return res.status(401).json({
        error: "Sessão inválida",
      });
    }

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        error: "Identificador inválido",
      });
    }

    if (
      !Number.isInteger(seasonNumber) ||
      seasonNumber < 0 ||
      !Number.isInteger(episodeNumber) ||
      episodeNumber < 0 ||
      !validNumber(currentTime) ||
      !validNumber(duration) ||
      typeof completed !== "boolean"
    ) {
      return res.status(400).json({
        error: "Dados de progresso inválidos",
      });
    }

    const series = await Series.findOne({
      _id: id,
      ...(isAdmin(req) ? {} : { published: true }),
    })
      .select("seasons.seasonNumber seasons.episodes.episodeNumber")
      .lean();

    if (!series) {
      return res.status(404).json({
        error: "Série não encontrada",
      });
    }

    const season = series.seasons.find(
      (item) => item.seasonNumber === seasonNumber
    );

    const episode = season?.episodes.find(
      (item) => item.episodeNumber === episodeNumber
    );

    if (!episode) {
      return res.status(404).json({
        error: "Episódio não encontrado",
      });
    }

    const safeDuration = duration;
    const safeTime =
      safeDuration > 0
        ? Math.min(currentTime, safeDuration)
        : currentTime;

    const progress = await WatchProgress.findOneAndUpdate(
      {
        user: userId,
        series: id,
      },
      {
        $set: {
          seasonNumber,
          episodeNumber,
          currentTime: safeTime,
          duration: safeDuration,
          completed,
          lastWatchedAt: new Date(),
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
      }
    ).lean();

    return res.json({
      success: true,
      progress,
    });
  } catch (error) {
    console.error("[WatchProgress] PUT:", error);

    return res.status(500).json({
      error: "Erro ao salvar progresso",
    });
  }
}

module.exports = {
  getSeriesProgress,
  saveSeriesProgress,
};
