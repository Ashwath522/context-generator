const fs = require('fs');
const path = require('path');
const { generateOne, loadPriceBands } = require('../src/generate');
const { startConversation, addTurn } = require('../src/conversationSession');

const ACTUAL_TEXTS = {
  "ul-kuba-queen-bed": {
    prose: `A statement in contemporary design. Featuring a headboard defined by
vertical and chevron groove detailing, the Kuba bed brings inviting
elegance to your space. The floating effect adds a distinctive touch,
while durable sheesham wood ensures lasting strength. With its rich,
warm finish, Kuba transforms your bedroom into a sophisticated retreat.`,
    bullets: [
      "- Available in King and Queen sizes to suit different bedroom spaces.",
      "- Recommended mattress sizes: King - 78 x 72 inches; Queen - 78 x 60 inches.",
      "- Recommended mattress thickness: 4-8 inches for optimal comfort and fit.",
      "- Storage options: Non-storage, drawer, box, and hydraulic storage for versatile bedroom organisation.",
      "- Finish options: Teak and Mahogany."
    ]
  },
  "ul-nimbus-king-bed": {
    prose: `Wake up to calm. Introducing softness and fluidity with its curvilinear
silhouette, the Nimbus bed is a celebration of artful design. A metal
inlay on the headboard traces its form, providing a contrast against the
rich sheesham wood surface. Gently rounded corners and softened edges
enhance its inviting presence, while the clean, minimal design adds
timeless sophistication to your space. Designed for restful nights and
serene mornings, Nimbus is a statement of elegance for any bedroom.`,
    bullets: [
      "- Crafted from solid sheesham wood.",
      "- Available in two finish options: Teak and Mahogany.",
      "- Available in Non storage, Box storage, Drawer storage and Hydraulic storage options.",
      "- Recommended mattress sizes: King - 78 x 72 inches; Queen - 78 x 60 inches."
    ]
  },
  "ul-milan-queen-bed": {
    prose: `Contemporary elegance meets effortless luxury in the Milan bed. Wrapped
in luxurious velvet, the headboard invites you to relax and unwind,
offering plush comfort. Graceful pleats and a gold-finish staple accent
add sophistication, balancing striking design with everyday ease.

Soft curves and clean lines shape its calming silhouette, while
efficient storage offers generous room for bedding, seasonal essentials,
and cherished keepsakes. Crafted as the centrepiece of your retreat,
Milan lends a dreamy presence, perfect for lingering a little longer.`,
    bullets: [
      "- Available in king and queen size options.",
      "- Recommended mattress size - 72\"x 78\" (king) & 60\"x78\" (queen). Thickness - 4 to 6 inches.",
      "- Available with a hydraulic storage option with fabric hand pull that can be easily tucked away, and pulled out for easy lift-up.",
      "- Available in three colour options: Deep Olive, Deep Crimson & Mocha Mousse."
    ]
  }
};

let retryCount = 0;
const originalWarn = console.warn;
console.warn = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('[retry]')) {
    retryCount++;
  }
  originalWarn(...args);
};

async function run() {
  const products = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/products.json'), 'utf-8'));
  const priceBands = loadPriceBands();
  
  const targetIds = ["ul-kuba-queen-bed", "ul-nimbus-king-bed", "ul-milan-queen-bed"];
  const targetProducts = products.filter(p => targetIds.includes(p.id));

  for (const product of targetProducts) {
    console.log(`\n======================================================`);
    console.log(`TESTING: ${product.name}`);
    console.log(`======================================================`);
    
    retryCount = 0;
    const conv_id = `ground_truth_${product.id}_${Date.now()}`;
    startConversation({ conv_id, user: 'test', product_id: product.id, msg: 'Initial' });
    
    console.log('Generating initial description...');
    const res = await generateOne(product, priceBands, 1, conv_id);
    const initialRetries = retryCount;
    
    const actual = ACTUAL_TEXTS[product.id];
    
    console.log('\n--- PROSE COMPARISON ---');
    console.log('ACTUAL UL TEXT:');
    console.log(actual.prose);
    console.log('\nGENERATED TEXT:');
    console.log(res.description.summary);
    
    console.log('\n--- BULLETS COMPARISON ---');
    console.log('ACTUAL UL BULLETS:');
    console.log(actual.bullets.join('\n'));
    console.log('\nGENERATED BULLETS:');
    if (res.description.key_features) {
      console.log(res.description.key_features.map(b => `- ${b}`).join('\n'));
    } else {
      console.log('(No key_features found)');
    }

    const wordCount = res.description.summary.trim().split(/\s+/).length;
    const sentenceCount = (res.description.summary.match(/[.!?]/g) || []).length;
    
    const shortNameRegex = new RegExp(`\\b${product.product_short_name}\\b`, 'gi');
    const shortNameCount = (res.description.summary.match(shortNameRegex) || []).length;
    
    let hasSiblings = false;
    // Check if variant axes sizes or colors leaked into summary
    if (product.variant_axes) {
      const sizes = product.variant_axes.size || [];
      const colors = product.variant_axes.colour || [];
      const finishes = product.variant_axes.finish || [];
      
      for (const s of [...sizes, ...colors, ...finishes]) {
        if (s && res.description.summary.toLowerCase().includes(s.toLowerCase())) {
          hasSiblings = true;
          break;
        }
      }
    }

    console.log('\n--- SELF-SCORE TABLE ---');
    console.log('| Metric | Value | Check |');
    console.log('|--------|-------|-------|');
    console.log(`| Sentences | ${sentenceCount} | ${sentenceCount >= 4 && sentenceCount <= 6 ? 'PASS' : 'FAIL'} |`);
    console.log(`| Word Count | ${wordCount} | ${wordCount >= 70 && wordCount <= 110 ? 'PASS' : 'FAIL'} |`);
    console.log(`| Short Name Mentioned Once | ${shortNameCount} | ${shortNameCount === 1 ? 'PASS' : 'FAIL'} |`);
    console.log(`| Zero Siblings in Prose | ${!hasSiblings} | ${!hasSiblings ? 'PASS' : 'FAIL'} |`);
    console.log(`| Zero Retries | ${initialRetries} | ${initialRetries === 0 ? 'PASS' : 'FAIL'} |`);
    
    console.log('\n--- SESSION OVERRIDE TEST ---');
    retryCount = 0;
    await addTurn({ conv_id, msg: 'make it noticeably shorter' });
    const resShort = await generateOne(product, priceBands, 1, conv_id);
    const shortRetries = retryCount;
    
    const shortWordCount = resShort.description.summary.trim().split(/\s+/).length;
    console.log(`Shorter request resulted in ${shortWordCount} words (was ${wordCount}). Reduction: ${((wordCount - shortWordCount) / wordCount * 100).toFixed(1)}%`);
    
    const bulletsMatch = JSON.stringify(res.description.key_features) === JSON.stringify(resShort.description.key_features);
    console.log(`Bullets remained identical: ${bulletsMatch}`);
    console.log(`Retries triggered on short override: ${shortRetries}`);
  }
}

run().catch(console.error);
