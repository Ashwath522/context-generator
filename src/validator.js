const FORBIDDEN_TIER_WORDS = ['premium', 'mid-premium', 'value tier'];
const BARE_IMPERATIVE_RE = /^(wipe|do not|don't|clean|dry|avoid|use|apply|dust|store|keep|remove|scrub)\b/i;

function normalize(v) {
  return String(v).trim().toLowerCase();
}

function validateItem(item, sourceProduct) {
  const errors = [];

  const requiredTopLevel = ['description', 'specifications', 'care_and_maintenance', 'warranty', 'returns', 'quality_promise'];
  for (const key of requiredTopLevel) {
    if (!(key in item) || item[key] === undefined || item[key] === null) {
      errors.push(`Missing top-level field: ${key}`);
    }
  }

  if (item.description) {
    for (const field of ['summary', 'aesthetic_style', 'texture', 'best_use']) {
      if (!item.description[field]) errors.push(`Missing description.${field}`);
    }
  }

  // Factual consistency: specifications must match source exactly (post-normalization).
  if (item.specifications && sourceProduct) {
    for (const field of ['dimensions', 'primary_material', 'weight', 'assembly_required']) {
      const generated = item.specifications[field];
      const source = sourceProduct[field];
      if (generated !== undefined && source !== undefined && source !== null && source !== '') {
        if (normalize(generated) !== normalize(source)) {
          errors.push(`specifications.${field} does not match source data exactly`);
        }
      }
    }
  }

  // Field count checks
  if (item.care_and_maintenance) {
    const instructions = item.care_and_maintenance.instructions;
    const avoid = item.care_and_maintenance.avoid;
    if (!Array.isArray(instructions) || instructions.length !== 3) {
      errors.push('care_and_maintenance.instructions must have exactly 3 items');
    }
    if (!Array.isArray(avoid) || avoid.length !== 2) {
      errors.push('care_and_maintenance.avoid must have exactly 2 items');
    }
    for (const line of [...(instructions || []), ...(avoid || [])]) {
      if (typeof line === 'string' && BARE_IMPERATIVE_RE.test(line.trim())) {
        errors.push(`Polite-tone flag (bare imperative, human review can override): "${line}"`);
      }
    }
  } else {
    errors.push('Missing care_and_maintenance');
  }

  if (item.warranty) {
    if (Array.isArray(item.warranty.points) && item.warranty.points.length > 4) {
      errors.push('warranty.points must have at most 4 items');
    }
    if (!item.warranty.status_line || !/\*\*/.test(item.warranty.status_line)) {
      errors.push('warranty.status_line must be present and contain bold markdown (**)');
    }
  } else {
    errors.push('Missing warranty');
  }

  if (item.returns) {
    if (!Array.isArray(item.returns.condition) || item.returns.condition.length !== 3) {
      errors.push('returns.condition must have exactly 3 items');
    }
  } else {
    errors.push('Missing returns');
  }

  // Tier leakage check — description must never reveal the internal price tier.
  const descriptionText = item.description ? JSON.stringify(item.description).toLowerCase() : '';
  for (const word of FORBIDDEN_TIER_WORDS) {
    if (descriptionText.includes(word)) {
      errors.push(`Tier leakage: description contains forbidden word "${word}"`);
    }
  }
  if (/[₹$]\s?\d/.test(descriptionText) || /\bprice\b/i.test(descriptionText)) {
    errors.push('Tier leakage: description appears to reference a price figure');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = { validateItem };
