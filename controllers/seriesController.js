
const mongoose = require("mongoose");

const Series = require("../models/Series");
const User = require("../models/User");

// =========================================
// HELPERS
// =========================================

const isValidId = (id) =>
  mongoose.isValidObjectId(id);

const getUserId = (req) =>
  req.user?._id ||
  req.user?.id ||
  req.user?.userId;

const parseNumber = (value, min = 0) => {
  const number = Number(value);

  return Number.isInteger(number) && number >= min
    ? number
    : null;
};

const sendError = (res, error) => {
  console.error(error);

  if (error.name === "ValidationError") {
    return res.status(400).json({
      error: error.message,
    });
  }

  if (error.name === "CastError") {
    return res.status(400).json({
      error: "Identificador inválido",
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      error: "Registro duplicado",
    });
  }

  if (error.name === "VersionError") {
    return res.status(409).json({
      error: "O registro foi alterado. Atualize e tente novamente.",
    });
  }

  return res.status(500).json({
    error: "Erro interno do servidor",
  });
};

const pickFields = (data, fields) => {
  const result = {};

  for (const field of fields) {
    if (data?.[field] !== undefined) {
      result[field] = data[field];
    }
  }

  return result;
};

const SERIES_FIELDS = [
  "tmdbId",
  "title",
  "overview",
  "poster",
  "backdrop",
  "year",
  "genres",
  "status",
  "published",
];

const SEASON_FIELDS = ["title"];

const EPISODE_FIELDS = [
  "title",
  "overview",
  "duration",
  "still",
  "videoUrl",
  "sources",
];

const findSeason = (series, number) =>
  series.seasons.find(
    (season) => season.seasonNumber === number
  );

const findEpisode = (season, number) =>
  season.episodes.find(
    (episode) => episode.episodeNumber === number
  );

const getNextEpisodeNumber = (season) =>
  Math.max(
    0,
    ...season.episodes.map(
      (episode) => episode.episodeNumber
    )
  ) + 1;

const recalculateTotals = (series) => {
  series.totalSeasons = series.seasons.length;

  series.totalEpisodes = series.seasons.reduce(
    (total, season) => total + season.episodes.length,
    0
  );
};

// =========================================
// GET ALL SERIES
// =========================================

async function getSeries(req, res) {
  try {
    const series = await Series.find()
      .sort({ createdAt: -1 })
      .lean();

    return res.json(series);
  } catch (error) {
    return sendError(res, error);
  }
}

// =========================================
// GET SERIES BY ID
// =========================================

async function getSeriesById(req, res) {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({
        error: "Identificador inválido",
      });
    }

    const series = await Series.findById(
      req.params.id
    ).lean();

    if (!series) {
      return res.status(404).json({
        error: "Série não encontrada",
      });
    }

    return res.json(series);
  } catch (error) {
    return sendError(res, error);
  }
}

// =========================================
// CREATE SERIES
// =========================================

async function createSeries(req, res) {
  try {
    const data = pickFields(
      req.body,
      SERIES_FIELDS
    );

    if (
      typeof data.title !== "string" ||
      !data.title.trim()
    ) {
      return res.status(400).json({
        error: "Título obrigatório",
      });
    }

    // Série criada sem temporadas.
    // Temporadas e episódios possuem
    // operações específicas de cadastro.
    const series = await Series.create({
      ...data,
      seasons: [],
      totalSeasons: 0,
      totalEpisodes: 0,
      views: 0,
    });

    return res.status(201).json(series);
  } catch (error) {
    return sendError(res, error);
  }
}

// =========================================
// UPDATE SERIES
// =========================================

async function updateSeries(req, res) {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        error: "Identificador inválido",
      });
    }

    const data = pickFields(
      req.body,
      SERIES_FIELDS
    );

    const series = await Series.findByIdAndUpdate(
      id,
      { $set: data },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!series) {
      return res.status(404).json({
        error: "Série não encontrada",
      });
    }

    return res.json(series);
  } catch (error) {
    return sendError(res, error);
  }
}

// =========================================
// DELETE SERIES
// =========================================

