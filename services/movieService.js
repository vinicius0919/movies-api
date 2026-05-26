// services/movieService.js

const Movie = require("../models/Movie");
const { normalizeGenres, getMainGenre } = require("./genreMapper");
const streamRouter = require("./streamRouter");
// Adiciona no topo
const tmdbService = require("./tmdbService")
const youtubeProvider = require("../providers/YoutubeProvider");

class MovieService {
    _applyGenres(movie, genres) {
        movie.genres = normalizeGenres(genres);
        movie.mainGenre = getMainGenre(movie.genres);
    }

    async list({ page = 1, limit = 20, search = "", genre = "" } = {}) {
        const query = {};
        if (search) query.title = { $regex: search, $options: "i" };
        if (genre) query.genres = { $in: [genre] };

        const skip = (page - 1) * limit;

        const [movies, total] = await Promise.all([
            Movie.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Movie.countDocuments(query),
        ]);

        const totalPages = Math.ceil(total / limit);

        return {
            data: movies,
            pagination: {
                total, page, limit, totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            },
        };
    }

    async findById(id) {
        const movie = await Movie.findById(id);
        if (!movie) return null;

        const obj = movie.toObject();
        obj.genres = normalizeGenres(obj.genres);
        obj.mainGenre = getMainGenre(obj.genres);

        // Enriquece com info do provider — frontend decide como renderizar
        try {
            const provider = streamRouter.getProvider(obj.videoUrl);
            obj.provider = provider.constructor.name
                .replace("Provider", "")
                .toLowerCase(); // "youtube" | "tokyvideo" | "streamtape"

            if (obj.provider === "youtube") {
                const videoId = youtubeProvider.extractVideoId(obj.videoUrl);
                obj.videoId = videoId;
                obj.embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
            }
        } catch {
            obj.provider = "unknown";
        }

        return obj;
    }
    async create(data) {
        // if (!data.title)
        //     throw Object.assign(
        //         new Error("Título obrigatório"),
        //         { status: 400 }
        //     );

        console.log(data)
    
        if (!data.videoUrl)
            throw Object.assign(
                new Error("URL do vídeo obrigatória"),
                { status: 400 }
            );
    
        if (!streamRouter.isValidUrl(data.videoUrl))
            throw Object.assign(
                new Error(
                    "URL inválida ou provider não suportado"
                ),
                { status: 400 }
            );
    
        const exists =
            await Movie.findOne({
                tmdbId: data.tmdbId,
            });
    
        if (exists)
            throw Object.assign(
                new Error(
                    "Filme já cadastrado"
                ),
                { status: 400 }
            );
    
        /* =========================================
           TMDB ENRICHMENT
        ========================================= */
    
        if (data.tmdbId) {
            try {
                const tmdbMovie =
                    await tmdbService.getMovieDetails(
                        data.tmdbId
                    );

                console.log(tmdbMovie)
                data.title = tmdbMovie.title || tmdbMovie.original_title
                data.genres =
                    tmdbMovie.genres?.map(
                        (genre) => genre.name
                    ) || [];
    
                data.poster =
                    tmdbMovie.poster_path
                        ? `https://image.tmdb.org/t/p/w500${tmdbMovie.poster_path}`
                        : data.poster;
    
                data.backdrop =
                    tmdbMovie.backdrop_path
                        ? `https://image.tmdb.org/t/p/original${tmdbMovie.backdrop_path}`
                        : data.backdrop;
    
                data.overview =
                    tmdbMovie.overview ||
                    data.overview;
    
                data.year =
                    tmdbMovie.release_date?.split(
                        "-"
                    )[0] || data.year;
            } catch (error) {
                console.error(
                    "TMDB enrichment error:",
                    error.message
                );
            }
        }
    
        /* =========================================
           GENRES
        ========================================= */
    
        this._applyGenres(
            data,
            data.genres || []
        );
    
        return Movie.create(data);
    }

    async update(id, data) {
        const movie = await Movie.findById(id);
        if (!movie) return null;

        if (data.videoUrl && !streamRouter.isValidUrl(data.videoUrl))
            throw Object.assign(new Error("URL inválida"), { status: 400 });

        const fields = ["title", "overview", "poster", "backdrop", "year", "videoUrl"];
        fields.forEach((f) => { if (data[f]) movie[f] = data[f]; });

        if (data.genres) this._applyGenres(movie, data.genres);

        await movie.save();
        return movie;
    }

    async remove(id) {
        const movie = await Movie.findById(id);
        if (!movie) return null;
        await movie.deleteOne();
        return true;
    }

    async toggleFavorite(id) {
        const movie = await Movie.findById(id);
        if (!movie) return null;
        movie.favorite = !movie.favorite;
        await movie.save();
        return movie;
    }

    async listFavorites({ page = 1, limit = 20 } = {}) {
        return this.list({ page, limit, genre: "", search: "" /* query abaixo sobrescreve */ })
            .then(() => { }) // delegamos direto
            || this._listQuery({ favorite: true }, page, limit);
    }

    async _listQuery(query, page, limit) {
        const skip = (page - 1) * limit;
        const [movies, total] = await Promise.all([
            Movie.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Movie.countDocuments(query),
        ]);
        const totalPages = Math.ceil(total / limit);
        const data = movies.map((m) => {
            const obj = m.toObject();
            obj.genres = normalizeGenres(obj.genres);
            obj.mainGenre = getMainGenre(obj.genres);
            return obj;
        });
        return { data, pagination: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 } };
    }
}

module.exports = new MovieService();