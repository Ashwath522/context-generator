// Interactive loop: generate a product, give feedback, regenerate, repeat.
// All feedback stays inside one conversation (data/conversations.json) —
// rules.json and promptBuilder.js's system prompt are never touched.
// Usage: node scripts/feedbackLoop.js <product_id>

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { regenerateInConversation, loadPriceBands } = require('../src/generate');
const { startConversation, addTurn } = require('../src/conversationSession');

const RULES_PATH = path.join(__dirname, '..', 'data', 'rules.json');
const PRODUCTS_PATH = path.join(__dirname, '..', 'data', 'products.json');

function readRulesSnapshot() {
  try {
    return fs.readFileSync(RULES_PATH, 'utf-8');
  } catch (e) {
    return null;
  }
}

function printSummary(item) {
  console.log('\n--- description.summary ---');
  console.log(item.description?.summary || '(none)');
  console.log('----------------------------\n');
  if (item._meta?.needs_review) {
    console.log(`[Validation Warning] Item flagged for review: ${item._meta.validation_errors?.join('; ') || 'unknown errors'}`);
  }
}

async function main() {
  const productId = process.argv[2];
  let products = [];
  try {
    products = JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf-8'));
  } catch (e) {
    console.error(`Error parsing JSON in ${PRODUCTS_PATH}: ${e.message}`);
    process.exit(1);
  }
  const product = productId ? products.find((p) => p.id === productId) : products[0];

  if (!product) {
    console.error(`No product found${productId ? ` with id "${productId}"` : ''}. Available ids: ${products.map((p) => p.id).join(', ')}`);
    process.exit(1);
  }

  const convId = `loop_${Date.now()}`;
  const priceBands = loadPriceBands();
  const rulesBefore = readRulesSnapshot();

  console.log(`Product: ${product.name} (${product.id})`);
  console.log(`Conversation: ${convId}\n`);
  console.log('Generating initial version...');

  startConversation({ conv_id: convId, user: 'cli-user', product_id: product.id, msg: 'generate a summary' });

  let item = await regenerateInConversation({ conv_id: convId, product, priceBands });
  printSummary(item);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const lineQueue = [];
  const waiters = [];
  let closed = false;
  rl.on('line', (line) => {
    if (waiters.length) waiters.shift()(line);
    else lineQueue.push(line);
  });
  rl.on('close', () => {
    closed = true;
    while (waiters.length) waiters.shift()(null);
  });
  const nextLine = () => {
    if (lineQueue.length) return Promise.resolve(lineQueue.shift());
    if (closed) return Promise.resolve(null);
    return new Promise((resolve) => waiters.push(resolve));
  };

  while (true) {
    process.stdout.write('Feedback (or "exit" to stop): ');
    const raw = await nextLine();
    if (raw === null) {
      console.log('\n(stdin closed — ending session)');
      break;
    }
    const feedback = raw.trim();
    if (feedback.toLowerCase() === 'exit') break;
    if (!feedback) continue;

    await addTurn({ conv_id: convId, msg: feedback });
    console.log('Regenerating with this conversation\'s adjustments applied...');
    item = await regenerateInConversation({ conv_id: convId, product, priceBands });
    printSummary(item);
  }

  rl.close();

  const rulesAfter = readRulesSnapshot();
  console.log('=== Session ended ===');
  console.log(`rules.json unchanged: ${rulesBefore === rulesAfter ? 'YES (correct)' : 'NO — LEAK DETECTED, investigate immediately'}`);

  let conversations = {};
  const convPath = path.join(__dirname, '..', 'data', 'conversations.json');
  try {
    conversations = JSON.parse(fs.readFileSync(convPath, 'utf-8'));
  } catch (e) {
    console.error(`Error parsing JSON in ${convPath}: ${e.message}`);
  }
  console.log(`Turns logged in this conversation: ${conversations[convId].turns.length}`);
  console.log('Final item:');
  console.log(JSON.stringify(item, null, 2));
}

main().catch((err) => {
  console.error('Loop failed:', err);
  process.exit(1);
});
