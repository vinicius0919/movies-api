const axios = require("axios");
const Movie = require("../models/Movie");

const BASE_URL =
  "https://api.themoviedb.org/3";

/* =========================================
   AXIOS CONFIG
========================================= */

const tmdb = axios.create({
  baseURL: BASE_URL,

  headers: {
    Authorization: `Bearer ${process.env.TMDB_TOKEN}`,
  },
});

/* =========================================
   SEARCH MOVIES
========================================= */

async function searchMovies(
  query,
  page = 1
) {
  const response = await tmdb.get(
    "/search/movie",
    {
      params: {
        query,
        page,
        language: "pt-BR",
      },
    }
  );

  return response.data;
}

/* =========================================
   GET MOVIE DETAILS
========================================= */

async function getMovieDetails(
  tmdbId
) {
  const response = await tmdb.get(
    `/movie/${tmdbId}`,
    {
      params: {
        language: "pt-BR",
      },
    }
  );

  return response.data;
}

/* =========================================
   REFRESH LOCAL MOVIE
========================================= */

async function refresh(movieId) {
  const movie =
    await Movie.findById(movieId);

  if (!movie) return null;

  if (!movie.tmdbId) {
    throw new Error(
      "Filme não possui tmdbId"
    );
  }

  const tmdbMovie =
    await getMovieDetails(
      movie.tmdbId
    );

  movie.title =
    tmdbMovie.title ||
    movie.title;

  movie.overview =
    tmdbMovie.overview ||
    movie.overview;

  movie.poster =
    tmdbMovie.poster_path
      ? `https://image.tmdb.org/t/p/w500${tmdbMovie.poster_path}`
      : movie.poster;

  movie.backdrop =
    tmdbMovie.backdrop_path
      ? `https://image.tmdb.org/t/p/original${tmdbMovie.backdrop_path}`
      : movie.backdrop;

  movie.year =
    tmdbMovie.release_date?.split(
      "-"
    )[0] || movie.year;

  movie.genres =
    tmdbMovie.genres?.map(
      (genre) => genre.name
    ) || [];

  await movie.save();

  return movie;
}

module.exports = {
  searchMovies,
  getMovieDetails,
  refresh,
};