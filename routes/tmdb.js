const express = require("express");

const router = express.Router();

const {
  searchMovies,
  searchSeries,
} = require("../controllers/tmdbController");

/* =========================================
   MOVIES
========================================= */

router.get(
  "/movies/search",
  searchMovies
);

/* =========================================
   SERIES
========================================= */

router.get(
  "/series/search",
  searchSeries
);

module.exports = router;