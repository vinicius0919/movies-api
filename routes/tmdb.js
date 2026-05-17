const express = require("express");

const {
  searchMovies,
} = require("../services/tmdbService");

const router = express.Router();

router.get("/search", async (req, res) => {
  try {
    const query = req.query.query;

    if (!query) {
      return res.status(400).json({
        error: "Query obrigatória",
      });
    }

    const movies = await searchMovies(query);

    res.json(movies);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erro ao buscar filmes",
    });
  }
});

module.exports = router;