# Product Content Generator

This system automatically generates high-quality, factual, and purchase-driving marketing content for furniture and home goods using an LLM. It takes sparse, raw product data (like dimensions, material, and category) and produces a complete JSON payload containing a well-structured description, care instructions, warranty details, returns policy, and an inferred quality promise—all while adhering to strict formatting constraints and brand voice guidelines without hallucinating details.

## How a request flows
1. **Product Data In**: Raw product data (JSON) and configurable price bands are provided to the generator.
2. **`promptBuilder.js`**: Constructs a detailed system and user prompt. It incorporates the product data, looks up appropriate care instructions (`careMatcher.js`), and injects category-specific rules learned from past feedback.
3. **`llmClient.js`**: Sends the prompt to the Gemini LLM (or a mock LLM in test mode) enforcing a strict JSON output schema.
4. **`generate.js`**: Assembles the final output. It combines the LLM's generated prose with pass-through specifications, deterministic warranty rules, and a purely deterministic returns block (`returnsLookup.js`).
5. **`validator.js`**: Rigorously validates the final output against constraints (e.g., word count, sentence count, tier leakage, exact match of specs). 
6. **Output**: The validated item is written to `output/generated/`.

## The feedback loop
The system uses **two distinct** feedback mechanisms that must never be mixed:

### 1. Permanent Rules (`data/rules.json` via `src/feedback.js`)
This is a cross-product, per-category mechanism. Feedback like "Never mention 'plush' for leather sofas" is compressed into a reusable instruction and stored permanently. It is injected into the system prompt for *all future generations* in that category. This ensures the model learns global brand preferences over time.

### 2. Ephemeral Session Adjustments (`data/conversations.json` via `src/conversationSession.js`)
This is a single-conversation-only mechanism. When a user interactively says "make it shorter this time", the instruction applies *only to that one regeneration attempt*. It is NEVER written to `rules.json` and never touches the base system prompt. 

**CRITICAL NOTE**: This separation is intentional and load-bearing. Mixing them causes the model to accumulate contradictory permanent rules (e.g., "make it shorter" vs "make it longer") and hallucinate. Do not let future changes blur this line.

## Project structure
```text
├── .env.example                # Template for environment variables (API keys, config)
├── README.md                   # This documentation file
├── data/                       # Contains static references, rules, and local state
│   ├── conversations.json      # Ephemeral session state for the interactive feedback loop
│   ├── feedback_log.json       # Audit trail of all permanent feedback applied
│   ├── material_care_reference.json # Approved care instructions mapped by material
│   ├── price_bands.json        # Rules mapping price ranges to marketing tiers (Good/Mid/Premium)
│   ├── products.json           # Sample raw product inputs
│   └── rules.json              # Permanent, cross-product learned preferences
├── package.json                # Project dependencies and NPM scripts
├── scripts/                    # CLI utilities
│   ├── feedbackLoop.js         # Interactive script to generate, tweak, and iterate on a product
│   └── generateFromPaste.js    # Utility to paste raw data and generate a product on the fly
├── src/                        # Core application code
│   ├── careMatcher.js          # Maps raw material strings to approved care instructions
│   ├── conversationSession.js  # Manages ephemeral, single-session feedback turns
│   ├── feedback.js             # Manages permanent, cross-product learned rules
│   ├── generate.js             # Main orchestrator assembling the final product item
│   ├── llmClient.js            # Single entry point for all Gemini API (or mock) calls
│   ├── promptBuilder.js        # Constructs the detailed prompt for the LLM
│   ├── qualityComposer.js      # Composes the quality promise section based on specs/warranty
│   ├── retriever.js            # Experimental similarity search retriever (Vector mock)
│   ├── returnsLookup.js        # Deterministic lookup for returns policies by category
│   ├── schema.js               # JSON schema definitions for the LLM output
│   ├── similarity.js           # Cosine similarity utilities for embeddings
│   └── validator.js            # Strict validation logic for the generated product content
└── test/                       # Test suite and mock data
    ├── mockLlmClient.js        # Mock LLM client used when MODE=test
    ├── runTest.js              # Runs a batch generation test on sample products
    ├── sampleProducts.json     # Test data for the runTest suite
    └── testConversationSession.js # Tests the ephemeral feedback session logic
```

## Running it

1. **Test Mode (Mock LLM, Free, Fast)**:
   Runs the test suite using a mock LLM without hitting the real API.
   ```bash
   MODE=test npm test
   ```

2. **Production Mode (Real API calls)**:
   Ensure `LLM_API_KEY` is set in your `.env` file, then run a batch generation on `data/products.json`.
   ```bash
   MODE=production npm run generate
   ```

3. **Interactive Feedback Loop**:
   Test a product and iterate on its generation interactively.
   ```bash
   MODE=production npm run feedback-loop <product_id>
   ```
