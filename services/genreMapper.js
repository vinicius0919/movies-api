// services/genreMapper.js

const GENRE_MAP = {
    Animation: "Animação",
    Comedy: "Comédia",
    Romance: "Romance",
    Fantasy: "Fantasia",
    Action: "Ação",
    Adventure: "Aventura",
    Drama: "Drama",
    Horror: "Terror",
    "Science Fiction": "Ficção científica",
    Family: "Família",
    Mystery: "Mistério",
    Crime: "Crime",
    Western: "Faroeste",
  };
  
  const GENRE_PRIORITY = [
    "Animação", "Comédia", "Romance", "Fantasia",
  ];
  
  function normalizeGenres(genres = []) {
    return genres.map((g) => GENRE_MAP[g] || g);
  }
  
  function getMainGenre(genres = []) {
    const normalized = normalizeGenres(genres);
    return (
      GENRE_PRIORITY.find((g) => normalized.includes(g)) ||
      normalized[0] ||
      ""
    );
  }
  
  module.exports = { normalizeGenres, getMainGenre };