const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  _id: String,
  count: { type: Number, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { versionKey: false });
module.exports = mongoose.model("RecoveryRateLimit", schema);
