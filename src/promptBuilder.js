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
1. description:
   - summary: 3-4 sentences, warm and inviting.
   - Priority order when source supports it:
     1) Core function (e.g. extendable seating, capacity change)
     2) Hosting / everyday use warmth (family dinners, gatherings)
     3) Finish + easy care
   - Numbers stay as digits (4 not four).
   - Never invent facts. Reusing a short source phrase is fine when it
     is the clearest way to state an important fact.
   - Never mention price, tier, or premium/value labels.
   - aesthetic_style, texture, best_use: one line each, grounded in
     source facts, warm tone.
2. specifications: NOT GENERATED. Will be copied from source exactly
   (dimensions, primary_material, weight, assembly_required). Do NOT
   generate or rewrite these fields—they are already provided.
3. Never alter or contradict a factual value given in the source data
   (dimensions, material, weight) — these belong in specifications only
   and must never be rewritten in description.
4. Every fact you mention from the source data must actually be present
   in the source data — never invent details. Reusing a short phrase or
   sentence from the source is fine when it's the clearest way to state
   an important fact; the priority is that required facts are present
   and the format rules below are followed, not avoiding all repetition.
5. NUMBERS STAY AS DIGITS. Any numeric spec you reference in prose
   (dimensions, thickness, seating capacity, counts, sizes, etc.) must
   be written the same way the source gives it — digits, not spelled-out
   words. Write "4 Inches" / "4-seater" / "78 x 60 in", never "four
   inches" / "four-seater". This applies everywhere in the description,
   not just in specifications.
6. The price tier ({{TIER}}) must shape your WORD CHOICE only — {{TIER_VOICE}}.
   Never state the tier name, never mention price, never imply a numeric
   price range.
7. care_and_maintenance: select and politely rephrase ONLY from the
   provided reference list below. Do not invent instructions. Exactly 3
   instructions, exactly 2 avoid items, polite phrasing required
   ("We recommend...", "It's best to avoid...").
   Reference for "{{MATCHED_CATEGORY}}":
   Instructions: {{MATCHED_INSTRUCTIONS}}
   Avoid: {{MATCHED_AVOID}}
8. warranty:
   - status_line: exactly 1 sentence, formatted EXACTLY like this template —
     both the Yes/No AND the duration must each be individually wrapped in
     ** **, like this real example:
     "**Yes**, this product includes a **12 months** warranty against manufacturing defects."
     (or "**No**, this product does not carry a manufacturer warranty." when
     not applicable). Do not drop the bold Yes/No — it is required in every
     status_line, not optional.
   - points: aim for 3 items when source facts allow:
       • 2 lines describing what IS covered (includes)
       • 1 line describing what is NOT covered (excludes)
     If the source only has include facts → write 2 include points.
     If the source only has exclude facts → write 2 exclude points.
     If the source only has a duration and no coverage details → write
     exactly 2 short points that restate duration coverage and that
     standard terms apply (do not invent specific defects or exclusions).
   - Never invent covered defects, parts, or exclusions not present in
     the source data.
   - Do not generate the link field.
9. If a fact is genuinely missing and must be inferred, use plain,
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

  // Note: raw price is included here only so the model has context for
  // tone (rule 3 forbids it leaking into output — enforced in validator.js).
  const userPrompt = `PRODUCT INPUT:
Name: ${product.name}
Category: ${product.category}
Raw source data: ${JSON.stringify(product, null, 2)}

Generate the requested fields now.`;

  return { systemPrompt, userPrompt, tier, careMatch };
}

module.exports = { buildPrompt, computeTier, loadRules };