const fs = require('fs');

// Simple retrieval stub. If the reference file has a small number of
// entries we load it entirely; if it grows beyond a safe threshold this
// stub returns null to signal that a proper retrieval/RAG solution should
// be used instead of loading the whole file into memory.

const ENTRY_THRESHOLD = 30;

function getReference(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const count = Object.keys(parsed).length;
    if (count > ENTRY_THRESHOLD) {
      // Signal to callers that retrieval should be used instead.
      return null;
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

module.exports = { getReference };
