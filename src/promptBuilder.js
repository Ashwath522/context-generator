/**
 * Single Responsibility: Constructs the detailed prompt for the LLM based on product data, price bands, and learned rules.
 * Expected to be called from: src/generate.js
 */
const fs = require('fs');
const path = require('path');
const { matchMaterial } = require('./careMatcher');
const { LLM_GENERATED_SCHEMA_SUBSET } = require('./schema');

const RULES_PATH = path.join(__dirname, '..', 'data', 'rules.json');

function loadRules() {
  try {
    return JSON.parse(fs.readFileSync(RULES_PATH, 'utf-8'));
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error(`Error parsing JSON in ${RULES_PATH}: ${e.message}`);
    }
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
Write factual, warm, purchase-driving copy that helps a shopper imagine
the product in their home. The tone should feel desirable and confident,
but never loud or fake — no exclamation points, no unverifiable
superlatives ("best", "amazing", "guaranteed").

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
2. Every fact you mention from the source data must actually be present
   in the source data — never invent details. Reusing a short phrase or
   sentence from the source is fine when it's the clearest way to state
   an important fact; the priority is that required facts are present
   and the format rules below are followed, not avoiding all repetition.
3. NUMBERS STAY AS DIGITS. Any numeric spec you reference in prose
   (dimensions, thickness, seating capacity, counts, sizes, etc.) must
   be written the same way the source gives it — digits, not spelled-out
   words. Write "4 Inches" / "4-seater" / "78 x 60 in", never "four
   inches" / "four-seater". This applies everywhere in the description,
   not just in specifications.
4. The price tier ({{TIER}}) must shape your WORD CHOICE only — {{TIER_VOICE}}.
   Never state the tier name, never mention price, never imply a numeric
   price range.
5. care_and_maintenance: select and politely rephrase ONLY from the
   provided reference list below. Do not invent instructions. Exactly 3
   instructions, exactly 2 avoid items, polite phrasing required
   ("We recommend...", "It's best to avoid...").
   Reference for "{{MATCHED_CATEGORY}}":
   Instructions: {{MATCHED_INSTRUCTIONS}}
   Avoid: {{MATCHED_AVOID}}
6. WARRANTY FORMAT — must match this EXACTLY or it fails validation.
   status_line is one sentence containing BOTH of these bolded spans,
   with nothing else inside either pair of asterisks:
     - **Yes** or **No**
     - **N months** — digits, a space, then the literal word "months"
       (e.g. **12 months** — never **12-month**, never **twelve months**,
       never wrap other words inside the same bold span).
   Required phrasing when warranty applies:
   "**Yes**, it has a warranty of **N months**."
   Required phrasing when warranty does not apply:
   "**No**, it has a warranty of **0 months**."
   points: up to 4, only from real source-provided facts, never invented
   to pad the count.
7. If a fact is genuinely missing and must be inferred, use plain,
   non-committal language — never state an inferred detail with
   unwarranted confidence.
8. NO REPETITION ACROSS DESCRIPTION FIELDS. summary, aesthetic_style,
   texture, and best_use each cover a DIFFERENT angle — do not restate
   the same fact, adjective, or phrase in more than one of them:
     - summary: the overall pitch — what it is, its key facts, why it
       matters. This is the only field that should mention specs like
       seating capacity, material, or finish in sentence form.
     - aesthetic_style: visual/style adjectives ONLY (e.g. "modern",
       "minimalist") — no material, finish, or usage facts here.
     - texture: tactile/sensory impression ONLY (how it feels to the
       touch) — no style or usage facts here.
     - best_use: where/how/who it's for ONLY — no material or style
       facts here.
   If you find yourself repeating a word like "sleek", "smooth", or the
   finish/material name across two fields, rewrite one of them.
9. VARIANT GROUNDING. If the source data specifies a particular variant
   this product represents — e.g. a seating capacity ({{VARIANT_SEATING}})
   or a color/finish ({{VARIANT_COLOR}}) — the description must reflect
   THAT exact variant only. Never mention other sizes, seat counts, or
   colors that are not this specific variant, EXCEPT where rule 10
   explicitly allows naming sibling variants that were given to you.
10. SUMMARY STRUCTURE — one idea per sentence, in this exact order, and
    NEVER include the raw L x W x H / m / cm dimension string anywhere
    in summary — that lives only in specifications. The sentence count
    is NOT fixed — it depends on which variant facts this product
    actually has:
      Sentence 1 — OVERVIEW (always present): what the product is, its
        main functional or aesthetic promise, and one concrete usage
        benefit. Do not mention size or color here.
      Sentence 2 — FEEL (always present): the tactile/texture impression
        of the primary material paired with one style/finish-level
        visual impression, ending in a short emotional or functional
        payoff. Do not mention size or color by name here — texture and
        style words only.
      Sentence 3 — SIZE (ONLY if a size/seating/capacity variant field
        is given in PRODUCT INPUT — omit this sentence entirely if none
        was given, do not invent a substitute or talk about dimensions
        instead):
        "This is the {size} size, {one short shopper-benefit clause tied
        to this specific size}, and it is also available in {sibling
        sizes, comma-separated}."
        Drop the "and it is also available in..." clause if no sibling
        sizes were listed.
      Sentence 4 — FINISH (ONLY if a color/finish variant field is given
        — omit entirely if none was given, do not invent a substitute):
        "This is the {color/finish} finish, which {reason}, and it is
        also available in {sibling colors, comma-separated}, making it
        a confident choice for {one short closing benefit}."
        For {reason}: if PRODUCT INPUT supplies an explicit reason for
        this color/finish, use that reason (lightly reworded is fine,
        inventing a different one is not). If no reason was supplied,
        compose a brief, plausible one grounded only in the finish name
        itself — never invent a technical property to justify it.
        Drop the "and it is also available in..." clause if no sibling
        colors were listed.
    A product with both a size and a color variant produces 4 sentences
    total. A product with only one of the two produces 3. A product with
    neither produces 2. Never pad with an extra sentence to hit a target
    count, and never fold two of these ideas into one sentence.

    EXAMPLE (for calibration only — do not reuse this wording for other
    products):
    "The Caribu dining table brings a clean, polished aesthetic to the
    dining area, with an extendable design that makes the room feel
    ready for both everyday meals and planned hosting. Its glass surface
    gives a smooth tactile feel, while the refined high-gloss impression
    helps the table look composed without making the space feel heavy.
    This is the 6 to 8 Extendable size, giving shoppers a flexible fit
    for daily use and guest seating, and it is also available in 4 to 6
    Extendable. This is the White Ceramic finish, which keeps compact
    dining corners feeling open, and it is also available in Black
    Marble High Gloss, White High Gloss, White Marble High Gloss, making
    it a confident choice for a home that needs style and practical
    adaptability."

   None of these facts may be repeated in aesthetic_style, texture, or
   best_use (see rule 8) — summary is the only field that states them.

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

