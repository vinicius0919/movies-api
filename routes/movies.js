// routes/movies.js

const express = require("express");
const axios = require("axios");

const Movie = require("../models/Movie");

const {
  validateVideoUrl,
} = require(
  "../services/videoValidationService"
);

const router = express.Router();

/* =========================================
   GENRE NORMALIZER
========================================= */

const GENRE_PRIORITY = [
  "Animação",
  "Comédia",
  "Romance",
  "Fantasia",
];

function normalizeGenres(genres = []) {
  return genres.map((genre) => {
    const map = {
      Animation: "Animação",
      Comedy: "Comédia",
      Romance: "Romance",
      Fantasy: "Fantasia",

      Action: "Ação",
      Adventure: "Aventura",
      Drama: "Drama",
      Horror: "Terror",

      "Science Fiction":
        "Ficção científica",

      Family: "Família",
      Mystery: "Mistério",
      Crime: "Crime",
      Western: "Faroeste",
    };

    return (
      map[genre] ||
      genre
    );
  });
}

function getMainGenre(
  genres = []
) {
  const normalized =
    normalizeGenres(genres);

  for (const genre of GENRE_PRIORITY) {
    if (normalized.includes(genre)) {
      return genre;
    }
  }

  return normalized[0] || "";
}

/* =========================================
   GET ALL
========================================= */

// routes/movies.js

router.get("/", async (req, res) => {
  try {
    const page =
      Number(req.query.page) || 1;

    const limit =
      Number(req.query.limit) || 20;

    const search =
      req.query.search || "";

    const genre =
      req.query.genre || "";

    const skip =
      (page - 1) * limit;

    const query = {};

    /* =========================================
       SEARCH
    ========================================= */

    if (search) {
      query.title = {
        $regex: search,
        $options: "i",
      };
    }

    /* =========================================
       GENRE FILTER
    ========================================= */

    if (genre) {
      query.genres = {
        $in: [genre],
      };
    }

    const [movies, total] =
      await Promise.all([
        Movie.find(query)
          .sort({
            createdAt: -1,
          })
          .skip(skip)
          .limit(limit),

        Movie.countDocuments(
          query
        ),
      ]);

    const totalPages =
      Math.ceil(total / limit);

    res.json({
      data: movies,

      pagination: {
        total,
        page,
        limit,
        totalPages,

        hasNextPage:
          page < totalPages,

        hasPrevPage:
          page > 1,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        "Erro ao buscar filmes",
    });
  }
});

/* =========================================
   GET BY ID
========================================= */

router.get("/:id", async (req, res) => {
  try {
    const movie =
      await Movie.findById(
        req.params.id
      );

    if (!movie) {
      return res
        .status(404)
        .json({
          error:
            "Filme não encontrado",
        });
    }

    const movieObject =
      movie.toObject();

    movieObject.genres =
      normalizeGenres(
        movieObject.genres
      );

    movieObject.mainGenre =
      getMainGenre(
        movieObject.genres
      );

    res.json(movieObject);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        "Erro ao buscar filme",
    });
  }
});

/* =========================================
   CREATE
========================================= */

router.post("/", async (req, res) => {
  try {
    const movie = req.body;

    if (!movie.title) {
      return res
        .status(400)
        .json({
          error:
            "Título obrigatório",
        });
    }

    if (!movie.videoUrl) {
      return res
        .status(400)
        .json({
          error:
            "URL do vídeo obrigatória",
        });
    }

    const validUrl =
      validateVideoUrl(
        movie.videoUrl
      );

    if (!validUrl) {
      return res
        .status(400)
        .json({
          error:
            "URL inválida",
        });
    }

    const exists =
      await Movie.findOne({
        tmdbId: movie.tmdbId,
      });

    if (exists) {
      return res
        .status(400)
        .json({
          error:
            "Filme já cadastrado",
        });
    }

    movie.genres =
      normalizeGenres(
        movie.genres || []
      );

    movie.mainGenre =
      getMainGenre(
        movie.genres
      );

    const newMovie =
      await Movie.create(movie);

    res.status(201).json(
      newMovie
    );
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        "Erro ao criar filme",
    });
  }
});

/* =========================================
   UPDATE
========================================= */

