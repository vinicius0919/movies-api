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
    // Campo sem default para preservar filmes legados que não possuem
    // publicação definida. A criação de novos filmes define false
    // explicitamente no service.
    published: {
      type: Boolean,
      index: true,
    },
    validationStatus: {
      type: String,
      enum: ["unreviewed", "pending", "validated", "rejected"],
      index: true,
    },
    publishedAt: Date,
    tmdbValidatedAt: Date,
    favorite: {
      type: Boolean,
      default: false,
    },
    videoUrl: {
      type: String,
      required: true,
    },
    views: {
      type: Number,
      default: 0,
    },
    genres: [String],
    sources: [
      {
        provider: String,
        url: String,
        priority: Number,
        active: Boolean,
        lastCheckedAt: Date,
        status: String,
      },
    ]
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Movie", movieSchema);
