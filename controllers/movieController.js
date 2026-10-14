// controllers/movieController.js

const Movie = require("../models/Movie");

const GENRE_ROWS = require("../config/genres.js");

const movieService = require("../services/movieService");
const tmdbService = require("../services/tmdbService");
const User = require("../models/User");
const mongoose = require("mongoose");

function handleError(res, err) {
  const status = err.status || 500;
  const message = err.message || "Erro interno";
  res.status(status).json({ error: message });
}

const list = async (req, res) => {
  try {
    const result = await movieService.list(req.query);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
};

const getById = async (req, res) => {
  try {
    const movie = await movieService.findById(req.params.id);
    if (!movie) return res.status(404).json({ error: "Filme não encontrado" });
    res.json(movie);
  } catch (err) {
    handleError(res, err);
  }
};

const getHome = async (req, res) => {
  try {
    const { search, genre } = req.query;

    /* =========================================
       FEATURED MATCH
    ========================================= */

    const featuredMatch = {};

    if (search) {
      featuredMatch.title = {
        $regex: search,
        $options: "i",
      };
    }

    if (genre) {
      featuredMatch.genres = genre;
    }

    /* =========================================
       FEATURED
    ========================================= */

    const featured = await Movie.aggregate([
      {
        $match: featuredMatch,
      },

      {
        $sample: {
          size: 20,
        },
      },
    ]);

    /* =========================================
       ROWS
    ========================================= */

    const rows = await Promise.all(
      GENRE_ROWS.map(async (genreRow) => {
        /* ================================
               MATCH
            ================================= */

        const match = {
          genres: genreRow,
        };

        /* ================================
               SEARCH FILTER
            ================================= */

        if (search) {
          match.title = {
            $regex: search,
            $options: "i",
          };
        }

        /* ================================
               GLOBAL GENRE FILTER
            ================================= */

        if (genre && genre !== genreRow) {
          return {
            id: genreRow,
            title: genreRow,
            movies: [],
          };
        }

        /* ================================
               QUERY
            ================================= */

        const movies = await Movie.aggregate([
          {
            $match: match,
          },

          {
            $sample: {
              size: 20,
            },
          },
        ]);

        return {
          id: genreRow,
          title: genreRow,
          movies,
        };
      }),
    );

    /* =========================================
       REMOVE EMPTY ROWS
    ========================================= */

    const validRows = rows.filter((row) => row.movies.length > 0);

    return res.json({
      featured,
      rows: validRows,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Erro ao carregar home",
    });
  }
};

const create = async (req, res) => {
  try {
    const movie = await movieService.create(req.body);
    res.status(201).json(movie);
  } catch (err) {
    handleError(res, err);
  }
};

const update = async (req, res) => {
  try {
    const movie = await movieService.update(req.params.id, req.body);
    if (!movie) return res.status(404).json({ error: "Filme não encontrado" });
    res.json(movie);
  } catch (err) {
    handleError(res, err);
  }
};

const addView = async (req, res) => {
  try {
    const { id } = req.params;

    const movie = await Movie.findByIdAndUpdate(
      id,
      {
        $inc: {
          views: 1,
        },
      },
      {
        returnDocument: "after",
      },
    );

    if (!movie) {
      return res.status(404).json({
        error: "Filme não encontrado",
      });
    }

    return res.json({
      success: true,
      views: movie.views,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Erro ao adicionar view",
    });
  }
};

const remove = async (req, res) => {
  try {
    const ok = await movieService.remove(req.params.id);
    if (!ok) return res.status(404).json({ error: "Filme não encontrado" });
    res.json({ success: true, message: "Filme removido" });
  } catch (err) {
    handleError(res, err);
  }
};

const toggleFavorite = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id || req.user?.userId;

    const movieId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        error: "Usuário não autenticado",
      });
    }

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(401).json({
        error: "Sessão inválida",
      });
    }

    if (!mongoose.isValidObjectId(movieId)) {
      return res.status(400).json({
        error: "Identificador do filme inválido",
      });
    }

    // =========================================
    // VERIFY MOVIE
    // =========================================

    const movie = await Movie.findById(movieId).select("_id").lean();

    if (!movie) {
      return res.status(404).json({
        error: "Filme não encontrado",
      });
    }

    // =========================================
    // GET USER FAVORITES
    // =========================================

    const user = await User.findById(userId).select("favorites.movies").lean();

    if (!user) {
      return res.status(404).json({
        error: "Usuário não encontrado",
      });
    }

    const favoriteMovies = user.favorites?.movies || [];

    const isFavorite = favoriteMovies.some(
      (id) => String(id) === String(movieId),
    );

    // =========================================
    // ADD OR REMOVE FAVORITE
    // =========================================

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      isFavorite
        ? {
            $pull: {
              "favorites.movies": movie._id,
            },
          }
        : {
            $addToSet: {
              "favorites.movies": movie._id,
            },
          },
      {
        new: true,
        runValidators: true,
      },
    )
      .select("favorites.movies")
      .lean();

    if (!updatedUser) {
      return res.status(404).json({
        error: "Usuário não encontrado",
      });
    }

    // =========================================
    // UPDATED FAVORITE STATE
    // =========================================

    const favorite = (updatedUser.favorites?.movies || []).some(
      (id) => String(id) === String(movieId),
    );

    return res.json({
      success: true,
      movieId,
      favorite,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const listFavorites = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id || req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        error: "Usuário não autenticado",
      });
    }

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(401).json({
        error: "Sessão inválida",
      });
    }

    // =========================================
    // PAGINATION
    // =========================================

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20),
    );

    // =========================================
    // GET USER
    // =========================================

    const user = await User.findById(userId).select("favorites.movies").lean();

    if (!user) {
      return res.status(404).json({
        error: "Usuário não encontrado",
      });
    }

    // =========================================
    // FAVORITE MOVIE IDS
    // =========================================

    const favoriteIds = user.favorites?.movies || [];

    // =========================================
    // QUERY
    // =========================================

    const query = {
      _id: {
        $in: favoriteIds,
      },
    };

    // =========================================
    // FETCH MOVIES
    // =========================================

    const [movies, total] = await Promise.all([
      Movie.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Movie.countDocuments(query),
    ]);

    // =========================================
    // RESPONSE
    // =========================================

    return res.json({
      movies,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    return handleError(res, error);
  }
};

const refreshTmdb = async (req, res) => {
  try {
    const movie = await tmdbService.refresh(req.params.id);
    if (!movie) return res.status(404).json({ error: "Filme não encontrado" });
    res.json(movie);
  } catch (err) {
    handleError(res, err);
  }
};

module.exports = {
  list,
  getHome,
  addView,
  getById,
  create,
  update,
  remove,
  toggleFavorite,
  listFavorites,
  refreshTmdb,
};
