const express = require("express");

const axios = require("axios");

const Movie = require("../models/Movie");

const router = express.Router();

router.get(
  "/search",
  async (req, res) => {
    try {
      const query =
        req.query.query;

      const page =
        Number(req.query.page) || 1;

      console.log(
        "QUERY:",
        query
      );

      if (!query) {
        return res.status(400).json({
          error:
            "Query obrigatória",
        });
      }
      console.log(
        "TMDB KEY:",
        process.env.TMDB_KEY
          ? "OK"
          : "UNDEFINED"
      );

      const response =
        await axios.get(
          "https://api.themoviedb.org/3/search/movie",
          {
            params: {
              api_key:
                process.env
                  .TMDB_KEY,

              language: "pt-BR",

              query,

              page,
            },
          }
        );

      console.log(
        "TMDB STATUS:",
        response.status
      );

      const results =
        response.data.results ||
        [];

      const tmdbIds =
        results.map(
          (movie) => movie.id
        );

      const existingMovies =
        await Movie.find({
          tmdbId: {
            $in: tmdbIds,
          },
        });

      const moviesMap =
        new Map();

      existingMovies.forEach(
        (movie) => {
          moviesMap.set(
            movie.tmdbId,
            movie
          );
        }
      );

      const merged =
        results.map((movie) => {
          const existing =
            moviesMap.get(
              movie.id
            );

          return {
            ...movie,

            alreadyAdded:
              !!existing,

            localMovie:
              existing || null,
          };
        });

      return res.json({
        results: merged,

        pagination: {
          page:
            response.data.page,

          totalPages:
            response.data
              .total_pages,

          totalResults:
            response.data
              .total_results,
        },
      });
    } catch (error) {
      console.error(
        "ERRO TMDB:"
      );

      console.error(
        error.response?.data ||
          error.message ||
          error
      );

      return res.status(500).json({
        error:
          "Erro ao buscar filmes",
      });
    }
  }
);

module.exports = router;