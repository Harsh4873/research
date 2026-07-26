import { BUNDLED_SETS } from '../src/lib/bundled';
import { extractStudyMaterial } from '../src/lib/extract';

for (const set of BUNDLED_SETS) {
  const material = extractStudyMaterial(set.markdown);
  console.log(`\n${set.title}: ${material.terms.length} cards, ${material.clozes.length} blanks`);
  console.log('cards:', material.terms.slice(0, 12).map((card) => ({ front: card.term, source: card.source })));
  console.log('blanks:', material.clozes.slice(0, 8).map((card) => card.answer));
}
