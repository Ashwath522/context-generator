const fs = require('fs');
const path = require('path');
const { generateOne } = require('../src/generate');
const { loadPriceBands } = require('../src/generate');
const { startConversation, addTurn } = require('../src/conversationSession');

async function countWords(text) {
  return text.trim().split(/\s+/).length;
}
function countSentences(text) {
  return text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
}

function normalize(v) {
  return String(v).trim().toLowerCase();
}

function includesNormalized(text, value) {
  return normalize(text).includes(normalize(value));
}

let retryCount = 0;
const originalWarn = console.warn;
console.warn = (...args) => {
  if (args[0] && args[0].includes('[retry]')) {
    retryCount++;
  }
  originalWarn(...args);
};

async function run() {
  const products = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/products.json'), 'utf-8'));
  const product = products[0];
  const priceBands = loadPriceBands();
  const conv_id = 'test_override_' + Date.now();
  
  // Extract siblings
  const siblingSizes = Array.isArray(product.available_sizes) 
    ? product.available_sizes.filter(s => normalize(s) !== normalize(product.seating_capacity))
    : [];
  const siblingColors = Array.isArray(product.available_colors)
    ? product.available_colors.filter(c => normalize(c) !== normalize(product.color_finish))
    : [];
  
  const allSiblings = [...siblingSizes, ...siblingColors];
  
  startConversation({ conv_id, user: 'test', product_id: product.id, msg: 'Initial' });
  
  console.log('Generating initial...');
  const res1 = await generateOne(product, priceBands, 1, conv_id);
  const text1 = res1.description.summary;
  const w1 = await countWords(text1);
  const s1 = countSentences(text1);
  
  retryCount = 0; // reset for shorter
  console.log('Generating shorter...');
  await addTurn({ conv_id, msg: 'make it noticeably shorter' });
  const res2 = await generateOne(product, priceBands, 1, conv_id);
  const text2 = res2.description.summary;
  const w2 = await countWords(text2);
  const s2 = countSentences(text2);
  const shorterRetries = retryCount;

  retryCount = 0; // reset for longer
  console.log('Generating longer...');
  await addTurn({ conv_id, msg: 'make it noticeably longer' });
  const res3 = await generateOne(product, priceBands, 1, conv_id);
  const text3 = res3.description.summary;
  const w3 = await countWords(text3);
  const s3 = countSentences(text3);
  const longerRetries = retryCount;

  console.log('\n--- SHORTER TEXT ---');
  console.log(text2);
  console.log('--- LONGER TEXT ---');
  console.log(text3);

  console.log('\n==============================');
  console.log('         RESULTS TABLE        ');
  console.log('==============================');
  console.log('| Turn    | Words | Sentences | Delta from Initial | Retries |');
  console.log('|---------|-------|-----------|--------------------|---------|');
  console.log(`| Initial | ${w1.toString().padEnd(5)} | ${s1.toString().padEnd(9)} | N/A                | -       |`);
  console.log(`| Shorter | ${w2.toString().padEnd(5)} | ${s2.toString().padEnd(9)} | ${((w2 - w1) / w1 * 100).toFixed(1)}%             | ${shorterRetries}       |`);
  console.log(`| Longer  | ${w3.toString().padEnd(5)} | ${s3.toString().padEnd(9)} | +${((w3 - w1) / w1 * 100).toFixed(1)}%            | ${longerRetries}       |`);
  console.log('==============================\n');
  
  if (process.env.MODE !== 'test') {
    let failed = false;
    
    // Check length changes
    if (w2 >= w1 * 0.75) {
      console.error('FAIL: Shorter is not at least 25% shorter.');
      failed = true;
    }
    if (w3 <= w1 * 1.25) {
      console.error('FAIL: Longer is not at least 25% longer.');
      failed = true;
    }

    // Check sibling mentions
    for (const sibling of allSiblings) {
      if (!includesNormalized(text2, sibling)) {
        console.error(`FAIL (Shorter): Missing sibling mention for "${sibling}"`);
        failed = true;
      }
      if (!includesNormalized(text3, sibling)) {
        console.error(`FAIL (Longer): Missing sibling mention for "${sibling}"`);
        failed = true;
      }
    }

    // Check retries
    if (shorterRetries > 0) {
      console.error(`FAIL: Shorter generation triggered ${shorterRetries} retries.`);
      failed = true;
    }
    if (longerRetries > 0) {
      console.error(`FAIL: Longer generation triggered ${longerRetries} retries.`);
      failed = true;
    }

    if (failed) {
      process.exit(1);
    } else {
      console.log('PASS: Length overrides work correctly and all sibling variants are mentioned with ZERO retries.');
    }
  } else {
    console.log('Test mode used. The lengths will not change as the mock is static.');
  }
}
run();
