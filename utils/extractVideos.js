function extractMp4Url(html) {
  const regex =
    /https:\/\/cdnst.*?\.mp4\?secure=.*?(?=")/;

  const match = html.match(regex);

  if (!match) {
    return null;
  }

  return match[0];
}

module.exports = {
  extractMp4Url,
};