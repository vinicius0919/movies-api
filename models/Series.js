const mongoose =
  require("mongoose");

/* =========================================
   EPISODE
========================================= */

const episodeSchema =
  new mongoose.Schema(
    {
      episodeNumber: {
        type: Number,
        required: true,
      },

      title: {
        type: String,
        required: true,
      },

      overview: String,

      duration: Number,

      still: String,

      videoUrl: {
        type: String,
        required: true,
      },

      views: {
        type: Number,
        default: 0,
        index: true,
      },

      sources: [
        {
          provider: String,
          url: String,
          priority: Number,
          active: Boolean,
          lastCheckedAt: Date,
          status: String,
        },
      ],
    },
    {
      timestamps: true,
    }
  );

/* =========================================
   SEASON
========================================= */

const seasonSchema =
  new mongoose.Schema(
    {
      seasonNumber: {
        type: Number,
        required: true,
      },

      title: String,

      episodes: [
        episodeSchema,
      ],
    },
    {
      _id: false,
    }
  );

/* =========================================
   SERIES
========================================= */

const seriesSchema =
  new mongoose.Schema(
    {
      tmdbId: Number,

      title: {
        type: String,
        required: true,
      },

      overview: String,

      poster: String,

      backdrop: String,

      year: String,

      favorite: {
        type: Boolean,
        default: false,
      },

      genres: [String],

      views: {
        type: Number,
        default: 0,
        index: true,
      },

      status: {
        type: String,
        default: "ongoing",
      },

      totalSeasons: {
        type: Number,
        default: 1,
      },

      totalEpisodes: {
        type: Number,
        default: 0,
      },

      seasons: [
        seasonSchema,
      ],
    },
    {
      timestamps: true,
    }
  );

module.exports =
  mongoose.model(
    "Series",
    seriesSchema
  );