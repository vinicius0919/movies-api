const mongoose = require("mongoose");

async function connectDatabase() {
  try {
    await mongoose.connect(
      process.env.MONGO_URI
    );

    console.log(
      "MongoDB connected"
    );
  } catch (error) {
    console.error(error);

    process.exit(1);
  }
}

module.exports = connectDatabase;