const express = require("express");

const Movie = require("../models/Movie");

const {
  validateVideoUrl,
} = require(
  "../services/videoValidationService"
);

const router = express.Router();

/* =========================================
   GET ALL
========================================= */

router.get("/", async (req, res) => {
  try {
    const movies =
      await Movie.find().sort({
        createdAt: -1,
      });

    res.json(movies);
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

    res.json(movie);
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
      await validateVideoUrl(
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
      overview || movie.overview;

    movie.poster =
      poster || movie.poster;

    movie.backdrop =
      backdrop || movie.backdrop;

    movie.year =
      year || movie.year;

    movie.videoUrl =
      videoUrl || movie.videoUrl;

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

router.get(
  "/favorites/list",
  async (req, res) => {
    try {
      const movies =
        await Movie.find({
          favorite: true,
        });

      res.json(movies);
    } catch (error) {
      res.status(500).json({
        error:
          "Erro ao buscar favoritos",
      });
    }
  }
);

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


module.exports = router;