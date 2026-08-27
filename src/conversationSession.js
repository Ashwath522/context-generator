/**
 * Single Responsibility: Manages ephemeral, single-conversation-only feedback adjustments that apply to one generation attempt.
 * Expected to be called from: src/generate.js, scripts/feedbackLoop.js
 */
const fs = require('fs');
const path = require('path');
const { generateText } = require('./llmClient');

const CONVERSATIONS_PATH = path.join(__dirname, '..', 'data', 'conversations.json');

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error(`Error parsing JSON in ${filePath}: ${e.message}`);
    }
    return fallback;
  }
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function startConversation({ conv_id, user, product_id, msg }) {
  const convs = loadJson(CONVERSATIONS_PATH, {});
  if (!convs[conv_id]) {
    convs[conv_id] = {
      user,
      product_id,
      original_msg: msg,
      created_at: new Date().toISOString(),
      turns: []
    };
    saveJson(CONVERSATIONS_PATH, convs);
  }
  return convs[conv_id];
}

async function addTurn({ conv_id, msg }) {
  const convs = loadJson(CONVERSATIONS_PATH, {});
  if (!convs[conv_id]) {
    throw new Error(`Conversation ${conv_id} does not exist. Call startConversation first.`);
  }

  const prompt = `Summarize this user request into one short, reusable instruction for modifying a product description. Be specific and actionable.
Return ONLY the instruction sentence, nothing else. This is for a one-off session adjustment, not a permanent rule.
User request: ${msg}`;

  const feedback = await generateText({ prompt });
  const turn = {
    msg,
    feedback: feedback.trim(),
    timestamp: new Date().toISOString()
  };

  convs[conv_id].turns.push(turn);
  saveJson(CONVERSATIONS_PATH, convs);
  return turn;
}

function getSessionAdjustments(conv_id) {
  const convs = loadJson(CONVERSATIONS_PATH, {});
  if (!convs[conv_id]) return [];
  return convs[conv_id].turns || [];
}

function applySessionAdjustments(conv_id, userPrompt) {
  const turns = getSessionAdjustments(conv_id);
  if (!turns || turns.length === 0) {
    return userPrompt;
  }

  let adjustedPrompt = userPrompt + '\n\nSESSION ADJUSTMENTS FOR THIS CONVERSATION ONLY — NOT A STANDING RULE:\n';
  adjustedPrompt += 'These apply only to this one regeneration. Do not treat them as permanent style guidance for this product or category.\n';
  
  turns.forEach((turn, index) => {
    adjustedPrompt += `${index + 1}. ${turn.feedback}\n`;
  });

  return adjustedPrompt;
}

module.exports = {
  startConversation,
  addTurn,
  getSessionAdjustments,
  applySessionAdjustments
};
