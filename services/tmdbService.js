const axios = require("axios");

const BASE_URL =
  "https://api.themoviedb.org/3";

async function searchMovies(query) {
  const response = await axios.get(
    `${BASE_URL}/search/movie`,
    {
      params: {
        query,
        language: "pt-BR",
      },
      headers: {
        Authorization: `Bearer ${process.env.TMDB_TOKEN}`,
      },
    }
  );

  return response.data.results;
}

module.exports = {
  searchMovies,
};