
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

const isAdminUser = (req) =>
  req.user?.role === "admin";

const parseNumber = (value, min = 0) => {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    typeof value === "boolean"
  ) {
    return null;
  }

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
      error:
        "O registro foi alterado. Atualize e tente novamente.",
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

// =========================================
// FIELDS
// =========================================

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

// Campos seguros para listagens.
const CATALOG_FIELDS = [
  "_id",
  "tmdbId",
  "title",
  "overview",
  "poster",
  "backdrop",
  "year",
  "genres",
  "views",
  "status",
  "published",
  "totalSeasons",
  "totalEpisodes",
  "createdAt",
];

// Campos removidos dos detalhes
// destinados aos assinantes.
const PRIVATE_EPISODE_FIELDS =
  "-seasons.episodes.videoUrl " +
  "-seasons.episodes.sources";

// =========================================
// SERIES HELPERS
// =========================================

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
    (total, season) =>
      total + season.episodes.length,
    0
  );
};

// Filtro de publicação.
// Administradores podem acessar rascunhos
// nos endpoints que utilizam este helper.
const getVisibilityFilter = (req) =>
  isAdminUser(req)
    ? {}
    : { published: true };

// =========================================
// GET ALL SERIES - ADMIN
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
// GET SERIES CATALOG
// =========================================

async function getSeriesCatalog(req, res) {
  try {
    const series = await Series.find({
      published: true,
    })
      .select(CATALOG_FIELDS.join(" "))
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
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        error: "Identificador inválido",
      });
    }

    const admin = isAdminUser(req);

    let query = Series.findOne({
      _id: id,
      ...getVisibilityFilter(req),
    });

    // if (!admin) {
    //   query = query.select(
    //     PRIVATE_EPISODE_FIELDS
    //   );
    // }

    const series = await query.lean();

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
// CREATE SERIES - ADMIN
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

    // Temporadas e episódios são gerenciados
    // pelos endpoints específicos.
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
// UPDATE SERIES - ADMIN
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
// DELETE SERIES - ADMIN
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
// ADD SEASON - ADMIN
// =========================================

async function addSeason(req, res) {
  try {
    const { id } = req.params;

    const seasonNumber = parseNumber(
      req.body?.seasonNumber
    );

    if (
      !isValidId(id) ||
      seasonNumber === null
    ) {
      return res.status(400).json({
        error:
          "Identificador ou temporada inválida",
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
// UPDATE SEASON - ADMIN
// =========================================

async function updateSeason(req, res) {
  try {
    const { id } = req.params;

    const seasonNumber = parseNumber(
      req.params.season
    );

    if (
      !isValidId(id) ||
      seasonNumber === null
    ) {
      return res.status(400).json({
        error:
          "Identificador ou temporada inválida",
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
// DELETE SEASON - ADMIN
// =========================================

async function deleteSeason(req, res) {
  try {
    const { id } = req.params;

    const seasonNumber = parseNumber(
      req.params.season
    );

    if (
      !isValidId(id) ||
      seasonNumber === null
    ) {
      return res.status(400).json({
        error:
          "Identificador ou temporada inválida",
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
// ADD EPISODE - ADMIN
// =========================================

async function addEpisode(req, res) {
  try {
    const { id } = req.params;

    const seasonNumber = parseNumber(
      req.body?.seasonNumber
    );

    const episodeData = req.body?.episode;

    if (
      !isValidId(id) ||
      seasonNumber === null
    ) {
      return res.status(400).json({
        error:
          "Identificador ou temporada inválida",
      });
    }

    if (
      !episodeData ||
      typeof episodeData !== "object" ||
      Array.isArray(episodeData)
    ) {
      return res.status(400).json({
        error:
          "Dados do episódio obrigatórios",
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
    // cria automaticamente a temporada.
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
// UPDATE EPISODE - ADMIN
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
// DELETE EPISODE - ADMIN
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

    // Mantém a numeração dos demais episódios.
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

    const projection = Object.fromEntries(
      CATALOG_FIELDS.map((field) => [
        field,
        1,
      ])
    );

    const featured = await Series.aggregate([
      {
        $match: {
          published: true,
        },
      },
      {
        $sample: {
          size: 12,
        },
      },
      {
        $project: projection,
      },
    ]);

    const rows = await Promise.all(
      genres.map(async (genre) => {
        const series = await Series.aggregate([
          {
            $match: {
              published: true,
              genres: genre,
            },
          },
          {
            $sample: {
              size: 20,
            },
          },
          {
            $project: projection,
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

    const series = await Series.findOneAndUpdate(
      {
        _id: id,
        ...getVisibilityFilter(req),
      },
      {
        $inc: {
          views: 1,
        },
      },
      {
        new: true,
        projection: {
          views: 1,
        },
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
        ...getVisibilityFilter(req),
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
        error:
          "Série ou episódio não encontrado",
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

    const series = await Series.findOne({
      _id: seriesId,
      ...getVisibilityFilter(req),
    })
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
      (id) =>
        String(id) === String(seriesId)
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
      (id) =>
        String(id) === String(seriesId)
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
      ...getVisibilityFilter(req),
    };

    const [series, total] = await Promise.all([
      Series.find(query)
        .select(CATALOG_FIELDS.join(" "))
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

async function getEpisodePlayback(req, res) {
  try {
    const { id, season, episode } = req.params;

    const seasonNumber = parseNumber(season);
    const episodeNumber = parseNumber(episode);

    if (
      !isValidId(id) ||
      seasonNumber === null ||
      episodeNumber === null
    ) {
      return res.status(400).json({
        error: "Parâmetros inválidos",
      });
    }

    const series = await Series.findOne({
      _id: id,
      ...getVisibilityFilter(req),
    })
      .select("seasons published")
      .lean();

    if (!series) {
      return res.status(404).json({
        error: "Série não encontrada",
      });
    }

    const selectedSeason = series.seasons.find(
      (item) => item.seasonNumber === seasonNumber
    );

    const selectedEpisode = selectedSeason?.episodes.find(
      (item) => item.episodeNumber === episodeNumber
    );

    if (!selectedEpisode) {
      return res.status(404).json({
        error: "Episódio não encontrado",
      });
    }

    const activeSource = [...(selectedEpisode.sources || [])]
      .filter((source) => source.active && source.url)
      .sort(
        (a, b) =>
          (a.priority ?? 0) - (b.priority ?? 0)
      )[0];

    const videoUrl =
      activeSource?.url || selectedEpisode.videoUrl;

    if (!videoUrl) {
      return res.status(404).json({
        error: "Nenhuma fonte de reprodução cadastrada",
      });
    }

    return res.json({
      videoUrl,
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
  getSeriesCatalog,
  getSeriesById,
  getEpisodePlayback,

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
