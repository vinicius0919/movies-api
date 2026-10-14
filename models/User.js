const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      maxlength: 254,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    favorites: {
      movies: {
        type: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Movie",
          },
        ],
        default: [],
      },

      series: {
        type: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Series",
          },
        ],
        default: [],
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("User", userSchema);