async function deleteSeries(req, res) {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        error: "Identificador inválido",
      });
    }

    const series = await Series.findByIdAndDelete(id);

    if (!series) {
      return res.status(404).json({
        error: "Série não encontrada",
      });
    }

    // Limpa referências nos favoritos.
    await User.updateMany(
      {},
      {
        $pull: {
          "favorites.series": series._id,
        },
      }
    );

    return res.json({
      success: true,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

// =========================================
// ADD SEASON
// =========================================

async function addSeason(req, res) {
  try {
    const { id } = req.params;

    const seasonNumber = parseNumber(
      req.body?.seasonNumber
    );

    if (!isValidId(id) || seasonNumber === null) {
      return res.status(400).json({
        error: "Identificador ou temporada inválida",
      });
    }

    const series = await Series.findById(id);

    if (!series) {
      return res.status(404).json({
        error: "Série não encontrada",
      });
    }

    if (findSeason(series, seasonNumber)) {
      return res.status(409).json({
        error: "Temporada já cadastrada",
      });
    }

    series.seasons.push({
      seasonNumber,
      title:
        req.body?.title ||
        (seasonNumber === 0
          ? "Especiais"
          : `Temporada ${seasonNumber}`),
      episodes: [],
    });

    series.seasons.sort(
      (a, b) => a.seasonNumber - b.seasonNumber
    );

    recalculateTotals(series);
    await series.save();

    return res.status(201).json(series);
  } catch (error) {
    return sendError(res, error);
  }
}

// =========================================
// UPDATE SEASON
// =========================================

async function updateSeason(req, res) {
  try {
    const { id } = req.params;

    const seasonNumber = parseNumber(
      req.params.season
    );

    if (!isValidId(id) || seasonNumber === null) {
      return res.status(400).json({
        error: "Identificador ou temporada inválida",
      });
    }

    const series = await Series.findById(id);

    if (!series) {
      return res.status(404).json({
        error: "Série não encontrada",
      });
    }

    const season = findSeason(
      series,
      seasonNumber
    );

    if (!season) {
      return res.status(404).json({
        error: "Temporada não encontrada",
      });
    }

    Object.assign(
      season,
      pickFields(req.body, SEASON_FIELDS)
    );

    await series.save();

    return res.json(series);
  } catch (error) {
    return sendError(res, error);
  }
}

// =========================================
// DELETE SEASON
// =========================================

async function deleteSeason(req, res) {
  try {
    const { id } = req.params;

    const seasonNumber = parseNumber(
      req.params.season
    );

    if (!isValidId(id) || seasonNumber === null) {
      return res.status(400).json({
        error: "Identificador ou temporada inválida",
      });
    }

    const series = await Series.findById(id);

    if (!series) {
      return res.status(404).json({
        error: "Série não encontrada",
      });
    }

    const season = findSeason(
      series,
      seasonNumber
    );

    if (!season) {
      return res.status(404).json({
        error: "Temporada não encontrada",
      });
    }

    // Evita excluir acidentalmente
    // uma temporada com episódios.
    if (
      season.episodes.length > 0 &&
      req.query.force !== "true"
    ) {
      return res.status(409).json({
        error:
          "A temporada possui episódios. Use force=true para confirmar a exclusão.",
      });
    }

    series.seasons = series.seasons.filter(
      (item) =>
        item.seasonNumber !== seasonNumber
    );

    recalculateTotals(series);
    await series.save();

    return res.json({
      success: true,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

// =========================================
// ADD EPISODE
// =========================================

async function addEpisode(req, res) {
  try {
    const { id } = req.params;

    const seasonNumber = parseNumber(
      req.body?.seasonNumber
    );

    const episodeData = req.body?.episode;

    if (!isValidId(id) || seasonNumber === null) {
      return res.status(400).json({
        error: "Identificador ou temporada inválida",
      });
    }

    if (
      !episodeData ||
      typeof episodeData !== "object" ||
      Array.isArray(episodeData)
    ) {
      return res.status(400).json({
        error: "Dados do episódio obrigatórios",
      });
    }

    const series = await Series.findById(id);

    if (!series) {
      return res.status(404).json({
        error: "Série não encontrada",
      });
    }

    let season = findSeason(
      series,
      seasonNumber
    );

    // Compatibilidade com o cadastro anterior:
    // cria a temporada automaticamente.
    if (!season) {
      series.seasons.push({
        seasonNumber,
        title:
          seasonNumber === 0
            ? "Especiais"
            : `Temporada ${seasonNumber}`,
        episodes: [],
      });

      season = findSeason(
        series,
        seasonNumber
      );
    }

    const manualNumber =
      episodeData.episodeNumber;

    const episodeNumber =
      manualNumber === undefined ||
      manualNumber === null ||
      manualNumber === ""
        ? getNextEpisodeNumber(season)
        : parseNumber(manualNumber);

    if (episodeNumber === null) {
      return res.status(400).json({
        error: "Número do episódio inválido",
      });
    }

    if (findEpisode(season, episodeNumber)) {
      return res.status(409).json({
        error: "Episódio já cadastrado",
      });
    }

    season.episodes.push({
      ...pickFields(
        episodeData,
        EPISODE_FIELDS
      ),
      episodeNumber,
      views: 0,
    });

    season.episodes.sort(
      (a, b) =>
        a.episodeNumber - b.episodeNumber
    );

    series.seasons.sort(
      (a, b) =>
        a.seasonNumber - b.seasonNumber
    );

    recalculateTotals(series);

    await series.save();

    return res.status(201).json(series);
  } catch (error) {
    return sendError(res, error);
  }
}

// =========================================
// UPDATE EPISODE
// =========================================

async function updateEpisode(req, res) {
  try {
    const { id } = req.params;

    const seasonNumber = parseNumber(
      req.params.season
    );

    const episodeNumber = parseNumber(
      req.params.episode
    );

    if (
      !isValidId(id) ||
      seasonNumber === null ||
      episodeNumber === null
    ) {
      return res.status(400).json({
        error: "Parâmetros inválidos",
      });
    }

    const series = await Series.findById(id);

    if (!series) {
      return res.status(404).json({
        error: "Série não encontrada",
      });
    }

    const season = findSeason(
      series,
      seasonNumber
    );

    if (!season) {
      return res.status(404).json({
        error: "Temporada não encontrada",
      });
    }

    const episode = findEpisode(
      season,
      episodeNumber
    );

    if (!episode) {
      return res.status(404).json({
        error: "Episódio não encontrado",
      });
    }

    Object.assign(
      episode,
      pickFields(req.body, EPISODE_FIELDS)
    );

    await series.save();

    return res.json(series);
  } catch (error) {
    return sendError(res, error);
  }
}

// =========================================
// DELETE EPISODE
// =========================================

async function deleteEpisode(req, res) {
  try {
    const { id } = req.params;

    const seasonNumber = parseNumber(
      req.params.season
    );

    const episodeNumber = parseNumber(
      req.params.episode
    );

    if (
      !isValidId(id) ||
      seasonNumber === null ||
      episodeNumber === null
    ) {
      return res.status(400).json({
        error: "Parâmetros inválidos",
      });
    }

    const series = await Series.findById(id);

    if (!series) {
      return res.status(404).json({
        error: "Série não encontrada",
      });
    }

    const season = findSeason(
      series,
      seasonNumber
    );

    if (!season) {
      return res.status(404).json({
        error: "Temporada não encontrada",
      });
    }

    const episode = findEpisode(
      season,
      episodeNumber
    );

    if (!episode) {
      return res.status(404).json({
        error: "Episódio não encontrado",
      });
    }

    season.episodes = season.episodes.filter(
      (item) =>
        item.episodeNumber !== episodeNumber
    );

    // Não renumera os episódios restantes.
    recalculateTotals(series);

    await series.save();

    return res.json({
      success: true,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

// =========================================
// HOME SERIES
// =========================================

async function getHomeSeries(req, res) {
  try {
    const genres = [
      "Ação",
      "Drama",
      "Comédia",
      "Animação",
      "Terror",
      "Ficção científica",
      "Suspense",
      "Fantasia",
    ];

    const featured = await Series.aggregate([
      { $sample: { size: 12 } },
    ]);

    const rows = await Promise.all(
      genres.map(async (genre) => {
        const series = await Series.aggregate([
          {
            $match: {
              genres: genre,
            },
          },
          {
            $sample: {
              size: 20,
            },
          },
        ]);

        return {
          id: genre,
          title: genre,
          series,
        };
      })
    );

    return res.json({
      featured,
      rows: rows.filter(
        (row) => row.series.length > 0
      ),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

// =========================================
// ADD SERIES VIEW
// =========================================

async function addSeriesView(req, res) {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        error: "Identificador inválido",
      });
    }

    const series = await Series.findByIdAndUpdate(
      id,
      {
        $inc: {
          views: 1,
        },
      },
      {
        new: true,
      }
    );

    if (!series) {
      return res.status(404).json({
        error: "Série não encontrada",
      });
    }

    return res.json({
      success: true,
      views: series.views,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

// =========================================
// ADD EPISODE VIEW
// =========================================

async function addEpisodeView(req, res) {
  try {
    const { id } = req.params;

    const seasonNumber = parseNumber(
      req.params.season
    );

    const episodeNumber = parseNumber(
      req.params.episode
    );

    if (
      !isValidId(id) ||
      seasonNumber === null ||
      episodeNumber === null
    ) {
      return res.status(400).json({
        error: "Parâmetros inválidos",
      });
    }

    const series = await Series.findOneAndUpdate(
      {
        _id: id,
        seasons: {
          $elemMatch: {
            seasonNumber,
            episodes: {
              $elemMatch: {
                episodeNumber,
              },
            },
          },
        },
      },
      {
        $inc: {
          views: 1,
          "seasons.$[s].episodes.$[e].views": 1,
        },
      },
      {
        new: true,
        arrayFilters: [
          {
            "s.seasonNumber": seasonNumber,
          },
          {
            "e.episodeNumber": episodeNumber,
          },
        ],
      }
    );

    if (!series) {
      return res.status(404).json({
        error: "Série ou episódio não encontrado",
      });
    }

    const season = findSeason(
      series,
      seasonNumber
    );

    const episode = findEpisode(
      season,
      episodeNumber
    );

    return res.json({
      success: true,
      episodeViews: episode.views,
      totalSeriesViews: series.views,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

// =========================================
// TOGGLE FAVORITE
// =========================================

async function toggleFavorite(req, res) {
  try {
    const userId = getUserId(req);
    const seriesId = req.params.id;

    if (!userId || !isValidId(userId)) {
      return res.status(401).json({
        error: "Sessão inválida",
      });
    }

    if (!isValidId(seriesId)) {
      return res.status(400).json({
        error: "Identificador inválido",
      });
    }

    const series = await Series.findById(
      seriesId
    )
      .select("_id")
      .lean();

    if (!series) {
      return res.status(404).json({
        error: "Série não encontrada",
      });
    }

    const user = await User.findById(userId)
      .select("favorites.series")
      .lean();

    if (!user) {
      return res.status(404).json({
        error: "Usuário não encontrado",
      });
    }

    const isFavorite = (
      user.favorites?.series || []
    ).some(
      (id) => String(id) === String(seriesId)
    );

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      isFavorite
        ? {
            $pull: {
              "favorites.series": series._id,
            },
          }
        : {
            $addToSet: {
              "favorites.series": series._id,
            },
          },
      {
        new: true,
        runValidators: true,
      }
    )
      .select("favorites.series")
      .lean();

    if (!updatedUser) {
      return res.status(404).json({
        error: "Usuário não encontrado",
      });
    }

    const favorite = (
      updatedUser.favorites?.series || []
    ).some(
      (id) => String(id) === String(seriesId)
    );

    return res.json({
      success: true,
      seriesId,
      favorite,
    });
  } catch (error) {
    return sendError(res, error);
  }
}

// =========================================
// LIST FAVORITES
// =========================================

async function listFavorites(req, res) {
  try {
    const userId = getUserId(req);

    if (!userId || !isValidId(userId)) {
      return res.status(401).json({
        error: "Sessão inválida",
      });
    }

    const page = Math.max(
      1,
      parseInt(req.query.page, 10) || 1
    );

    const limit = Math.min(
      100,
      Math.max(
        1,
        parseInt(req.query.limit, 10) || 20
      )
    );

    const user = await User.findById(userId)
      .select("favorites.series")
      .lean();

    if (!user) {
      return res.status(404).json({
        error: "Usuário não encontrado",
      });
    }

    const favoriteIds =
      user.favorites?.series || [];

    const query = {
      _id: {
        $in: favoriteIds,
      },
    };

    const [series, total] = await Promise.all([
      Series.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Series.countDocuments(query),
    ]);

    return res.json({
      series,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    return sendError(res, error);
  }
}

// =========================================
// EXPORTS
// =========================================

module.exports = {
  getSeries,
  getSeriesById,
  createSeries,
  updateSeries,
  deleteSeries,
  addSeason,
  updateSeason,
  deleteSeason,
  addEpisode,
  updateEpisode,
  deleteEpisode,
  getHomeSeries,
  addSeriesView,
  addEpisodeView,
  toggleFavorite,
  listFavorites,
};
