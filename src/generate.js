/**
 * Single Responsibility: Orchestrates the generation of the final product content, assembling specs, generated prose, and deterministic rules.
 * Expected to be called from: CLI scripts (e.g. scripts/feedbackLoop.js, scripts/generateFromPaste.js, test/runTest.js).
 */
const fs = require('fs');
const path = require('path');
const { generateContent } = require('./llmClient');
const { buildPrompt } = require('./promptBuilder');
const { applySessionAdjustments, getSessionAdjustments } = require('./conversationSession');
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
    if (e.code !== 'ENOENT') {
      console.error(`Error parsing JSON in ${PRICE_BANDS_PATH}: ${e.message}`);
    }
    return { Default: { good_max: 5000, mid_max: 20000 } };
  }
}

async function generateOne(product, priceBands, attempt = 1, conv_id = null) {
  let relaxLengthCheck = false;
  let lengthDirection = null;

  if (conv_id) {
    const turns = getSessionAdjustments(conv_id);
    if (turns.length > 0) {
      const latestTurn = turns[turns.length - 1];
      if (/\b(short|brief|concis)/i.test(latestTurn.msg)) {
        relaxLengthCheck = true;
        lengthDirection = 'shorter';
      } else if (/\b(long|length|detail)/i.test(latestTurn.msg)) {
        relaxLengthCheck = true;
        lengthDirection = 'longer';
      }
    }
  }

  const { systemPrompt, userPrompt, careMatch } = buildPrompt(product, priceBands, lengthDirection);

  const finalUserPrompt = conv_id
    ? applySessionAdjustments(conv_id, userPrompt)
    : userPrompt;

  const llmOutput = await generateContent({ systemPrompt, userPrompt: finalUserPrompt });

  // specifications: passed through unchanged, never generated. Missing
  // values are left out rather than invented.
  const specifications = {};
  for (const field of ['dimensions', 'primary_material', 'weight', 'assembly_required', 'seating_capacity', 'color_finish']) {
    if (product[field] !== undefined && product[field] !== null && product[field] !== '') {
      specifications[field] = product[field];
    }
  }

  function generateBulletList(prod) {
    const bullets = [];
    const axes = prod.variant_axes || {};
    
    if (Array.isArray(axes.size) && axes.size.length > 0) {
      bullets.push(`Available in ${axes.size.join(' and ')} sizes to suit different spaces.`);
    }
    
    if (prod.mattress_recommendation) {
      if (prod.mattress_recommendation.size) {
        bullets.push(`Recommended mattress sizes: ${prod.mattress_recommendation.size}.`);
      }
      if (prod.mattress_recommendation.thickness_range) {
        bullets.push(`Recommended mattress thickness: ${prod.mattress_recommendation.thickness_range}.`);
      }
    }
    
    if (Array.isArray(axes.storage_type) && axes.storage_type.length > 0) {
      bullets.push(`Storage options: ${axes.storage_type.join(', ')}.`);
    }
    
    if (Array.isArray(axes.finish) && axes.finish.length > 0) {
      bullets.push(`Finish options: ${axes.finish.join(' and ')}.`);
    }
    
    if (Array.isArray(axes.colour) && axes.colour.length > 0) {
      bullets.push(`Colour options: ${axes.colour.join(', ')}.`);
    }
    
    return bullets;
  }

  llmOutput.description.key_features = generateBulletList(product);



  // returns: pure lookup, LLM never touches this field.
  const returns = getReturnsBlock(product.category);

  const applicable = llmOutput.warranty?.applicable ?? Boolean(product.warranty_months);
  const warranty = {
    applicable,
    duration_months: applicable ? (product.warranty_months || null) : null,
    status_line: `**${applicable ? 'Yes' : 'No'}**, it has a warranty of **${applicable ? (product.warranty_months || 0) : 0} months**.`,
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

  const result = validateItem(item, product, { relaxLengthCheck });

  if (!result.valid && attempt < 2) {
    console.warn(`[retry] product ${product.id} failed validation, retrying (this doubles the API call for this turn): ${result.errors.join('; ')}`);
    return generateOne(product, priceBands, attempt + 1, conv_id);
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
    const delayStr = process.env.GENERATE_DELAY_MS;
    const delayMs = delayStr !== undefined ? parseInt(delayStr, 10) : 15000;
    await new Promise(r => setTimeout(r, delayMs));
  }

  return results;
}

function regenerateInConversation({ conv_id, product, priceBands }) {
  return generateOne(product, priceBands, 1, conv_id);
}

module.exports = { generateOne, generateBatch, loadPriceBands, regenerateInConversation };

if (require.main === module) {
  const productsPath = path.join(__dirname, '..', 'data', 'products.json');
  let products = [];
  try {
    products = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));
  } catch (e) {
    console.error(`Error parsing JSON in ${productsPath}: ${e.message}`);
    process.exit(1);
  }

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
