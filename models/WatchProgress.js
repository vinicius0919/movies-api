
const mongoose = require("mongoose");

const watchProgressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    series: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Series",
      required: true,
    },

    seasonNumber: {
      type: Number,
      required: true,
      min: 0,
    },

    episodeNumber: {
      type: Number,
      required: true,
      min: 0,
    },

    currentTime: {
      type: Number,
      default: 0,
      min: 0,
    },

    duration: {
      type: Number,
      default: 0,
      min: 0,
    },

    completed: {
      type: Boolean,
      default: false,
    },

    lastWatchedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

watchProgressSchema.index(
  { user: 1, series: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "WatchProgress",
  watchProgressSchema
);
