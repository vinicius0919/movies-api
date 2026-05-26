const axios = require("axios");

const Movie = require("../models/Movie");

const Series = require("../models/Series");

/* =========================================
   TMDB API
========================================= */

const tmdb = axios.create({
  baseURL:
    "https://api.themoviedb.org/3",

  params: {
    api_key:
      process.env.TMDB_KEY,

    language: "pt-BR",
  },
});

/* =========================================
   HELPERS
========================================= */

function mapMovie(movie) {
  return {
    tmdbId: movie.id,

    title:
      movie.title ||
      movie.name,

    overview:
      movie.overview,

    poster: movie.poster_path
      ? `https://image.tmdb.org/t/p/w500${movie.poster_path}`
      : "",

    backdrop:
      movie.backdrop_path
        ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}`
        : "",

    year:
      movie.release_date?.split(
        "-"
      )[0] ||
      movie.first_air_date?.split(
        "-"
      )[0],

    popularity:
      movie.popularity,
  };
}

/* =========================================
   SEARCH MOVIES
========================================= */

async function searchMovies(
  req,
  res
) {
  try {
    const query =
      req.query.query;

    const page =
      Number(req.query.page) || 1;

    if (!query) {
      return res
        .status(400)
        .json({
          error:
            "Query obrigatória",
        });
    }

    /* =====================================
       TMDB REQUEST
    ===================================== */

    const response =
      await tmdb.get(
        "/search/movie",
        {
          params: {
            query,
            page,
          },
        }
      );

    const results =
      response.data.results ||
      [];

    /* =====================================
       LOCAL DB
    ===================================== */

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

    /* =====================================
       MERGE
    ===================================== */

    const merged =
      results.map((movie) => {
        const existing =
          moviesMap.get(
            movie.id
          );

        return {
          ...mapMovie(movie),

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
      "TMDB MOVIES ERROR:"
    );

    console.error(
      error.response?.data ||
        error.message ||
        error
    );

    return res
      .status(500)
      .json({
        error:
          "Erro ao buscar filmes",
      });
  }
}

/* =========================================
   SEARCH SERIES
========================================= */

async function searchSeries(
  req,
  res
) {
  try {
    const query =
      req.query.query;

    const page =
      Number(req.query.page) || 1;

    if (!query) {
      return res
        .status(400)
        .json({
          error:
            "Query obrigatória",
        });
    }

    /* =====================================
       TMDB REQUEST
    ===================================== */

    const response =
      await tmdb.get(
        "/search/tv",
        {
          params: {
            query,
            page,
          },
        }
      );

    const results =
      response.data.results ||
      [];

    /* =====================================
       LOCAL DB
    ===================================== */

    const tmdbIds =
      results.map(
        (series) =>
          series.id
      );

    const existingSeries =
      await Series.find({
        tmdbId: {
          $in: tmdbIds,
        },
      });

    const seriesMap =
      new Map();

    existingSeries.forEach(
      (series) => {
        seriesMap.set(
          series.tmdbId,
          series
        );
      }
    );

    /* =====================================
       MERGE
    ===================================== */

    const merged =
      results.map((series) => {
        const existing =
          seriesMap.get(
            series.id
          );

        return {
          ...mapMovie(series),

          alreadyAdded:
            !!existing,

          localSeries:
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
      "TMDB SERIES ERROR:"
    );

    console.error(
      error.response?.data ||
        error.message ||
        error
    );

    return res
      .status(500)
      .json({
        error:
          "Erro ao buscar séries",
      });
  }
}

module.exports = {
  searchMovies,
  searchSeries,
};