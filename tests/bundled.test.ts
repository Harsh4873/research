import { describe, expect, it } from 'vitest';
import { BUNDLED_SETS, withBundledSets } from '../src/lib/bundled';
import { extractStudyMaterial } from '../src/lib/extract';
import { defaultData, deleteSet } from '../src/lib/store';

describe('bundled research notes', () => {
  it('ships all seven requested documents as substantial study sets', () => {
    expect(BUNDLED_SETS.map((set) => set.title)).toEqual([
      'Project overview',
      'GenomegaMap',
      'PAML',
      'pN/pS',
      'Significance',
      'NDB12 update',
      'Compute runs',
    ]);
    for (const set of BUNDLED_SETS) {
      const material = extractStudyMaterial(set.markdown);
      expect(material.terms.length, `${set.title} cards`).toBeGreaterThanOrEqual(10);
      expect(material.clozes.length, `${set.title} blanks`).toBeGreaterThanOrEqual(8);
      expect(material.terms.some((card) => card.source === 'section'), `${set.title} section cards`).toBe(true);
    }
  });

  it('keeps cloze answers conceptual instead of blanking generic status words', () => {
    const rejected = new Set(['done', 'running', 'gene', 'genes', 'slowest', 'estimates', 'fixes']);
    for (const set of BUNDLED_SETS) {
      const material = extractStudyMaterial(set.markdown);
      for (const card of material.clozes) expect(rejected.has(card.answer.toLowerCase())).toBe(false);
    }
  });

  it('does not restore a bundled set after the owner removes it', () => {
    const installed = withBundledSets(defaultData());
    expect(installed.sets).toHaveLength(BUNDLED_SETS.length);
    const removed = deleteSet(installed, BUNDLED_SETS[0].id, 1000);
    const reloaded = withBundledSets(removed);
    expect(reloaded.sets.some((set) => set.id === BUNDLED_SETS[0].id)).toBe(false);
  });

  it('does not publish private operational identifiers from the source folder', () => {
    const joined = BUNDLED_SETS.map((set) => set.markdown).join('\n').toLowerCase();
    expect(joined).not.toContain('hdav3228');
    expect(joined).not.toContain('132743114356');
    expect(joined).not.toContain('csce-bwgsh03');
  });
});
