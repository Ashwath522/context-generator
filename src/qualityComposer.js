// Composes quality_promise WITHOUT invoking the LLM. The statement is a
// cheap template swap; highlights are assembled only from facts already
// generated/known elsewhere (warranty, assembly) — never invented perks.

function buildQualityPromise(category, warranty, specifications) {
  const statement = `Every ${category.toLowerCase()} product is checked for finish, fit, and everyday usability before it reaches your home.`;

  const highlights = [];

  highlights.push('Designed to feel dependable in daily use, with details reviewed for a cleaner ownership experience.');

  if (warranty && warranty.applicable) {
    const duration = warranty.duration_months;
    highlights.push(
      duration
        ? `Supported by a ${duration}-month warranty, so the purchase feels considered after delivery too.`
        : 'Backed by our manufacturer warranty for added peace of mind.'
    );
  }

  const assembly = String((specifications && specifications.assembly_required) || '').toLowerCase();
  if (assembly.includes('free') || assembly.includes('guided') || assembly.includes('included')) {
    highlights.push('Includes guided assembly support to help the product settle into your space smoothly.');
  } else if (assembly.includes('requires') || assembly.includes('carpenter')) {
    highlights.push('Built for a properly finished setup with assembly handled as part of the ownership journey.');
  } else if (assembly.includes('none') || assembly.includes('not required') || assembly === 'no') {
    highlights.push('Arrives ready to use, making setup simple from the start.');
  }

  return {
    statement,
    highlights: highlights.slice(0, 3),
    isi: {
      certified: false, // manually toggled by a human via UI, never computed here
      label: 'ISI Certified',
      logo: 'static-asset-reference'
    }
  };
}

module.exports = { buildQualityPromise };
