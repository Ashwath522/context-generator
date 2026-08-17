const fs = require('fs');
const path = require('path');
const { matchMaterial } = require('./careMatcher');
const { LLM_GENERATED_SCHEMA_SUBSET } = require('./schema');

const RULES_PATH = path.join(__dirname, '..', 'data', 'rules.json');

function loadRules() {
  try {
    return JSON.parse(fs.readFileSync(RULES_PATH, 'utf-8'));
  } catch (e) {
    return {};
  }
}

function computeTier(price, category, priceBands) {
  const bands = priceBands[category] || priceBands.Default;
  if (!bands || price === undefined || price === null) return 'Mid-Premium';
  if (price <= bands.good_max) return 'Good';
  if (price <= bands.mid_max) return 'Mid-Premium';
  return 'Premium';
}

const TIER_VOICE = {
  Good: 'practical, reliable, everyday language',
  'Mid-Premium': 'considered, elevated, refined (never say "luxury")',
  Premium: 'crafted, aspirational, understated confidence'
};

const SYSTEM_PROMPT_TEMPLATE = `You are a product content writer for a furniture and home goods retailer.
Write factual, warm, persuasive copy without ever sounding like a sales
pitch — no exclamation points, no unverifiable superlatives ("best",
"amazing", "guaranteed").

You will receive:
- Raw product data (may be sparse or messy)
- A pre-computed price tier label (internal use only — see rule below)
- A grounded reference list for care instructions (material-matched)
- Any known warranty facts

Return ONLY valid JSON matching this exact schema for the fields you are
asked to generate. No markdown fences, no commentary, no extra fields.

{{SCHEMA_SUBSET}}

RULES:
1. Never alter or contradict a factual value given in the source data
   (dimensions, material, weight) — these belong in specifications only
   and must never be rewritten there.
2. When paraphrasing facts into description prose, never copy source
   sentences verbatim — always restate naturally.
3. The price tier ({{TIER}}) must shape your WORD CHOICE only — {{TIER_VOICE}}.
   Never state the tier name, never mention price, never imply a numeric
   price range.
4. care_and_maintenance: select and politely rephrase ONLY from the
   provided reference list below. Do not invent instructions. Exactly 3
   instructions, exactly 2 avoid items, polite phrasing required
   ("We recommend...", "It's best to avoid...").
   Reference for "{{MATCHED_CATEGORY}}":
   Instructions: {{MATCHED_INSTRUCTIONS}}
   Avoid: {{MATCHED_AVOID}}
5. warranty: status_line is one sentence with **Yes**/**No** and
   **duration** in bold markdown. points: up to 4, only from real
   source-provided facts, never invented to pad the count.
6. If a fact is genuinely missing and must be inferred, use plain,
   non-committal language — never state an inferred detail with
   unwarranted confidence.

LEARNED PREFERENCES (feedback-derived rules):
{{LEARNED_RULES}}`;

function formatLearnedRules(rules, category) {
  const categoryRules = rules[category];
  if (!categoryRules || Object.keys(categoryRules).length === 0) {
    return '(none yet)';
  }
  return Object.entries(categoryRules)
    .map(([field, rule]) => `- [${field}] ${rule}`)
    .join('\n');
}

function buildPrompt(product, priceBands) {
  const rules = loadRules();
  const tier = computeTier(product.price, product.category, priceBands);
  const careMatch = matchMaterial(product.primary_material);

  const systemPrompt = SYSTEM_PROMPT_TEMPLATE
    .replace('{{SCHEMA_SUBSET}}', JSON.stringify(LLM_GENERATED_SCHEMA_SUBSET, null, 2))
    .replace('{{TIER}}', tier)
    .replace('{{TIER_VOICE}}', TIER_VOICE[tier])
    .replace('{{MATCHED_CATEGORY}}', careMatch.category)
    .replace('{{MATCHED_INSTRUCTIONS}}', JSON.stringify(careMatch.instructions))
    .replace('{{MATCHED_AVOID}}', JSON.stringify(careMatch.avoid))
    .replace('{{LEARNED_RULES}}', formatLearnedRules(rules, product.category));

  // Price is deliberately excluded from what the model sees. The tier is
  // computed above and passed in as a label only (via {{TIER}} in the
  // system prompt) — the model never receives the raw number, so there's
  // nothing for it to leak. This is a stronger guarantee than the output
  // regex check in validator.js, which is now a backstop, not the primary
  // control.
  const { price, ...productForPrompt } = product;
  const userPrompt = `PRODUCT INPUT:
Name: ${product.name}
Category: ${product.category}
Raw source data: ${JSON.stringify(productForPrompt, null, 2)}

Generate the requested fields now.`;

  return { systemPrompt, userPrompt, tier, careMatch };
}

module.exports = { buildPrompt, computeTier, loadRules };