function buildPrompt(product, priceBands, lengthDirection = null) {
  const rules = loadRules();
  const tier = computeTier(product.price, product.category, priceBands);
  const careMatch = matchMaterial(product.primary_material);

  const variantSeating = product.seating_capacity || '(not specified)';
  const variantColor = product.color_finish || '(not specified)';

  let schemaSubset = JSON.parse(JSON.stringify(LLM_GENERATED_SCHEMA_SUBSET));
  if (lengthDirection) {
    const words = lengthDirection === 'shorter' ? '40-60' : '150-180';
    const sentences = lengthDirection === 'shorter' ? '2' : '6-8';
    schemaSubset.description.summary = `CRITICAL OVERRIDE: Exactly ${sentences} sentences, ${words} words. The user requested this length.`;
  }

  let systemPrompt = SYSTEM_PROMPT_TEMPLATE
    .replace('{{SCHEMA_SUBSET}}', JSON.stringify(schemaSubset, null, 2))
    .replace('{{TIER}}', tier)
    .replace('{{TIER_VOICE}}', TIER_VOICE[tier])
    .replace('{{MATCHED_CATEGORY}}', careMatch.category)
    .replace('{{MATCHED_INSTRUCTIONS}}', JSON.stringify(careMatch.instructions))
    .replace('{{MATCHED_AVOID}}', JSON.stringify(careMatch.avoid))
    .replace('{{VARIANT_SEATING}}', variantSeating)
    .replace('{{VARIANT_COLOR}}', variantColor)
    .replace('{{LEARNED_RULES}}', formatLearnedRules(rules, product.category));

  if (lengthDirection) {
    const words = lengthDirection === 'shorter' ? '40-60' : '150-180';
    const sentences = lengthDirection === 'shorter' ? '2' : '6-8';
    
    const parts = systemPrompt.split('10. SUMMARY STRUCTURE');
    if (parts.length === 2) {
      const subParts = parts[1].split('LEARNED PREFERENCES');
      if (subParts.length === 2) {
        const replacement = `10. SUMMARY STRUCTURE - CRITICAL LENGTH OVERRIDE:
    You MUST write EXACTLY ${sentences} sentences and target ${words} words for the \`description.summary\`.
    The user explicitly demanded a ${lengthDirection.toUpperCase()} summary.
    If you output the standard 4 sentences, you will fail the user's explicit command.
    How to do this: Combine or expand the overview, texture, size, and finish details so that they fit perfectly into EXACTLY ${sentences} sentences. Do not omit the size or finish, just weave them together.\n\n`;
        systemPrompt = parts[0] + replacement + 'LEARNED PREFERENCES' + subParts[1];
      }
    }
  }

  // Note: raw price is included here only so the model has context for
  // tone (rule 4 forbids it leaking into output — enforced in validator.js).
  const variantLines = [];
  if (product.seating_capacity) variantLines.push(`Primary size/seating variant (THIS product): ${product.seating_capacity}`);
  if (product.color_finish) variantLines.push(`Color / finish (THIS product): ${product.color_finish}`);
  if (product.color_reason) variantLines.push(`Reason this color/finish suits a shopper (use this, don't invent a different one): ${product.color_reason}`);
  if (Array.isArray(product.available_sizes) && product.available_sizes.length) {
    const others = product.available_sizes.filter((s) => s !== product.seating_capacity);
    if (others.length) variantLines.push(`Also available in these sizes: ${others.join(', ')}`);
  }
  if (Array.isArray(product.available_colors) && product.available_colors.length) {
    const others = product.available_colors.filter((c) => c !== product.color_finish);
    if (others.length) variantLines.push(`Also available in these colors: ${others.join(', ')}`);
  }

  let userPrompt = `PRODUCT INPUT:
Name: ${product.name}
Category: ${product.category}
${variantLines.join('\n')}
Raw source data: ${JSON.stringify(product, null, 2)}

Generate the requested fields now.`;

  if (lengthDirection) {
    const words = lengthDirection === 'shorter' ? '40-60' : '150-180';
    const sentences = lengthDirection === 'shorter' ? '2' : '6-8';
    userPrompt += `\n\n=========================================
!!! CRITICAL OVERRIDE FOR THIS TURN !!!
=========================================
IGNORE ALL previous rules about summary length. 
The user explicitly demanded a ${lengthDirection.toUpperCase()} summary.
You MUST write EXACTLY ${sentences} sentences and target ${words} words for the \`description.summary\`.
If you output the standard 4 sentences, you will fail the user's explicit command.
Condense or expand your writing to hit exactly ${sentences} sentences.`;
  }

  return { systemPrompt, userPrompt, tier, careMatch };
}

module.exports = { buildPrompt, computeTier, loadRules };
