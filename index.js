require("dotenv").config();
const connectDatabase = require("./config/database");
const express = require("express");
const cors = require("cors");

const moviesRoutes = require("./routes/movies");
const seriesRoutes = require("./routes/series");
const tmdbRoutes = require("./routes/tmdb");
const streamRoutes = require("./routes/stream");
const app = express();

app.use(cors());

app.use(express.json());
app.use("/api/movies", moviesRoutes);
app.use("/api/series", seriesRoutes);
app.use("/api/tmdb", tmdbRoutes);
app.use("/api/stream", streamRoutes);
connectDatabase();
app.listen(process.env.PORT || 3001, () => {
  console.log("Server ON");
});
