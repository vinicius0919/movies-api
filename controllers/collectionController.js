
const mongoose = require("mongoose");

const Collection = require("../models/Collection");
const Movie = require("../models/Movie");
const Series = require("../models/Series");

const PUBLIC_FIELDS = [
  "_id",
  "title",
  "poster",
  "backdrop",
  "year",
  "releaseDate",
  "genres",
  "overview",
  "description",
  "rating",
  "published",
].join(" ");

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function normalizePayload(body = {}) {
  const data = {};

  if (Object.hasOwn(body, "title")) {
    if (
      typeof body.title !== "string" ||
      !body.title.trim() ||
      body.title.trim().length > 120
    ) {
      throw badRequest("Título inválido.");
    }

    data.title = body.title.trim();
  }

  if (Object.hasOwn(body, "description")) {
    if (
      typeof body.description !== "string" ||
      body.description.length > 1000
    ) {
      throw badRequest("Descrição inválida.");
    }

    data.description = body.description.trim();
  }

  if (Object.hasOwn(body, "coverUrl")) {
    const value = body.coverUrl;

    if (typeof value !== "string") {
      throw badRequest("URL de capa inválida.");
    }

    const url = value.trim();

    if (url) {
      try {
        const parsed = new URL(url);

        if (
          parsed.protocol !== "https:" ||
          parsed.username ||
          parsed.password ||
          url.length > 2000
        ) {
          throw new Error("Invalid URL");
        }
      } catch {
        throw badRequest(
          "A capa deve utilizar uma URL HTTPS válida."
        );
      }
    }

    data.coverUrl = url;
  }

  for (const field of ["published", "featured"]) {
    if (Object.hasOwn(body, field)) {
      if (typeof body[field] !== "boolean") {
        throw badRequest(`${field} deve ser booleano.`);
      }

      data[field] = body[field];
    }
  }

  if (Object.hasOwn(body, "sortOrder")) {
    if (
      !Number.isInteger(body.sortOrder) ||
      Math.abs(body.sortOrder) > 10000
    ) {
      throw badRequest("Ordem inválida.");
    }

    data.sortOrder = body.sortOrder;
  }

  if (Object.hasOwn(body, "items")) {
    if (
      !Array.isArray(body.items) ||
      body.items.length > 200
    ) {
      throw badRequest(
        "Informe até 200 títulos por coleção."
      );
    }

    const seen = new Set();

    data.items = body.items.map((item) => {
      const mediaType = item?.mediaType;
      const mediaId = String(item?.mediaId || "");

      if (
        !["movie", "series"].includes(mediaType) ||
        !mongoose.isValidObjectId(mediaId)
      ) {
        throw badRequest(
          "A coleção contém um título inválido."
        );
      }

      const key = `${mediaType}:${mediaId}`;

      if (seen.has(key)) {
        throw badRequest(
          "A coleção contém títulos duplicados."
        );
      }

      seen.add(key);

      return { mediaType, mediaId };
    });
  }

  return data;
}

async function validateReferences(items) {
  const movieIds = items
    .filter((item) => item.mediaType === "movie")
    .map((item) => item.mediaId);

  const seriesIds = items
    .filter((item) => item.mediaType === "series")
    .map((item) => item.mediaId);

  const [movieCount, seriesCount] = await Promise.all([
    Movie.countDocuments({
      _id: { $in: movieIds },
    }),
    Series.countDocuments({
      _id: { $in: seriesIds },
    }),
  ]);

  if (
    movieCount !== movieIds.length ||
    seriesCount !== seriesIds.length
  ) {
    throw badRequest(
      "Um ou mais títulos não existem no catálogo."
    );
  }
}

function handleError(error, next) {
  if (error.code === 11000) {
    error.status = 409;
    error.message =
      "Já existe uma coleção com esse identificador.";
  }

  next(error);
}

// ======================================
// PUBLIC
// ======================================

exports.listPublic = async (req, res, next) => {
  try {
    const collections = await Collection.find({
      published: true,
    })
      .sort({ sortOrder: 1, title: 1 })
      .lean();

    const movieIds = new Set();
    const seriesIds = new Set();

    for (const collection of collections) {
      for (const reference of collection.items || []) {
        const id = String(reference.mediaId);

        if (reference.mediaType === "movie") {
          movieIds.add(id);
        } else if (reference.mediaType === "series") {
          seriesIds.add(id);
        }
      }
    }

    const [movies, series] = await Promise.all([
      Movie.find({
        _id: { $in: [...movieIds] },
        published: { $ne: false },
      })
        .select(PUBLIC_FIELDS)
        .lean(),

      Series.find({
        _id: { $in: [...seriesIds] },
        published: { $ne: false },
      })
        .select(PUBLIC_FIELDS)
        .lean(),
    ]);

    const mediaIndex = new Map();

    for (const movie of movies) {
      mediaIndex.set(`movie:${movie._id}`, {
        ...movie,
        mediaType: "movie",
      });
    }

    for (const item of series) {
      mediaIndex.set(`series:${item._id}`, {
        ...item,
        mediaType: "series",
      });
    }

    const result = collections.map((collection) => {
      const resolvedItems = (collection.items || [])
        .map((reference) =>
          mediaIndex.get(
            `${reference.mediaType}:${reference.mediaId}`
          )
        )
        .filter(Boolean);

      return {
        id: collection.id,
        title: collection.title,
        description: collection.description,
        coverUrl: collection.coverUrl,
        featured: collection.featured,
        sortOrder: collection.sortOrder,
        published: true,
        resolvedItems,
      };
    });

    return res.json({ collections: result });
  } catch (error) {
    return next(error);
  }
};

// ======================================
// ADMIN
// ======================================

exports.listAdmin = async (req, res, next) => {
  try {
    const collections = await Collection.find()
      .sort({ sortOrder: 1, title: 1 })
      .lean();

    return res.json({ collections });
  } catch (error) {
    return next(error);
  }
};

exports.listAdminMedia = async (req, res, next) => {
  try {
    const [movies, series] = await Promise.all([
      Movie.find({})
        .select("_id title poster published")
        .sort({ title: 1 })
        .lean(),

      Series.find({})
        .select("_id title poster published")
        .sort({ title: 1 })
        .lean(),
    ]);

    return res.json({ movies, series });
  } catch (error) {
    return next(error);
  }
};

exports.create = async (req, res, next) => {
  try {
    const data = normalizePayload(req.body);

    if (!data.title) {
      throw badRequest("Informe o título.");
    }

    const slug = slugify(data.title);

    if (!slug) {
      throw badRequest("Título inválido.");
    }

    await validateReferences(data.items || []);

    const collection = await Collection.create({
      ...data,
      id: `custom-${slug}`,
    });

    return res.status(201).json(collection);
  } catch (error) {
    return handleError(error, next);
  }
};

exports.update = async (req, res, next) => {
  try {
    const collection = await Collection.findOne({
      id: req.params.id,
    });

    if (!collection) {
      return res.status(404).json({
        error: "Coleção não encontrada.",
      });
    }

    const data = normalizePayload(req.body);

    if (data.items) {
      await validateReferences(data.items);
    }

    collection.set(data);
    await collection.save();

    return res.json(collection);
  } catch (error) {
    return handleError(error, next);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const collection = await Collection.findOneAndDelete({
      id: req.params.id,
    });

    if (!collection) {
      return res.status(404).json({
        error: "Coleção não encontrada.",
      });
    }

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
};
