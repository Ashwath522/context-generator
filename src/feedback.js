/**
 * Single Responsibility: Manages permanent, cross-product learned rules based on user feedback.
 * Expected to be called from: external feedback ingestion tools (not directly from generate/promptBuilder loops).
 */
// Feedback loop = prompt-injection of accumulated rules, NOT fine-tuning.
// The model never changes; what changes is what gets prepended to the
// system prompt (via promptBuilder.js -> rules.json) on every future call.

const fs = require('fs');
const path = require('path');
const { generateText } = require('./llmClient');

const FEEDBACK_LOG_PATH = path.join(__dirname, '..', 'data', 'feedback_log.json');
const RULES_PATH = path.join(__dirname, '..', 'data', 'rules.json');
const MAX_VARIANTS_BEFORE_CONSOLIDATION = 5;

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

// Step 1: capture raw feedback into the permanent audit trail.
// This file is never pruned or summarized away.
function logFeedback({ product_id, category, field, original_output, feedback_text }) {
  const log = loadJson(FEEDBACK_LOG_PATH, []);
  const entry = {
    id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    product_id,
    category,
    field,
    original_output,
    feedback_text,
    timestamp: new Date().toISOString()
  };
  log.push(entry);
  saveJson(FEEDBACK_LOG_PATH, log);
  return entry;
}

// Step 2: a SEPARATE, small LLM call whose only job is compression —
// turns raw feedback text into one short, reusable instruction.
async function compressFeedbackToRule(feedbackText, category, field) {
  const prompt = `Summarize this feedback into one short, reusable instruction for
future content generation in this category. Be specific and actionable.
Return ONLY the instruction sentence, nothing else.

Category: ${category}
Field: ${field}
Feedback: ${feedbackText}`;

  const text = await generateText({ prompt });
  return text.trim();
}

// Step 3 happens in promptBuilder.js, which reads rules.json on every call.
// Here we just write to it. New feedback for the same category+field
// OVERWRITES the existing rule by default. Pass `variant` (any string,
// e.g. a short slug) when the new feedback is clearly a different concern
// from what's already stored, so it's kept as a separate keyed entry
// instead of clobbering the old one.
function upsertRule(category, field, rule, variant) {
  const rules = loadJson(RULES_PATH, {});
  if (!rules[category]) rules[category] = {};

  const key = variant ? `${field}__${variant}` : field;
  rules[category][key] = rule;

  saveJson(RULES_PATH, rules);
  return rules;
}

// Step 4: growth management. If a category+field has accumulated more
// than MAX_VARIANTS_BEFORE_CONSOLIDATION keyed variants, merge them into
// 2-3 combined, non-redundant instructions and replace the list.
async function consolidateIfNeeded(category, field) {
  const rules = loadJson(RULES_PATH, {});
  const categoryRules = rules[category] || {};
  const variantKeys = Object.keys(categoryRules).filter((k) => k === field || k.startsWith(`${field}__`));

  if (variantKeys.length <= MAX_VARIANTS_BEFORE_CONSOLIDATION) {
    return rules;
  }

  const combinedText = variantKeys.map((k) => `- ${categoryRules[k]}`).join('\n');
  const prompt = `Merge these ${variantKeys.length} rules into 2-3 combined,
non-redundant instructions for "${field}" content in the "${category}" category.
Return them as a single short paragraph.

Rules:
${combinedText}`;

  const merged = await generateText({ prompt });

  for (const k of variantKeys) {
    delete categoryRules[k];
  }
  categoryRules[field] = merged.trim();
  rules[category] = categoryRules;

  saveJson(RULES_PATH, rules);
  return rules;
}

// End-to-end convenience wrapper: log -> compress -> upsert -> consolidate.
async function captureFeedback({ product_id, category, field, original_output, feedback_text, variant }) {
  const entry = logFeedback({ product_id, category, field, original_output, feedback_text });
  const rule = await compressFeedbackToRule(feedback_text, category, field);
  upsertRule(category, field, rule, variant);
  await consolidateIfNeeded(category, field);
  return { entry, rule };
}

module.exports = { captureFeedback, logFeedback, compressFeedbackToRule, upsertRule, consolidateIfNeeded };
