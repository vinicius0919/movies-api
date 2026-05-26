const Series =
  require("../models/Series");

/* =========================================
   GET ALL
========================================= */

async function getSeries(
  req,
  res
) {
  try {
    const series =
      await Series.find()
        .sort({
          createdAt: -1,
        });

    return res.json(series);
  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .json({
        error:
          "Erro ao carregar séries",
      });
  }
}

/* =========================================
   GET BY ID
========================================= */

async function getSeriesById(
  req,
  res
) {
  try {
    const series =
      await Series.findById(
        req.params.id
      );

    if (!series) {
      return res
        .status(404)
        .json({
          error:
            "Série não encontrada",
        });
    }

    return res.json(series);
  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .json({
        error:
          "Erro ao carregar série",
      });
  }
}

/* =========================================
   CREATE
========================================= */

async function createSeries(
  req,
  res
) {
  try {
    const series =
      await Series.create(
        req.body
      );

    return res.status(201).json(
      series
    );
  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .json({
        error:
          "Erro ao criar série",
      });
  }
}

/* =========================================
   UPDATE
========================================= */

async function updateSeries(
  req,
  res
) {
  try {
    const series =
      await Series.findByIdAndUpdate(
        req.params.id,
        req.body,
        {
          returnDocument: "after"
        }
      );

    return res.json(series);
  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .json({
        error:
          "Erro ao atualizar série",
      });
  }
}

/* =========================================
   DELETE
========================================= */

async function deleteSeries(
  req,
  res
) {
  try {
    await Series.findByIdAndDelete(
      req.params.id
    );

    return res.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    return res
      .status(500)
      .json({
        error:
          "Erro ao deletar série",
      });
  }
}

/* =========================================
   ADD EPISODE
========================================= */

