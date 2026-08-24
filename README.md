# Product Content Generator

Node.js prototype that turns raw product data into structured marketing
content via an LLM, with a prompt-injection feedback loop that improves
future generations without retraining anything.

## Quick start

```bash
npm install    # no dependencies to install yet — reserved for future use
npm test       # runs the full pipeline in mock mode, zero API cost
```

`npm test` runs `test/runTest.js`, which forces `MODE=test`, generates
content for every product in `test/sampleProducts.json` using
`test/mockLlmClient.js` (no network calls), validates every item, and
prints a PASS/REVIEW/ERROR summary. Output lands in `output/generated/`.

## Switching to production (Gemini)

1. Get a Gemini API key: https://aistudio.google.com/apikey
2. Open `.env` and fill in `LLM_API_KEY=`, then set `MODE=production`.
3. Put real product data in `data/products.json`.
4. Run:
   ```bash
   npm run generate
   ```

`.env` already points at the Gemini REST endpoint:

```
LLM_MODEL=gemini-2.0-flash
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta
```

`src/llmClient.js` is the only file that knows about test vs. production —
it checks `process.env.MODE` and calls either `test/mockLlmClient.js` or
the real Gemini REST endpoint via `fetch`. Everything else in the
codebase calls `generateContent()` / `generateText()` and never knows
which mode it's in.

### Once testing is approved

Delete the `/test` folder entirely and flip `MODE=production` in `.env`.
No other file needs to change — if it does, that's a sign test mode was
wired in wrong.

## Project structure

```
data/                     input + reference + learned-rules data
  products.json           raw product data (replace with real data)
  material_care_reference.json   material -> care instructions/avoid
  returns_by_category.json       category -> return window/conditions
  price_bands.json               category -> good/mid/premium price bands
  rules.json               learned feedback rules (per category+field)
  feedback_log.json        raw feedback audit trail (never pruned)
src/
  schema.js               locked output schema
  promptBuilder.js         builds system+user prompt per product
  llmClient.js             LLM API wrapper (mock or real Gemini, by MODE)
  careMatcher.js            material -> care category matcher
  returnsLookup.js          category -> returns block (pure lookup, no LLM)
  qualityComposer.js        rules-based highlights, no LLM invention
  validator.js               schema + factual consistency checks
  generate.js                 main generation entrypoint (single + batch)
  feedback.js                  capture feedback -> summarize -> update rules.json
test/
  mockLlmClient.js          fake LLM responses, no API key needed
  sampleProducts.json       7 products across 4 categories, 5 material types
  runTest.js                 runs generate.js fully in mock mode
output/generated/            per-product generated JSON lands here
```

## Output schema (locked)

Each generated item has: `description`, `specifications`, `care_and_maintenance`,
`warranty`, `returns`, `quality_promise`. See `src/schema.js` for the full
shape and `PROJECT_SPEC` field-by-field rules (paraphrasing, tier
invisibility, grounded care instructions, lookup-only returns, etc).

- **description** — LLM-generated, persuasive, tier-*invisible* (price tier
  shapes word choice only, never appears literally).
- **specifications** — passed through verbatim from source data, never
  generated.
- **care_and_maintenance** — LLM selects & politely rephrases *only* from
  `material_care_reference.json`; never invents instructions.
- **warranty** — LLM writes `status_line` + up to 4 `points`, grounded in
  source facts only.
- **returns** — pure lookup from `returns_by_category.json`, LLM never
  called for this field.
- **quality_promise** — template `statement` + rules-composed `highlights`
  (from already-known facts like warranty/assembly), never an invented
  perk. `isi.certified` is toggled manually by a human, never computed.

## Feedback loop

1. A reviewer flags an issue on a generated field → `feedback.js` logs it
   to `data/feedback_log.json` (permanent audit trail, never pruned).
2. A **separate**, small LLM call compresses the raw feedback into one
   short, reusable instruction, stored in `data/rules.json` keyed by
   category + field (new feedback for the same category+field overwrites
   by default; pass a `variant` to `captureFeedback()` when it's clearly a
   different concern instead).
3. `promptBuilder.js` reads `rules.json` on every future generation call
   for that category and injects the relevant rules into the system
   prompt — no fine-tuning, no model changes.
4. If a category+field accumulates more than 5 keyed rule variants,
   `feedback.js` automatically consolidates them into 2-3 combined
   instructions via one more LLM call.

This is prompt-injection of accumulated rules, not fine-tuning — the
model itself never changes.

## Validation

`src/validator.js` runs on every generated item before it's considered
done: schema presence, factual consistency (`specifications` must match
source data exactly), field counts (3 care instructions, 2 avoid items,
≤4 warranty points, 3 return conditions), tier-leakage (no "premium" /
price figures in `description`), and a polite-tone heuristic for care
instructions. Anything failing twice (original + one retry) is marked
`needs_review: true` and excluded from auto-approval — never silently
pushed through.

## Notes

- Requires **Node.js 18+** (uses the global `fetch`).
- No real API key is committed anywhere — `.env` ships with
  `LLM_API_KEY=` blank; you fill it in locally.
- RAG-based retrieval for `rules.json` / `material_care_reference.json` /
  `feedback_log.json` isn't wired in yet — the spec calls for it only once
  any of those files exceeds ~30 entries. Add a `retriever.js` module at
  that point rather than building a vector DB prematurely.
# content-forge
# content-forge
# context-generator-
