function extractMp4Url(html) {
  if (!html) return null;

  const patterns = [
    /https?:\/\/[^"' ]+\.mp4[^"' ]*/gi,

    /"videoUrl":"(https?:\/\/[^"]+)"/gi,

    /"contentUrl":"(https?:\/\/[^"]+)"/gi,
  ];

  for (const pattern of patterns) {
    const matches = [
      ...html.matchAll(pattern),
    ];

    if (matches.length > 0) {
      const url =
        matches[0][1] ||
        matches[0][0];

      return url
        .replace(/\\u0026/g, "&")
        .replace(/\\/g, "");
    }
  }

  return null;
}

module.exports = {
  extractMp4Url,
};