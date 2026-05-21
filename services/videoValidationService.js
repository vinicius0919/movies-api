function validateVideoUrl(url) {
  try {
    if (!url) return false;

    const parsed = new URL(url);

    return (
      parsed.protocol.startsWith("http") &&
      parsed.hostname.includes(
        "tokyvideo.com"
      )
    );
  } catch {
    return false;
  }
}

module.exports = {
  validateVideoUrl,
};