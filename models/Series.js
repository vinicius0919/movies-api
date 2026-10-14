
const mongoose = require("mongoose");

const sourceSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      trim: true,
      default: "direct",
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    priority: {
      type: Number,
      default: 0,
    },
    active: {
      type: Boolean,
      default: true,
    },
    lastCheckedAt: Date,
    status: {
      type: String,
      enum: ["unknown", "online", "offline"],
      default: "unknown",
    },
  },
  { _id: true }
);

const episodeSchema = new mongoose.Schema(
  {
    episodeNumber: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isInteger,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },
    overview: {
      type: String,
      default: "",
    },
    duration: {
      type: Number,
      min: 0,
      default: 0,
    },
    still: {
      type: String,
      default: "",
    },
    videoUrl: {
      type: String,
      default: "",
    },
    views: {
      type: Number,
      default: 0,
      min: 0,
    },
    sources: {
      type: [sourceSchema],
      default: [],
    },
  },
  { timestamps: true }
);

const seasonSchema = new mongoose.Schema(
  {
    seasonNumber: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isInteger,
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    episodes: {
      type: [episodeSchema],
      default: [],
    },
  },
  { timestamps: true }
);

const seriesSchema = new mongoose.Schema(
  {
    tmdbId: {
      type: Number,
      min: 1,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },
    overview: {
      type: String,
      default: "",
    },
    poster: String,
    backdrop: String,
    year: String,
    genres: {
      type: [String],
      default: [],
    },
    views: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "ongoing",
        "completed",
        "cancelled",
        "hiatus",
      ],
      default: "ongoing",
    },
    published: {
      type: Boolean,
      default: false,
    },
    totalSeasons: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalEpisodes: {
      type: Number,
      default: 0,
      min: 0,
    },
    seasons: {
      type: [seasonSchema],
      default: [],
    },
  },
  { timestamps: true }
);

// Evita duplicações dentro de uma mesma série.
seriesSchema.pre("validate", function () {
  const seasonNumbers = new Set();

  for (const season of this.seasons || []) {
    if (seasonNumbers.has(season.seasonNumber)) {
      this.invalidate(
        "seasons",
        `Temporada ${season.seasonNumber} duplicada`
      );
    }

    seasonNumbers.add(season.seasonNumber);

    const episodeNumbers = new Set();

    for (const episode of season.episodes || []) {
      if (episodeNumbers.has(episode.episodeNumber)) {
        this.invalidate(
          "seasons",
          `Episódio ${episode.episodeNumber} duplicado na temporada ${season.seasonNumber}`
        );
      }

      episodeNumbers.add(episode.episodeNumber);
    }
  }

  this.totalSeasons = this.seasons.length;
  this.totalEpisodes = this.seasons.reduce(
    (total, season) => total + season.episodes.length,
    0
  );
});

seriesSchema.index(
  { tmdbId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      tmdbId: { $type: "number" },
    },
  }
);

module.exports = mongoose.model("Series", seriesSchema);
