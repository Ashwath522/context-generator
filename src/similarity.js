function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function termFrequency(tokens) {
  const counts = new Map();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) || 0) + 1);
  }
  return counts;
}

function cosineSimilarity(a, b) {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (!aTokens.length || !bTokens.length) return 0;

  const aCounts = termFrequency(aTokens);
  const bCounts = termFrequency(bTokens);
  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;

  for (const count of aCounts.values()) {
    aMagnitude += count * count;
  }
  for (const count of bCounts.values()) {
    bMagnitude += count * count;
  }
  for (const [token, count] of aCounts.entries()) {
    dot += count * (bCounts.get(token) || 0);
  }

  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}

module.exports = { cosineSimilarity };
