// Fake LLM responses — no API key, no network calls. Matches the exact
// schema shape the real Gemini client returns, so the whole pipeline
// (matching, validation, feedback loop) can be exercised for free.

function extractField(text, label) {
  const match = text.match(new RegExp(`${label}:\\s*(.+)`));
  return match ? match[1].trim() : null;
}

function extractListLine(text, label) {
  const value = extractField(text, label);
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
}

function mockGenerateContent({ systemPrompt, userPrompt }) {
  const name = extractField(userPrompt, 'Name') || 'This product';
  const category = extractField(userPrompt, 'Category') || 'Home Goods';
  const selectedSize = extractField(userPrompt, 'Primary size/seating variant \\(THIS product\\)') || 'selected size';
  const selectedColor = extractField(userPrompt, 'Color / finish \\(THIS product\\)') || 'selected finish';
  const otherSizes = extractListLine(userPrompt, 'Also available in these sizes');
  const otherColors = extractListLine(userPrompt, 'Also available in these colors');

  const instructionsMatch = systemPrompt.match(/Instructions:\s*(\[.*?\])/s);
  const avoidMatch = systemPrompt.match(/Avoid:\s*(\[.*?\])/s);

  let refInstructions = [];
  let refAvoid = [];
  try { refInstructions = JSON.parse(instructionsMatch[1]); } catch (e) { /* fall through to defaults */ }
  try { refAvoid = JSON.parse(avoidMatch[1]); } catch (e) { /* fall through to defaults */ }

  const fallbackInstructions = [
    'wipe down with a soft, dry cloth regularly',
    'keep away from direct sunlight',
    'use coasters or mats under hot or wet items'
  ];
  const fallbackAvoid = ['harsh chemical cleaners', 'placing near direct heat sources'];

  const pickedInstructions = (refInstructions.length ? refInstructions : fallbackInstructions).slice(0, 3);
  while (pickedInstructions.length < 3) pickedInstructions.push(fallbackInstructions[pickedInstructions.length]);

  const pickedAvoid = (refAvoid.length ? refAvoid : fallbackAvoid).slice(0, 2);
  while (pickedAvoid.length < 2) pickedAvoid.push(fallbackAvoid[pickedAvoid.length]);

  const politeInstructions = pickedInstructions.map((line) => {
    const lower = line.charAt(0).toLowerCase() + line.slice(1);
    return `We recommend you ${lower.replace(/\.$/, '')}.`;
  });

  const politeAvoid = pickedAvoid.map((line) => {
    const stripped = line.replace(/^avoid\s+/i, '');
    const lower = stripped.charAt(0).toLowerCase() + stripped.slice(1);
    return `It's best to avoid ${lower.replace(/\.$/, '')}.`;
  });

  return Promise.resolve({
    description: {
      summary: `${name} brings a complete, inviting feel to any ${category.toLowerCase()} space, pairing everyday usability with a composed aesthetic that helps shoppers imagine the piece in their home. Its surface feels smooth and easy to live with, creating a tactile impression that supports comfort, relaxed use, and a more finished room. This is the ${selectedSize} variant, chosen for shoppers who want the right fit for daily comfort and practical space planning${otherSizes.length ? `, and it is also available in ${otherSizes.join(', ')}` : ''}. This ${selectedColor} finish gives the room a grounded, easy-to-style character${otherColors.length ? `, and it is also available in ${otherColors.join(', ')}` : ''}, making the purchase feel thoughtful and ready for real homes.`,
      aesthetic_style: 'Clean lines with a calm, understated presence.',
      texture: 'Smooth to the touch with a natural, tactile finish.',
      best_use: `Well suited to everyday ${category.toLowerCase()} use, where both form and function matter.`
    },
    care_and_maintenance: {
      instructions: politeInstructions,
      avoid: politeAvoid
    },
    warranty: {
      applicable: true,
      status_line: '**Yes**, it has a warranty of **12 months**.',
      points: [
        'Covers manufacturing defects in materials and workmanship.',
        'Covers defects in the production finish under normal use.',
        'Excludes accidental damage or misuse.'
      ]
    }
  });
}

function mockGenerateText({ prompt }) {
  return Promise.resolve('Be more specific and grounded in the referenced material category when phrasing care instructions.');
}

module.exports = { mockGenerateContent, mockGenerateText };
