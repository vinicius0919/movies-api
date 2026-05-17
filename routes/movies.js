const express = require("express");

const {
  readMovies,
  saveMovies,
} = require("../utils/file");

const {
  validateVideoUrl,
} = require("../services/videoValidationService");

const router = express.Router();

router.get("/", async (req, res) => {
  const movies = await readMovies();

  res.json(movies);
});

router.post("/", async (req, res) => {
  try {
    const movie = req.body;

    if (!movie.title) {
      return res.status(400).json({
        error: "Título obrigatório",
      });
    }

    if (!movie.videoUrl) {
      return res.status(400).json({
        error: "videoUrl obrigatória",
      });
    }

    const validUrl = await validateVideoUrl(
      movie.videoUrl
    );

    if (!validUrl) {
      return res.status(400).json({
        error: "URL inválida",
      });
    }

    const movies = await readMovies();

    const exists = movies.find(
      (m) => m.tmdbId === movie.tmdbId
    );

    if (exists) {
      return res.status(400).json({
        error: "Filme já cadastrado",
      });
    }

    movies.push({
      ...movie,
      id: Date.now(),
    });

    await saveMovies(movies);

    res.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erro ao cadastrar filme",
    });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);

  const movies = await readMovies();

  const filtered = movies.filter(
    (m) => m.id !== id
  );

  await saveMovies(filtered);

  res.json({
    success: true,
  });
});

module.exports = router;