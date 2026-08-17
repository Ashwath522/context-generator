// Runs generate.js fully in mock mode against sampleProducts.json —
// zero API cost, zero network calls. Prints a pass/fail summary from
// validator.js for each item.

process.env.MODE = 'test';

const fs = require('fs');
const path = require('path');
const { generateBatch } = require('../src/generate');

const sampleProducts = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'sampleProducts.json'), 'utf-8')
);

(async () => {
  console.log(`Running mock generation for ${sampleProducts.length} sample products...\n`);

  const results = await generateBatch(sampleProducts);

  let passCount = 0;
  let reviewCount = 0;
  let errorCount = 0;

  for (const result of results) {
    if (result.status === 'ok') {
      console.log(`PASS    ${result.id}`);
      passCount++;
    } else if (result.status === 'needs_review') {
      const reasons = result.item._meta.validation_errors
        ? result.item._meta.validation_errors.join('; ')
        : `care category "${result.item._meta.care_category_matched}" fell back to General`;
      console.log(`REVIEW  ${result.id} — ${reasons}`);
      reviewCount++;
    } else {
      console.log(`ERROR   ${result.id} — ${result.error}`);
      errorCount++;
    }
  }

  console.log(`\nSummary: ${passCount} passed, ${reviewCount} need review, ${errorCount} errored (of ${results.length}).`);
  console.log('Output files written to output/generated/');
  process.exit(errorCount > 0 ? 1 : 0);
})();
