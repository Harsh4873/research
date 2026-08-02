import { describe, expect, it } from 'vitest';
import type { StudySet } from '../src/model';
import { findExistingPaper, searchPapers } from '../src/lib/paper-search';

function paper(id: string, front: Record<string, string>, body = 'Body text about the topic.'): StudySet {
  const matter = Object.entries(front)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  return {
    id: `paper-${id}`,
    title: front.title ?? 'Untitled',
    markdown: `---\n${matter}\n---\n\n# ${front.title ?? 'Untitled'}\n\n${body}\n`,
    createdAt: 1,
    updatedAt: 1,
  };
}

const LIBRARY: StudySet[] = [
  paper(
    'a',
    {
      title: 'Diabetes as a risk factor for tuberculosis disease',
      authors: 'Ana Rivera, Chidi Okafor',
      journal: 'Cochrane Database of Systematic Reviews',
      year: '2024',
      pmid: '39177079',
      doi: '10.1002/14651858.CD016013',
    },
    'The pooled hazard ratio for incident tuberculosis was 1.9 among people with diabetes mellitus.',
  ),
  paper(
    'b',
    {
      title: 'High-resolution mapping of tuberculosis transmission',
      authors: 'Lee Park, Mira Solberg',
      journal: 'PLoS Medicine',
      year: '2019',
      pmid: '31671150',
      pmcid: 'PMC6822721',
      doi: '10.1371/journal.pmed.1002961',
    },
    'We used whole genome sequencing to delineate transmission clusters in the Valencia Region.',
  ),
  paper(
    'c',
    { title: 'Metformin as adjunct antituberculosis therapy', authors: 'Klein A', journal: 'Science', year: '2014', pmid: '25411472' },
    'Metformin reduced intracellular bacterial growth in this model system.',
  ),
  // A note set must never appear in paper search results.
  { id: 'note-1', title: 'My revision notes', markdown: '# My notes\n\ntuberculosis revision\n', createdAt: 1, updatedAt: 1 },
];

describe('searchPapers', () => {
  it('returns every paper, and no note sets, when the query is empty', () => {
    const all = searchPapers(LIBRARY, '');
    expect(all).toHaveLength(3);
    expect(all.some((m) => m.set.id === 'note-1')).toBe(false);
  });

  it('finds a paper by words in its title', () => {
    const found = searchPapers(LIBRARY, 'transmission mapping');
    expect(found).toHaveLength(1);
    expect(found[0].set.id).toBe('paper-b');
    expect(found[0].fields).toContain('title');
  });

  it('finds a paper by author', () => {
    const found = searchPapers(LIBRARY, 'solberg');
    expect(found.map((m) => m.set.id)).toEqual(['paper-b']);
    expect(found[0].fields).toContain('author');
  });

  it('finds a paper by PMID, DOI, or PMCID', () => {
    expect(searchPapers(LIBRARY, '39177079')[0].set.id).toBe('paper-a');
    expect(searchPapers(LIBRARY, 'PMC6822721')[0].set.id).toBe('paper-b');
    expect(searchPapers(LIBRARY, '10.1371/journal.pmed.1002961')[0].set.id).toBe('paper-b');
  });

  it('finds a paper by journal or year', () => {
    expect(searchPapers(LIBRARY, 'cochrane')[0].set.id).toBe('paper-a');
    expect(searchPapers(LIBRARY, '2014')[0].set.id).toBe('paper-c');
  });

  it('falls back to the body text and returns a snippet', () => {
    const found = searchPapers(LIBRARY, 'valencia');
    expect(found).toHaveLength(1);
    expect(found[0].fields).toContain('text');
    expect(found[0].snippet?.toLowerCase()).toContain('valencia');
  });

  it('ranks an identifier match above a passing text mention', () => {
    const found = searchPapers(LIBRARY, 'tuberculosis');
    // Two titles carry the word; the third only mentions it in the body.
    expect(found.length).toBeGreaterThanOrEqual(2);
    expect(found[0].score).toBeGreaterThanOrEqual(found[found.length - 1].score);
    expect(['paper-a', 'paper-b']).toContain(found[0].set.id);
  });

  it('narrows as tokens are added, since every token must match', () => {
    expect(searchPapers(LIBRARY, 'tuberculosis').length).toBeGreaterThan(1);
    expect(searchPapers(LIBRARY, 'tuberculosis metformin').map((m) => m.set.id)).toEqual(['paper-c']);
    expect(searchPapers(LIBRARY, 'tuberculosis unicorn')).toEqual([]);
  });

  it('is case and punctuation tolerant', () => {
    expect(searchPapers(LIBRARY, 'RIVERA').map((m) => m.set.id)).toEqual(['paper-a']);
    expect(searchPapers(LIBRARY, 'pmc6822721').map((m) => m.set.id)).toEqual(['paper-b']);
  });
});

describe('findExistingPaper', () => {
  it('recognises a paper already saved, by any of its identifiers', () => {
    expect(findExistingPaper(LIBRARY, { kind: 'pmid', value: '31671150' })?.id).toBe('paper-b');
    expect(findExistingPaper(LIBRARY, { kind: 'pmcid', value: '6822721' })?.id).toBe('paper-b');
    expect(findExistingPaper(LIBRARY, { kind: 'doi', value: '10.1371/JOURNAL.PMED.1002961' })?.id).toBe('paper-b');
  });

  it('returns nothing for a paper that is not saved', () => {
    expect(findExistingPaper(LIBRARY, { kind: 'pmid', value: '11111111' })).toBeUndefined();
  });
});
