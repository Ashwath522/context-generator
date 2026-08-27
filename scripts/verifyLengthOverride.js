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

async function run() {
  const products = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/products.json'), 'utf-8'));
  const product = products[0];
  const priceBands = loadPriceBands();
  const conv_id = 'test_override_' + Date.now();
  
  startConversation({ conv_id, user: 'test', product_id: product.id, msg: 'Initial' });
  
  console.log('Generating initial...');
  const res1 = await generateOne(product, priceBands, 1, conv_id);
  const text1 = res1.description.summary;
  const w1 = await countWords(text1);
  const s1 = countSentences(text1);
  
  console.log('Generating shorter...');
  await addTurn({ conv_id, msg: 'make it noticeably shorter' });
  const res2 = await generateOne(product, priceBands, 1, conv_id);
  const text2 = res2.description.summary;
  const w2 = await countWords(text2);
  const s2 = countSentences(text2);

  console.log('Generating longer...');
  await addTurn({ conv_id, msg: 'make it noticeably longer' });
  const res3 = await generateOne(product, priceBands, 1, conv_id);
  const text3 = res3.description.summary;
  const w3 = await countWords(text3);
  const s3 = countSentences(text3);

  console.log('\n--- SHORTER TEXT ---');
  console.log(text2);
  console.log('--- LONGER TEXT ---');
  console.log(text3);

  console.log('\n==============================');
  console.log('         RESULTS TABLE        ');
  console.log('==============================');
  console.log('| Turn    | Words | Sentences | Delta from Initial |');
  console.log('|---------|-------|-----------|--------------------|');
  console.log(`| Initial | ${w1.toString().padEnd(5)} | ${s1.toString().padEnd(9)} | N/A                |`);
  console.log(`| Shorter | ${w2.toString().padEnd(5)} | ${s2.toString().padEnd(9)} | ${((w2 - w1) / w1 * 100).toFixed(1)}%             |`);
  console.log(`| Longer  | ${w3.toString().padEnd(5)} | ${s3.toString().padEnd(9)} | +${((w3 - w1) / w1 * 100).toFixed(1)}%            |`);
  console.log('==============================\n');
  
  if (process.env.MODE !== 'test') {
    if (w2 >= w1 * 0.75) {
      console.error('FAIL: Shorter is not at least 25% shorter.');
      process.exit(1);
    }
    if (w3 <= w1 * 1.25) {
      console.error('FAIL: Longer is not at least 25% longer.');
      process.exit(1);
    }
    console.log('PASS: Length overrides work correctly.');
  } else {
    console.log('Test mode used. The lengths will not change as the mock is static.');
  }
}
run();
