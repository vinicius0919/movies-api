// controllers/movieController.js

const Movie = require("../models/Movie");

const GENRE_ROWS = require("../config/genres.js");

const movieService = require("../services/movieService");
const tmdbService = require("../services/tmdbService");

function handleError(res, err) {
  const status = err.status || 500;
  const message = err.message || "Erro interno";
  res.status(status).json({ error: message });
}

const list = async (req, res) => {
  try {
    const result = await movieService.list(req.query);
    res.json(result);
  } catch (err) { handleError(res, err); }
};

const getById = async (req, res) => {
  try {
    const movie = await movieService.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Filme não encontrado" });
    res.json(movie);
  } catch (err) { handleError(res, err); }
};

const getHome = async (req, res) => {
  try {
    /* =========================================
       FEATURED
    ========================================= */

    const featured =
      await Movie.aggregate([
        {
          $sample: {
            size: 20,
          },
        },
      ]);

    /* =========================================
       ROWS
    ========================================= */

    const rows =
      await Promise.all(
        GENRE_ROWS.map(
          async (genre) => {
            const movies =
              await Movie.aggregate([
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
              movies,
            };
          }
        )
      );

    /* =========================================
       REMOVE EMPTY ROWS
    ========================================= */

    const validRows =
      rows.filter(
        (row) =>
          row.movies.length > 0
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
          "Erro ao carregar home",
      });
  }
}

const create = async (req, res) => {
  try {
    const movie = await movieService.create(req.body);
    res.status(201).json(movie);
  } catch (err) { handleError(res, err); }
};

const update = async (req, res) => {
  try {
    const movie = await movieService.update(req.params.id, req.body);
    if (!movie) return res.status(404).json({ error: "Filme não encontrado" });
    res.json(movie);
  } catch (err) { handleError(res, err); }
};

const addView = async (req, res) => {
  try {
    const { id } = req.params;

    const movie =
      await Movie.findByIdAndUpdate(
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

    if (!movie) {
      return res
        .status(404)
        .json({
          error:
            "Filme não encontrado",
        });
    }

    return res.json({
      success: true,
      views: movie.views,
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

const remove = async (req, res) => {
  try {
    const ok = await movieService.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: "Filme não encontrado" });
    res.json({ success: true, message: "Filme removido" });
  } catch (err) { handleError(res, err); }
};

const toggleFavorite = async (req, res) => {
  try {
    const movie = await movieService.toggleFavorite(req.params.id);
    if (!movie) return res.status(404).json({ error: "Filme não encontrado" });
    res.json(movie);
  } catch (err) { handleError(res, err); }
};

const listFavorites = async (req, res) => {
  try {
    const result = await movieService._listQuery(
      { favorite: true },
      Number(req.query.page) || 1,
      Number(req.query.limit) || 20
    );
    res.json(result);
  } catch (err) { handleError(res, err); }
};

const refreshTmdb = async (req, res) => {
  try {
    const movie = await tmdbService.refresh(req.params.id);
    if (!movie) return res.status(404).json({ error: "Filme não encontrado" });
    res.json(movie);
  } catch (err) { handleError(res, err); }
};

module.exports = { list, getHome, addView, getById, create, update, remove, toggleFavorite, listFavorites, refreshTmdb };