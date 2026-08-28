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
    colors that are not this specific variant.
    NEVER enumerate sibling variants (e.g. available sizes, colors, storage options) in prose. These will be added programmatically as bullets later.
10. PROSE STRUCTURE — Follow this exact 4-part formula:
      Part 1 — MOOD LINE: A short emotional hook setting the tone. Do not use the product name here.
      Part 2 — INTRO: Names the product type + its single most distinctive design hook ({{DESIGN_DETAILS}}).
      Part 3 — STORY: 1-2 paragraphs detailing material, construction, and secondary details based on category emphasis.
      Part 4 — CLOSE: Names the product BY SHORT NAME exactly once ({{SHORT_NAME}}), circling back to the mood.
    Produce the prose targeting ~70-110 words across 4-6 sentences.

    CATEGORY RULES for {{CATEGORY}} / {{SUBCATEGORY}}:
    Emphasis: {{CATEGORY_EMPHASIS}}
    Avoid: {{CATEGORY_AVOID}}
    Tone: {{CATEGORY_TONE}}

LEARNED PREFERENCES (feedback-derived rules):
{{LEARNED_RULES}}`;

function loadCategoryRules(category, subcategory) {
  const baseDir = path.join(__dirname, '..', 'data', 'categoryPrompts');
  const catPath = category ? path.join(baseDir, category) : null;
  const subPath = (catPath && subcategory) ? path.join(catPath, `${subcategory}.json`) : null;
  const catDefPath = catPath ? path.join(catPath, '_default.json') : null;
  const globalDefPath = path.join(baseDir, '_default.json');
  
  let rules = null;
  if (subPath && fs.existsSync(subPath)) {
    try { rules = JSON.parse(fs.readFileSync(subPath, 'utf-8')); } catch(e){}
  }
  if (!rules && catDefPath && fs.existsSync(catDefPath)) {
    try { rules = JSON.parse(fs.readFileSync(catDefPath, 'utf-8')); } catch(e){}
  }
  if (!rules && fs.existsSync(globalDefPath)) {
    try { rules = JSON.parse(fs.readFileSync(globalDefPath, 'utf-8')); } catch(e){}
  }
  return rules || { emphasis_points: [], avoid_list: [], tone_notes: "" };
}

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
    const words = lengthDirection === 'shorter' ? '40-60' : '120-150';
    schemaSubset.description.summary = `CRITICAL OVERRIDE: Target ${words} words. The user requested this length.`;
  }

  const categoryRules = loadCategoryRules(product.category, product.subcategory);

  let systemPrompt = SYSTEM_PROMPT_TEMPLATE
    .replace('{{SCHEMA_SUBSET}}', JSON.stringify(schemaSubset, null, 2))
    .replace('{{TIER}}', tier)
    .replace('{{TIER_VOICE}}', TIER_VOICE[tier])
    .replace('{{MATCHED_CATEGORY}}', careMatch.category)
    .replace('{{MATCHED_INSTRUCTIONS}}', JSON.stringify(careMatch.instructions))
    .replace('{{MATCHED_AVOID}}', JSON.stringify(careMatch.avoid))
    .replace('{{VARIANT_SEATING}}', variantSeating)
    .replace('{{VARIANT_COLOR}}', variantColor)
    .replace('{{CATEGORY}}', product.category || 'Unknown')
    .replace('{{SUBCATEGORY}}', product.subcategory || 'Unknown')
    .replace('{{DESIGN_DETAILS}}', product.design_details || 'its unique build')
    .replace('{{SHORT_NAME}}', product.product_short_name || product.name.split(' ')[0])
    .replace('{{CATEGORY_EMPHASIS}}', JSON.stringify(categoryRules.emphasis_points))
    .replace('{{CATEGORY_AVOID}}', JSON.stringify(categoryRules.avoid_list))
    .replace('{{CATEGORY_TONE}}', categoryRules.tone_notes)
    .replace('{{LEARNED_RULES}}', formatLearnedRules(rules, product.category));

  if (lengthDirection) {
    const words = lengthDirection === 'shorter' ? '40-60' : '120-150';
    const instruction = lengthDirection === 'shorter' 
      ? `Keep it concise: target approximately ${words} words. Compress the prose but maintain the 4-part formula.`
      : `Expand on the product details: target approximately ${words} words. Provide more descriptive detail.`;
    
    const parts = systemPrompt.split('10. PROSE STRUCTURE');
    if (parts.length === 2) {
      const subParts = parts[1].split('LEARNED PREFERENCES');
      if (subParts.length === 2) {
        const replacement = `10. PROSE STRUCTURE - CRITICAL LENGTH OVERRIDE:
    The user explicitly demanded a ${lengthDirection.toUpperCase()} summary.
    ${instruction}
    NEVER include the raw L x W x H / m / cm dimension string anywhere in summary — that lives only in specifications.
    Ensure you still follow the 4-part formula (mood, intro, story, close).\n\n`;
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

  let userPrompt = `PRODUCT INPUT:
Name: ${product.name}
Category: ${product.category}
${variantLines.join('\n')}
Raw source data: ${JSON.stringify(product, null, 2)}

Generate the requested fields now.`;

  if (lengthDirection) {
    const words = lengthDirection === 'shorter' ? '40-60' : '120-150';
    const instruction = lengthDirection === 'shorter'
      ? `Keep it concise: target approximately ${words} words. Focus on the core message without padding.`
      : `Expand on details: target approximately ${words} words.`;

    userPrompt += `\n\n=========================================
!!! CRITICAL OVERRIDE FOR THIS TURN !!!
=========================================
IGNORE ALL previous rules about word count for the summary. 
The user explicitly demanded a ${lengthDirection.toUpperCase()} summary.
${instruction}
DO NOT mention sibling sizes or colors. Just focus on describing this specific variant within the 4-part structure.`;
  }

  return { systemPrompt, userPrompt, tier, careMatch };
}

module.exports = { buildPrompt, computeTier, loadRules };
