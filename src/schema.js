/**
 * Single Responsibility: Defines the JSON schema for LLM-generated content.
 * Expected to be called from: src/llmClient.js, src/promptBuilder.js
 */
// Locked output schema. Do not deviate — see README for field-by-field rules.

const FULL_SCHEMA_EXAMPLE = {
  description: {
    summary: "Exactly 4 substantial sentences, 90-125 words: aesthetic overview, texture, selected size + sibling sizes, selected color/finish + sibling colors, no raw dimensions",
    aesthetic_style: "1 line, tier-appropriate persuasive language",
    texture: "1 line, sensory",
    best_use: "1 line, where it fits + why, combined"
  },
  specifications: {
    dimensions: "exact, verbatim from source",
    primary_material: "exact, verbatim from source",
    weight: "exact, verbatim from source",
    assembly_required: "exact, verbatim from source"
  },
  care_and_maintenance: {
    instructions: ["exactly 3 items, polite tone, grounded in material reference"],
    avoid: ["exactly 2 items, polite tone, grounded in material reference"]
  },
  warranty: {
    applicable: true,
    duration_months: 12,
    status_line: "1 sentence — Yes/No and duration both in **bold markdown**",
    points: ["up to 4 items, mixed covers/excludes, only from real source facts"],
    link: "placeholder URL for now"
  },
  returns: {
    window_days: "bold number, e.g. 'within **10 days**' — from category lookup, NOT LLM",
    condition: ["exactly 3 fixed strings — from category lookup, NOT LLM"],
    policy_link: "placeholder URL for now"
  },
  quality_promise: {
    statement: "1-2 lines, near-identical boilerplate across products, category name swapped in",
    highlights: ["2-3 items, composed from already-generated facts, NEVER invented perks"],
    isi: {
      certified: false,
      label: "ISI Certified",
      logo: "static-asset-reference"
    }
  }
};

// Subset schema sent to the LLM — only the fields it is allowed to generate.
// (specifications, returns, and most of quality_promise are never LLM output.)
const LLM_GENERATED_SCHEMA_SUBSET = {
  description: {
    summary: "Exactly 4 substantial sentences, 90-125 words: aesthetic overview, texture, selected size + available sizes, selected color/finish + available colors",
    aesthetic_style: "1 line",
    texture: "1 line, sensory",
    best_use: "1 line"
  },
  care_and_maintenance: {
    instructions: ["exactly 3 items, polite tone"],
    avoid: ["exactly 2 items, polite tone"]
  },
  warranty: {
    applicable: true,
    status_line: "1 sentence, **Yes**/**No** + **duration** in bold markdown",
    points: ["up to 4 items, only real source facts"]
  }
};

// Strict JSON Schema (Gemini responseSchema format) for the LLM-generated
// subset. Passed to generationConfig.responseSchema so the API itself
// enforces structure — validator.js becomes a backstop for content-quality
// checks (tone, tier leakage, factual match), not the only line of defense
// against malformed shape.
const LLM_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    description: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        aesthetic_style: { type: 'string' },
        texture: { type: 'string' },
        best_use: { type: 'string' }
      },
      required: ['summary', 'aesthetic_style', 'texture', 'best_use']
    },
    care_and_maintenance: {
      type: 'object',
      properties: {
        instructions: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
        avoid: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 }
      },
      required: ['instructions', 'avoid']
    },
    warranty: {
      type: 'object',
      properties: {
        applicable: { type: 'boolean' },
        status_line: { type: 'string' },
        points: { type: 'array', items: { type: 'string' }, maxItems: 4 }
      },
      required: ['applicable', 'status_line', 'points']
    }
  },
  required: ['description', 'care_and_maintenance', 'warranty']
};

const PLACEHOLDER_LINKS = {
  warranty: "https://example.com/warranty-policy-placeholder",
  returns: "https://example.com/returns-policy-placeholder"
};

module.exports = {
  FULL_SCHEMA_EXAMPLE,
  LLM_GENERATED_SCHEMA_SUBSET,
  LLM_RESPONSE_SCHEMA,
  PLACEHOLDER_LINKS
};
