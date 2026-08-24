const fs = require('fs');
const { generateOne } = require('../src/generate');
const { loadPriceBands } = require('../src/generate');
const { cosineSimilarity } = require('../src/similarity');

function readStdin() {
  return fs.readFileSync(0, 'utf-8').trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [value];
}

function normalizeProductInput(input) {
  const products = asArray(input.products || input);
  const expanded = [];

  for (const product of products) {
    const variants = Array.isArray(product.variants) && product.variants.length
      ? product.variants
      : [null];

    for (const variant of variants) {
      const merged = variant ? { ...product, ...variant } : { ...product };
      delete merged.variants;
      merged.id = merged.id || `${String(merged.name || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${expanded.length + 1}`;
      expanded.push(merged);
    }
  }

  return expanded;
}

function existingDescription(product) {
  return product.existing_description ||
    product.existingDescription ||
    product.old_description ||
    product.description ||
    '';
}

(async () => {
  const raw = readStdin();
  if (!raw) {
    throw new Error('Paste a product JSON object or array into stdin.');
  }

  const input = JSON.parse(raw);
  const products = normalizeProductInput(input);
  const priceBands = loadPriceBands();
  const results = [];

  for (const product of products) {
    const oldDescription = existingDescription(product);
    const cleanProduct = { ...product };
    delete cleanProduct.existing_description;
    delete cleanProduct.existingDescription;
    delete cleanProduct.old_description;
    delete cleanProduct.description;

    const generated = await generateOne(cleanProduct, priceBands);
    const newSummary = generated.description?.summary || '';

    results.push({
      id: cleanProduct.id,
      selected_variant: {
        size: cleanProduct.seating_capacity || null,
        color_finish: cleanProduct.color_finish || null
      },
      similarity: {
        method: 'token_cosine',
        score: Number(cosineSimilarity(oldDescription, newSummary).toFixed(4)),
        percent: `${Math.round(cosineSimilarity(oldDescription, newSummary) * 100)}%`
      },
      old_description: oldDescription,
      updated: generated
    });
  }

  console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
