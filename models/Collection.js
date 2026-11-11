
const mongoose = require("mongoose");

const collectionItemSchema = new mongoose.Schema(
  {
    mediaType: {
      type: String,
      enum: ["movie", "series"],
      required: true,
    },
    mediaId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  },
  { _id: false }
);

const collectionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      match: /^custom-[a-z0-9]+(?:-[a-z0-9]+)*$/,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },

    coverUrl: {
      type: String,
      default: "",
      trim: true,
    },

    items: {
      type: [collectionItemSchema],
      default: [],
    },

    published: {
      type: Boolean,
      default: false,
    },

    featured: {
      type: Boolean,
      default: false,
    },

    sortOrder: {
      type: Number,
      default: 100,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

collectionSchema.index({
  published: 1,
  sortOrder: 1,
});

module.exports = mongoose.model(
  "Collection",
  collectionSchema
);
