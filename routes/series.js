const express =
  require("express");

const router =
  express.Router();

const {
  getSeries,
  getSeriesById,
  createSeries,
  updateSeries,
  deleteSeries,
  addEpisode,
  updateEpisode,
  deleteEpisode,
  getHomeSeries,
  addSeriesView,
  addEpisodeView,
} = require(
  "../controllers/seriesController"
);

/* =========================================
   HOME
========================================= */

router.get(
  "/home",
  getHomeSeries
);

/* =========================================
   SERIES
========================================= */

router.get(
  "/",
  getSeries
);

router.get(
  "/:id",
  getSeriesById
);

router.post(
  "/",
  createSeries
);

router.put(
  "/:id",
  updateSeries
);

router.delete(
  "/:id",
  deleteSeries
);

/* =========================================
   VIEWS
========================================= */

router.post(
  "/:id/view",
  addSeriesView
);

router.post(
  "/:id/seasons/:season/episodes/:episode/view",
  addEpisodeView
);

/* =========================================
   EPISODES
========================================= */

router.post(
  "/:id/episodes",
  addEpisode
);

router.put(
  "/:id/seasons/:season/episodes/:episode",
  updateEpisode
);

router.delete(
  "/:id/seasons/:season/episodes/:episode",
  deleteEpisode
);

module.exports = router;