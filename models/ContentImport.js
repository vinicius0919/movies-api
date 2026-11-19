const mongoose = require("mongoose");

const historySchema = new mongoose.Schema(
  {
    operation: { type: String, required: true, trim: true },
    administratorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    at: { type: Date, default: Date.now },
    result: { type: String, enum: ["success", "error", "skipped"], required: true },
    message: { type: String, maxlength: 1000 },
    fields: { type: [String], default: [] },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false },
);

const contentImportSchema = new mongoose.Schema(
  {
    sourceUrl: { type: String, required: true, trim: true, maxlength: 2000 },
    sourceKey: { type: String, required: true, unique: true, index: true },
    sourceOrigin: { type: String, trim: true, maxlength: 200 },
    extractedTitle: { type: String, required: true, trim: true, maxlength: 500 },
    normalizedTitle: { type: String, required: true, trim: true, index: true },
    suggestedType: { type: String, enum: ["movie", "series", "episode"], required: true, index: true },
    seasonNumber: { type: Number, min: 0 },
    episodeNumber: { type: Number, min: 0 },
    duration: { type: Number, min: 0 },
    thumbnail: { type: String, maxlength: 2000 },
    // A URL de origem é a página coletada. Esta URL é um candidato separado
    // e só pode virar reprodução após validação do provider e autorização.
    reproductionCandidateUrl: { type: String, trim: true, maxlength: 2000 },
    reproductionCandidateStatus: {
      type: String,
      enum: ["unknown", "compatible", "incompatible"],
      default: "unknown",
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    batchId: { type: String, required: true, index: true },
    processingStatus: {
      type: String,
      enum: ["pending", "ready", "processed", "rejected", "error"],
      default: "pending",
      index: true,
    },
    validation: {
      status: { type: String, enum: ["unreviewed", "pending", "validated", "rejected"], default: "unreviewed" },
      tmdbStatus: { type: String, enum: ["unlinked", "suggested", "validated", "rejected"], default: "unlinked" },
      tmdbId: { type: Number, min: 1 },
      tmdbType: { type: String, enum: ["movie", "tv"] },
      matches: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },
    finalReference: {
      model: { type: String, enum: ["Movie", "Series"] },
      objectId: { type: mongoose.Schema.Types.ObjectId },
      seasonNumber: { type: Number, min: 0 },
      episodeNumber: { type: Number, min: 0 },
    },
    operationLock: { type: String, index: true },
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true },
);

contentImportSchema.index({ batchId: 1, createdAt: -1 });
contentImportSchema.index({ processingStatus: 1, suggestedType: 1, createdAt: -1 });

module.exports = mongoose.model("ContentImport", contentImportSchema);
