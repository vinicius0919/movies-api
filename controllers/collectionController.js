
const mongoose = require("mongoose");
const Collection = require("../models/Collection");


const Movie = require("../models/Movie");
const Series = require("../models/Series");

class CollectionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateItems(items) {
  if (!Array.isArray(items) || items.length > 200) {
    throw new CollectionError(
      "Informe uma lista com até 200 títulos."
    );
  }

  const seen = new Set();

  return items.map((item) => {
    const mediaType = item?.mediaType;
    const mediaId = String(item?.mediaId || "");

    if (
      !["movie", "series"].includes(mediaType) ||
      !mongoose.isValidObjectId(mediaId)
    ) {
      throw new CollectionError(
        "A coleção contém um título inválido."
      );
    }

    const key = `${mediaType}:${mediaId}`;

    if (seen.has(key)) {
      throw new CollectionError(
        "A coleção contém títulos duplicados."
      );
    }

    seen.add(key);

    return { mediaType, mediaId };
  });
}

function normalizePayload(body = {}) {
  const data = {};

  if (Object.hasOwn(body, "title")) {
    const title = String(body.title || "").trim();

    if (!title || title.length > 120) {
      throw new CollectionError("Título inválido.");
    }

    data.title = title;
  }

  if (Object.hasOwn(body, "description")) {
    const description = String(
      body.description ?? ""
    ).trim();

    if (description.length > 1000) {
      throw new CollectionError(
        "Descrição muito longa."
      );
    }

    data.description = description;
  }

  if (Object.hasOwn(body, "coverUrl")) {
    const coverUrl = String(
      body.coverUrl ?? ""
    ).trim();

    if (coverUrl) {
      try {
        const url = new URL(coverUrl);

        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          coverUrl.length > 2000
        ) {
          throw new Error("URL inválida");
        }
      } catch {
        throw new CollectionError(
          "A imagem deve utilizar uma URL HTTPS válida."
        );
      }
    }

    data.coverUrl = coverUrl;
  }

  for (const field of ["published", "featured"]) {
    if (Object.hasOwn(body, field)) {
      if (typeof body[field] !== "boolean") {
        throw new CollectionError(
          `${field} deve ser booleano.`
        );
      }

      data[field] = body[field];
    }
  }

  if (Object.hasOwn(body, "sortOrder")) {
    if (
      !Number.isInteger(body.sortOrder) ||
      Math.abs(body.sortOrder) > 10000
    ) {
      throw new CollectionError(
        "Ordem de exibição inválida."
      );
    }

    data.sortOrder = body.sortOrder;
  }

  if (Object.hasOwn(body, "items")) {
    data.items = validateItems(body.items);
  }

  return data;
}

function handleError(error, res, next) {
  if (error instanceof CollectionError) {
    return res.status(error.status).json({
      error: error.message,
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      error: "Já existe uma coleção com esse identificador.",
    });
  }

  if (error.name === "ValidationError") {
    return res.status(400).json({
      error: "Dados da coleção inválidos.",
    });
  }

  return next(error);
}

// ========================================
// PUBLIC COLLECTION CONFIGURATIONS
// ========================================

exports.listPublic = async (req, res, next) => {
  try {
    const collections = await Collection.find({
      $or: [
        { published: true },
        { type: "genre", published: false },
      ],
    })
      .sort({ sortOrder: 1, title: 1 })
      .lean();

    const result = collections.map((collection) => {
      // Uma coleção de gênero oculta precisa
      // informar ao frontend que deve desaparecer.
      if (!collection.published) {
        return {
          id: collection.id,
          type: "genre",
          published: false,
        };
      }

      return {
        id: collection.id,
        type: collection.type,
        title: collection.title,
        description: collection.description,
        coverUrl: collection.coverUrl,
        genre: collection.genre,
        items: collection.items,
        published: true,
        featured: collection.featured,
        sortOrder: collection.sortOrder,
      };
    });

    return res.json({ collections: result });
  } catch (error) {
    return next(error);
  }
};

// ========================================
// ADMIN LIST
// ========================================

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


// Catálogo completo para seleção administrativa
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

    return res.json({
      movies,
      series,
      total: movies.length + series.length,
    });
  } catch (error) {
    return next(error);
  }
};


// ========================================
// CREATE MANUAL COLLECTION
// ========================================

exports.create = async (req, res, next) => {
  try {
    const data = normalizePayload(req.body);

    if (!data.title) {
      throw new CollectionError(
        "Informe o título da coleção."
      );
    }

    const slug = slugify(data.title);

    if (!slug) {
      throw new CollectionError(
        "Não foi possível gerar o identificador."
      );
    }

    const collection = await Collection.create({
      ...data,
      id: `custom-${slug}`,
      type: "manual",
      published: data.published ?? false,
    });

    return res.status(201).json(collection);
  } catch (error) {
    return handleError(error, res, next);
  }
};

// ========================================
// UPDATE OR CUSTOMIZE GENRE
// ========================================

exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = normalizePayload(req.body);

    let collection = await Collection.findOne({ id });

    if (!collection) {
      // Permite personalizar um gênero que ainda
      // existe apenas no catálogo automático.
      if (!id.startsWith("genre-")) {
        throw new CollectionError(
          "Coleção não encontrada.",
          404
        );
      }

      const genre = String(
        req.body.genre || ""
      ).trim();

      if (
        !genre ||
        genre.length > 100 ||
        `genre-${slugify(genre)}` !== id
      ) {
        throw new CollectionError(
          "Gênero inválido."
        );
      }

      if (Object.hasOwn(data, "items")) {
        throw new CollectionError(
          "Coleções por gênero não aceitam títulos manuais."
        );
      }

      collection = new Collection({
        ...data,
        id,
        type: "genre",
        genre,
        title: data.title || genre,
        published: data.published ?? true,
      });
    } else {
      if (
        collection.type === "genre" &&
        Object.hasOwn(data, "items")
      ) {
        throw new CollectionError(
          "Coleções por gênero não aceitam títulos manuais."
        );
      }

      collection.set(data);
    }

    await collection.save();

    return res.json(collection);
  } catch (error) {
    return handleError(error, res, next);
  }
};

// ========================================
// DELETE
// ========================================

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

    // Para gêneros, excluir a personalização
    // restaura a coleção automática original.
    return res.json({
      success: true,
      restoredDefault: collection.type === "genre",
    });
  } catch (error) {
    return next(error);
  }
};