router.put("/:id", async (req, res) => {
  try {
    const movie =
      await Movie.findById(
        req.params.id
      );

    if (!movie) {
      return res
        .status(404)
        .json({
          error:
            "Filme não encontrado",
        });
    }

    const {
      title,
      overview,
      poster,
      backdrop,
      year,
      videoUrl,
      genres,
    } = req.body;

    if (videoUrl) {
      const validUrl =
        await validateVideoUrl(
          videoUrl
        );

      if (!validUrl) {
        return res
          .status(400)
          .json({
            error:
              "URL inválida",
          });
      }
    }

    movie.title =
      title || movie.title;

    movie.overview =
      overview ||
      movie.overview;

    movie.poster =
      poster || movie.poster;

    movie.backdrop =
      backdrop ||
      movie.backdrop;

    movie.year =
      year || movie.year;

    movie.videoUrl =
      videoUrl ||
      movie.videoUrl;

    if (genres) {
      movie.genres =
        normalizeGenres(
          genres
        );

      movie.mainGenre =
        getMainGenre(
          movie.genres
        );
    }

    await movie.save();

    res.json(movie);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        "Erro ao atualizar filme",
    });
  }
});

/* =========================================
   DELETE
========================================= */

router.delete(
  "/:id",
  async (req, res) => {
    try {
      const movie =
        await Movie.findById(
          req.params.id
        );

      if (!movie) {
        return res
          .status(404)
          .json({
            error:
              "Filme não encontrado",
          });
      }

      await movie.deleteOne();

      res.json({
        success: true,
        message:
          "Filme removido",
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Erro ao remover filme",
      });
    }
  }
);

/* =========================================
   FAVORITES
========================================= */

router.get(
  "/favorites/list",
  async (req, res) => {
    try {
      const page =
        Number(req.query.page) || 1;

      const limit =
        Number(req.query.limit) || 20;

      const skip =
        (page - 1) * limit;

      const query = {
        favorite: true,
      };

      const [movies, total] =
        await Promise.all([
          Movie.find(query)
            .sort({
              createdAt: -1,
            })
            .skip(skip)
            .limit(limit),

          Movie.countDocuments(
            query
          ),
        ]);

      const processedMovies =
        movies.map((movie) => {
          const movieObject =
            movie.toObject();

          movieObject.genres =
            normalizeGenres(
              movieObject.genres
            );

          movieObject.mainGenre =
            getMainGenre(
              movieObject.genres
            );

          return movieObject;
        });

      const totalPages =
        Math.ceil(total / limit);

      res.json({
        data: processedMovies,

        pagination: {
          total,
          page,
          limit,
          totalPages,

          hasNextPage:
            page < totalPages,

          hasPrevPage:
            page > 1,
        },
      });
    } catch (error) {
      res.status(500).json({
        error:
          "Erro ao buscar favoritos",
      });
    }
  }
);

/* =========================================
   FAVORITE TOGGLE
========================================= */

router.patch(
  "/:id/favorite",
  async (req, res) => {
    try {
      const movie =
        await Movie.findById(
          req.params.id
        );

      if (!movie) {
        return res
          .status(404)
          .json({
            error:
              "Filme não encontrado",
          });
      }

      movie.favorite =
        !movie.favorite;

      await movie.save();

      res.json(movie);
    } catch (error) {
      res.status(500).json({
        error:
          "Erro ao favoritar",
      });
    }
  }
);

/* =========================================
   TMDB REFRESH
========================================= */

router.post(
  "/:id/refresh-tmdb",
  async (req, res) => {
    try {
      const movie =
        await Movie.findById(
          req.params.id
        );

      if (!movie) {
        return res
          .status(404)
          .json({
            error:
              "Filme não encontrado",
          });
      }

      if (!movie.tmdbId) {
        return res
          .status(400)
          .json({
            error:
              "Filme não possui tmdbId",
          });
      }

      const { data } =
        await axios.get(
          `https://api.themoviedb.org/3/movie/${movie.tmdbId}`,
          {
            params: {
              api_key:
                process.env
                  .TMDB_KEY,

              language:
                "pt-BR",
            },
          }
        );

      const genres =
        normalizeGenres(
          data.genres?.map(
            (g) => g.name
          ) || []
        );

      movie.title =
        data.title ||
        movie.title;

      movie.overview =
        data.overview ||
        movie.overview;

      movie.poster =
        data.poster_path
          ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
          : movie.poster;

      movie.backdrop =
        data.backdrop_path
          ? `https://image.tmdb.org/t/p/original${data.backdrop_path}`
          : movie.backdrop;

      movie.year =
        data.release_date
          ? data.release_date.split(
              "-"
            )[0]
          : movie.year;

      movie.genres =
        genres;

      movie.mainGenre =
        getMainGenre(
          genres
        );

      await movie.save();

      res.json(movie);
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Erro ao atualizar TMDB",
      });
    }
  }
);

module.exports = router;