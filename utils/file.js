const fs = require("fs-extra");

const path = require("path");

const moviesPath = path.join(
  __dirname,
  "../data/movies.json"
);

async function readMovies() {
  try {
    return await fs.readJson(
      moviesPath
    );
  } catch (error) {
    return [];
  }
}
async function saveMovies(movies) {
  await fs.writeJson(
    moviesPath,
    movies,
    {
      spaces: 2,
    }
  );
}

module.exports = {
  readMovies,
  saveMovies,
};