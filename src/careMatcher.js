/**
 * Single Responsibility: Matches a raw material string to the appropriate care instructions.
 * Expected to be called from: src/promptBuilder.js
 */
const fs = require('fs');
const path = require('path');

const REFERENCE_PATH = path.join(__dirname, '..', 'data', 'material_care_reference.json');
const { getReference } = require('./retriever');

// Matches a product's primary_material against material_care_reference.json
// by keyword (e.g. "mango wood" -> "Wood"). Falls back to "General" with
// needs_review: true when nothing matches.
function matchMaterial(primaryMaterial) {
  const reference = getReference(REFERENCE_PATH);

  // If the reference dataset is too large, the retriever stub will return
  // null to indicate callers should use a proper RAG/retrieval approach.
  // Fall back to a safe 'General' match and flag for human review.
  if (!reference) {
    const general = { instructions: [], avoid: [] };
    return { category: 'General', instructions: general.instructions, avoid: general.avoid, needs_review: true };
  }

  if (!primaryMaterial) {
    const general = reference.General || { instructions: [], avoid: [] };
    return { category: 'General', instructions: general.instructions, avoid: general.avoid, needs_review: true };
  }

  const materialLower = String(primaryMaterial).toLowerCase();

  for (const [category, entry] of Object.entries(reference)) {
    if (category === 'General') continue;
    const keywords = entry.keywords || [];
    const matched = keywords.some((kw) => materialLower.includes(kw.toLowerCase()));
    if (matched) {
      return { category, instructions: entry.instructions, avoid: entry.avoid, needs_review: false };
    }
  }

  const general = reference.General || { instructions: [], avoid: [] };
  return { category: 'General', instructions: general.instructions, avoid: general.avoid, needs_review: true };
}

module.exports = { matchMaterial };
