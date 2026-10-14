
require("dotenv").config();

const mongoose = require("mongoose");
const connectDatabase = require("./config/database");

async function test() {
  await connectDatabase();

  const db = mongoose.connection.db;

  const users = await db.collection("users").countDocuments();
  const plans = await db.collection("plans").countDocuments();
  const subscriptions = await db
    .collection("subscriptions")
    .countDocuments();

  const testUser = await db.collection("users").findOne(
    { email: "usuario@example.com" },
    { projection: { name: 1, email: 1 } }
  );

  console.log({
    database: mongoose.connection.name,
    users,
    plans,
    subscriptions,
    testUser,
  });

  await mongoose.disconnect();
}

test().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
