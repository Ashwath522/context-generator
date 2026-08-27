process.env.MODE = 'test';

const fs = require('fs');
const path = require('path');
const {
  startConversation,
  addTurn,
  getSessionAdjustments
} = require('../src/conversationSession');
const { regenerateInConversation, loadPriceBands } = require('../src/generate');

const RULES_PATH = path.join(__dirname, '..', 'data', 'rules.json');
const CONVERSATIONS_PATH = path.join(__dirname, '..', 'data', 'conversations.json');
const PRODUCTS_PATH = path.join(__dirname, '..', 'data', 'products.json');

async function runTest() {
  console.log('--- Starting testConversationSession ---');

  const rulesBefore = fs.readFileSync(RULES_PATH, 'utf-8');

  const conv_id = 'test_conv_123';
  startConversation({
    conv_id,
    user: 'test_user',
    product_id: 'test_product',
    msg: 'Hello'
  });
  console.log('1. startConversation called');

  await addTurn({ conv_id, msg: 'make it short' });
  await addTurn({ conv_id, msg: 'make it long' });
  console.log('2. addTurn called twice');

  const adjustments = getSessionAdjustments(conv_id);
  console.log('3. Session adjustments:');
  console.log(JSON.stringify(adjustments, null, 2));

  const products = JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf-8'));
  const product = products[0];
  const priceBands = loadPriceBands();
  
  console.log('4. Regenerating product with conv_id...');
  const item = await regenerateInConversation({ conv_id, product, priceBands });
  console.log('Generated description summary:');
  console.log(item.description.summary);

  const rulesAfter = fs.readFileSync(RULES_PATH, 'utf-8');
  if (rulesBefore === rulesAfter) {
    console.log('\nPASS: rules.json is byte-for-byte unchanged.');
  } else {
    console.log('\nFAIL: rules.json was modified.');
  }
}

runTest().catch(err => {
  console.error('Test failed:', err);
});