async function addEpisode(
    req,
    res
  ) {
    try {
      const { id } =
        req.params;
  
      const {
        seasonNumber,
        episode,
      } = req.body;
  
      const series =
        await Series.findById(id);
  
      if (!series) {
        return res
          .status(404)
          .json({
            error:
              "Série não encontrada",
          });
      }
  
      /* =====================================
         FIND SEASON
      ===================================== */
  
      let season =
        series.seasons.find(
          (s) =>
            s.seasonNumber ===
            Number(seasonNumber)
        );
  
      /* =====================================
         CREATE SEASON
      ===================================== */
  
      if (!season) {
        season = {
          seasonNumber:
            Number(seasonNumber),
  
          title: `Temporada ${seasonNumber}`,
  
          episodes: [],
        };
  
        series.seasons.push(
          season
        );
  
        season =
          series.seasons[
            series.seasons.length -
              1
          ];
      }
  
      /* =====================================
         EPISODE NUMBER
      ===================================== */
  
      const nextEpisode =
        season.episodes.length + 1;
  
      season.episodes.push({
        ...episode,
        episodeNumber:
          nextEpisode,
      });
  
      /* =====================================
         TOTALS
      ===================================== */
  
      series.totalSeasons =
        series.seasons.length;
  
      series.totalEpisodes =
        series.seasons.reduce(
          (acc, s) =>
            acc +
            s.episodes.length,
          0
        );
  
      await series.save();
  
      return res.status(201).json(
        series
      );
    } catch (error) {
      console.error(error);
  
      return res
        .status(500)
        .json({
          error:
            "Erro ao adicionar episódio",
        });
    }
  }
  
  /* =========================================
     UPDATE EPISODE
  ========================================= */
  
  async function updateEpisode(
    req,
    res
  ) {
    try {
      const {
        id,
        season,
        episode,
      } = req.params;
  
      const series =
        await Series.findById(id);
  
      if (!series) {
        return res
          .status(404)
          .json({
            error:
              "Série não encontrada",
          });
      }
  
      /* =====================================
         FIND SEASON
      ===================================== */
  
      const seasonData =
        series.seasons.find(
          (s) =>
            s.seasonNumber ===
            Number(season)
        );
  
      if (!seasonData) {
        return res
          .status(404)
          .json({
            error:
              "Temporada não encontrada",
          });
      }
  
      /* =====================================
         FIND EPISODE
      ===================================== */
  
      const episodeData =
        seasonData.episodes.find(
          (ep) =>
            ep.episodeNumber ===
            Number(episode)
        );
  
      if (!episodeData) {
        return res
          .status(404)
          .json({
            error:
              "Episódio não encontrado",
          });
      }
  
      /* =====================================
         UPDATE
      ===================================== */
  
      Object.assign(
        episodeData,
        req.body
      );
  
      await series.save();
  
      return res.json(series);
    } catch (error) {
      console.error(error);
  
      return res
        .status(500)
        .json({
          error:
            "Erro ao atualizar episódio",
        });
    }
  }
  
  /* =========================================
     DELETE EPISODE
  ========================================= */
  
  async function deleteEpisode(
    req,
    res
  ) {
    try {
      const {
        id,
        season,
        episode,
      } = req.params;
  
      const series =
        await Series.findById(id);
  
      if (!series) {
        return res
          .status(404)
          .json({
            error:
              "Série não encontrada",
          });
      }
  
      /* =====================================
         FIND SEASON
      ===================================== */
  
      const seasonData =
        series.seasons.find(
          (s) =>
            s.seasonNumber ===
            Number(season)
        );
  
      if (!seasonData) {
        return res
          .status(404)
          .json({
            error:
              "Temporada não encontrada",
          });
      }
  
      /* =====================================
         REMOVE EPISODE
      ===================================== */
  
      seasonData.episodes =
        seasonData.episodes.filter(
          (ep) =>
            ep.episodeNumber !==
            Number(episode)
        );
  
      /* =====================================
         REORDER EPISODES
      ===================================== */
  
      seasonData.episodes.forEach(
        (ep, index) => {
          ep.episodeNumber =
            index + 1;
        }
      );
  
      /* =====================================
         TOTALS
      ===================================== */
  
      series.totalEpisodes =
        series.seasons.reduce(
          (acc, s) =>
            acc +
            s.episodes.length,
          0
        );
  
      await series.save();
  
      return res.json({
        success: true,
      });
    } catch (error) {
      console.error(error);
  
      return res
        .status(500)
        .json({
          error:
            "Erro ao remover episódio",
        });
    }
  }
  
  /* =========================================
     HOME SERIES
  ========================================= */
  
  async function getHomeSeries(
    req,
    res
  ) {
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
  
      /* =====================================
         FEATURED
      ===================================== */
  
      const featured =
        await Series.aggregate([
          {
            $sample: {
              size: 12,
            },
          },
        ]);
  
      /* =====================================
         ROWS
      ===================================== */
  
      const rows =
        await Promise.all(
          genres.map(
            async (genre) => {
              const series =
                await Series.aggregate([
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
            }
          )
        );
  
      const validRows =
        rows.filter(
          (row) =>
            row.series.length > 0
        );
  
      return res.json({
        featured,
        rows: validRows,
      });
    } catch (error) {
      console.error(error);
  
      return res
        .status(500)
        .json({
          error:
            "Erro ao carregar home das séries",
        });
    }
  }
  
  /* =========================================
     ADD SERIES VIEW
  ========================================= */
  
  async function addSeriesView(
    req,
    res
  ) {
    try {
      const { id } =
        req.params;
  
      const series =
        await Series.findByIdAndUpdate(
          id,
          {
            $inc: {
              views: 1,
            },
          },
          {
            returnDocument: "after"
          }
        );
  
      if (!series) {
        return res
          .status(404)
          .json({
            error:
              "Série não encontrada",
          });
      }
  
      return res.json({
        success: true,
        views: series.views,
      });
    } catch (error) {
      console.error(error);
  
      return res
        .status(500)
        .json({
          error:
            "Erro ao adicionar view",
        });
    }
  }
  
  /* =========================================
     ADD EPISODE VIEW
  ========================================= */
  
  async function addEpisodeView(
    req,
    res
  ) {
    try {
      const {
        id,
        season,
        episode,
      } = req.params;
  
      const series =
        await Series.findById(id);
  
      if (!series) {
        return res
          .status(404)
          .json({
            error:
              "Série não encontrada",
          });
      }
  
      /* =====================================
         FIND SEASON
      ===================================== */
  
      const seasonData =
        series.seasons.find(
          (s) =>
            s.seasonNumber ===
            Number(season)
        );
  
      if (!seasonData) {
        return res
          .status(404)
          .json({
            error:
              "Temporada não encontrada",
          });
      }
  
      /* =====================================
         FIND EPISODE
      ===================================== */
  
      const episodeData =
        seasonData.episodes.find(
          (ep) =>
            ep.episodeNumber ===
            Number(episode)
        );
  
      if (!episodeData) {
        return res
          .status(404)
          .json({
            error:
              "Episódio não encontrado",
          });
      }
  
      /* =====================================
         INCREMENT
      ===================================== */
  
      episodeData.views += 1;
  
      series.views += 1;
  
      await series.save();
  
      return res.json({
        success: true,
        episodeViews:
          episodeData.views,
        totalSeriesViews:
          series.views,
      });
    } catch (error) {
      console.error(error);
  
      return res
        .status(500)
        .json({
          error:
            "Erro ao adicionar view do episódio",
        });
    }
  }

module.exports = {
    getSeries,
    getSeriesById,
    createSeries,
    updateSeries,
    deleteSeries,
    addEpisode,
    updateEpisode,
    deleteEpisode,
    getHomeSeries,
    addSeriesView,
    addEpisodeView,
};