// providers/IStreamProvider.js

/**
 * Interface base para providers de streaming.
 * Todo provider deve implementar estes três métodos.
 */
class IStreamProvider {
    /** @param {string} url - URL salva no banco */
    canHandle(url) {
      throw new Error("canHandle() não implementado");
    }
  
    /** @param {string} html - HTML da página do provider */
    async extractMp4(html) {
      throw new Error("extractMp4() não implementado");
    }
  
    /** @param {string} url @param {Request} req @param {Response} res */
    async stream(url, req, res) {
      throw new Error("stream() não implementado");
    }
  }
  
  module.exports = IStreamProvider;