require("dotenv").config();
// Single entrypoint for all LLM calls. Everything downstream (generate.js,
// promptBuilder.js, feedback.js) calls generateContent()/generateText() and
// never knows or cares whether MODE is "test" or "production" — same
// function signature either way.

const { LLM_GENERATED_SCHEMA_SUBSET } = require('./schema');
const { LLM_RESPONSE_SCHEMA } = require('./schema');

async function callGemini({ systemPrompt, userPrompt, jsonMode, responseSchema }) {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
  const model = process.env.LLM_MODEL || 'gemini-2.0-flash';

  if (!apiKey) {
    throw new Error(
      'LLM_API_KEY is not set. Add your Gemini API key to .env (LLM_API_KEY=...) before running in production mode. ' +
      'Get one at https://aistudio.google.com/apikey'
    );
  }

  const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;

  const contents = [
    {
      role: 'user',
      parts: [{ text: userPrompt }]
    }
  ];

  const body = {
    contents,
    generationConfig: {
      temperature: 0.4,
      thinkingConfig: { thinkingBudget: 0 },
      ...(jsonMode ? { responseMimeType: 'application/json', responseSchema: LLM_RESPONSE_SCHEMA } : {})
    }
  };

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const usage = data?.usageMetadata;
  if (usage) {
    console.log(
      `[tokens] prompt=${usage.promptTokenCount} output=${usage.candidatesTokenCount} total=${usage.totalTokenCount}`
    );
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error(`Gemini API returned no content. Full response: ${JSON.stringify(data)}`);
  }

  if (!jsonMode) return text.trim();

  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

// Used for the main per-product generation call (description,
// care_and_maintenance, warranty). Always expects JSON back.
async function generateContent({ systemPrompt, userPrompt }) {
  if (process.env.MODE === 'test') {
    const { mockGenerateContent } = require('../test/mockLlmClient');
    return mockGenerateContent({ systemPrompt, userPrompt });
  }
  return callGemini({
    systemPrompt,
    userPrompt,
    jsonMode: true,
    responseSchema: LLM_GENERATED_SCHEMA_SUBSET
  });
}

// Used for the small, separate feedback-compression call in feedback.js.
// Plain text in, plain text out — no schema.
async function generateText({ prompt }) {
  if (process.env.MODE === 'test') {
    const { mockGenerateText } = require('../test/mockLlmClient');
    return mockGenerateText({ prompt });
  }
  return callGemini({ systemPrompt: '', userPrompt: prompt, jsonMode: false });
}

module.exports = { generateContent, generateText };
