// Composes quality_promise WITHOUT invoking the LLM. The statement is a
// cheap template swap; highlights are assembled only from facts already
// generated/known elsewhere (warranty, assembly) — never invented perks.

function buildQualityPromise(category, warranty, specifications) {
  const statement = `Every ${category.toLowerCase()} product we offer is inspected for quality and built to stand up to everyday life.`;

  const highlights = [];

  if (warranty && warranty.applicable) {
    const duration = warranty.duration_months;
    highlights.push(
      duration
        ? `Backed by our ${duration}-month warranty for added peace of mind.`
        : 'Backed by our manufacturer warranty for added peace of mind.'
    );
  }

  const assembly = String((specifications && specifications.assembly_required) || '').toLowerCase();
  if (assembly.includes('free') || assembly.includes('guided') || assembly.includes('included')) {
    highlights.push('Comes with guided assembly support, so setup is simple.');
  } else if (assembly.includes('none') || assembly.includes('not required') || assembly === 'no') {
    highlights.push('Arrives ready to use, with no assembly required.');
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
