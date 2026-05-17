const mongoose = require("mongoose");

const movieSchema = new mongoose.Schema(
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
    videoUrl: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Movie", movieSchema);
