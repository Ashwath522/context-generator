const fs = require('fs');
const path = require('path');
const { generateContent } = require('./llmClient');
const { buildPrompt } = require('./promptBuilder');
const { getReturnsBlock } = require('./returnsLookup');
const { buildQualityPromise } = require('./qualityComposer');
const { validateItem } = require('./validator');
const { PLACEHOLDER_LINKS } = require('./schema');

const PRICE_BANDS_PATH = path.join(__dirname, '..', 'data', 'price_bands.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'output', 'generated');

function loadPriceBands() {
  try {
    return JSON.parse(fs.readFileSync(PRICE_BANDS_PATH, 'utf-8'));
  } catch (e) {
    return { Default: { good_max: 5000, mid_max: 20000 } };
  }
}

async function generateOne(product, priceBands, attempt = 1) {
  const { systemPrompt, userPrompt, careMatch } = buildPrompt(product, priceBands);

  const llmOutput = await generateContent({ systemPrompt, userPrompt });

  // specifications: passed through unchanged, never generated. Missing
  // values are left out rather than invented.
  const specifications = {};
  for (const field of ['dimensions', 'primary_material', 'weight', 'assembly_required']) {
    if (product[field] !== undefined && product[field] !== null && product[field] !== '') {
      specifications[field] = product[field];
    }
  }

  // returns: pure lookup, LLM never touches this field.
  const returns = getReturnsBlock(product.category);

  const applicable = llmOutput.warranty?.applicable ?? Boolean(product.warranty_months);
  const warranty = {
    applicable,
    duration_months: applicable ? (product.warranty_months || null) : null,
    status_line: llmOutput.warranty?.status_line || '',
    points: (llmOutput.warranty?.points || []).slice(0, 4),
    link: PLACEHOLDER_LINKS.warranty
  };

  // quality_promise: mostly rules-composed, never invented perks.
  const qualityPromise = buildQualityPromise(product.category, warranty, specifications);

  const item = {
    description: llmOutput.description,
    specifications,
    care_and_maintenance: llmOutput.care_and_maintenance,
    warranty,
    returns,
    quality_promise: qualityPromise,
    _meta: {
      needs_review: careMatch.needs_review || false,
      care_category_matched: careMatch.category
    }
  };

  const result = validateItem(item, product);

  if (!result.valid && attempt < 2) {
    return generateOne(product, priceBands, attempt + 1);
  }

  if (!result.valid) {
    item._meta.needs_review = true;
    item._meta.validation_errors = result.errors;
  }

  return item;
}

async function generateBatch(products) {
  const priceBands = loadPriceBands();
  const results = [];

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const product of products) {
    try {
      const item = await generateOne(product, priceBands);
      const outPath = path.join(OUTPUT_DIR, `${product.id}.json`);
      fs.writeFileSync(outPath, JSON.stringify(item, null, 2));
      results.push({ id: product.id, status: item._meta.needs_review ? 'needs_review' : 'ok', item });
    } catch (err) {
      results.push({ id: product.id, status: 'error', error: err.message });
    }
  }

  return results;
}

module.exports = { generateOne, generateBatch };

if (require.main === module) {
  const productsPath = path.join(__dirname, '..', 'data', 'products.json');
  const products = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));

  generateBatch(products)
    .then((results) => {
      const ok = results.filter((r) => r.status === 'ok').length;
      const review = results.filter((r) => r.status === 'needs_review').length;
      const errored = results.filter((r) => r.status === 'error').length;
      console.log(`Generated ${results.length} items -> ${ok} ok, ${review} need review, ${errored} errored.`);
      console.log(`Output written to ${OUTPUT_DIR}`);
    })
    .catch((err) => {
      console.error('Batch generation failed:', err);
      process.exit(1);
    });
}
