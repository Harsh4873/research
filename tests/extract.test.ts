import { describe, expect, it } from 'vitest';
import { BLANK, extractStudyMaterial, hashId, normalizeKey } from '../src/lib/extract';
import { SAMPLE_MARKDOWN } from '../src/lib/sample';

describe('term extraction', () => {
  it('harvests bold-term bullets with ":" and "—" separators', () => {
    const md = '## Cells\n\n- **Mitochondria**: the powerhouse of the cell\n- **Ribosome** — builds proteins from RNA instructions\n';
    const { terms } = extractStudyMaterial(md);
    expect(terms.slice(0, 2).map((t) => t.term)).toEqual(['Mitochondria', 'Ribosome']);
    expect(terms[0].definition).toBe('the powerhouse of the cell');
    expect(terms[1].definition).toBe('builds proteins from RNA instructions');
    expect(terms[0].section).toBe('Cells');
    expect(terms[0].source).toBe('bold');
  });

  it('supports the "**Term:** definition" style with the colon inside the bold', () => {
    const { terms } = extractStudyMaterial('- **Osmosis:** diffusion of water across a membrane\n');
    expect(terms).toHaveLength(1);
    expect(terms[0].term).toBe('Osmosis');
    expect(terms[0].definition).toBe('diffusion of water across a membrane');
  });

  it('harvests plain "Term: definition" bullets but rejects URLs and long sentences as terms', () => {
    const md = [
      '- Photosynthesis: turning light into chemical energy',
      '- https://example.com: not a term',
      '- This whole sentence is far too long to be a reasonable flashcard term honestly: definition',
      '',
    ].join('\n');
    const { terms } = extractStudyMaterial(md);
    expect(terms.map((t) => t.term)).toEqual(['Photosynthesis']);
  });

  it('harvests two-column tables and labels extra columns with their headers', () => {
    const md = [
      '| Term | Meaning | Year |',
      '| --- | --- | --- |',
      '| Forgetting curve | Memory decays over time | 1885 |',
      '',
    ].join('\n');
    const { terms } = extractStudyMaterial(md);
    expect(terms).toHaveLength(1);
    expect(terms[0].term).toBe('Forgetting curve');
    expect(terms[0].definition).toBe('Meaning: Memory decays over time; Year: 1885');
    expect(terms[0].source).toBe('table');
  });

  it('harvests Q:/A: pairs as question cards', () => {
    const md = 'Q: What enzyme unzips DNA?\n\nA: Helicase separates the two strands.\n';
    const { terms } = extractStudyMaterial(md);
    expect(terms).toHaveLength(1);
    expect(terms[0].term).toBe('What enzyme unzips DNA?');
    expect(terms[0].definition).toBe('Helicase separates the two strands.');
    expect(terms[0].source).toBe('qa');
  });

  it('harvests Q/A written on adjacent lines that merge into one paragraph', () => {
    const md = 'Q: Why do practice tests beat re-reading?\nA: Retrieval strengthens the trace.\n';
    const { terms } = extractStudyMaterial(md);
    expect(terms).toHaveLength(1);
    expect(terms[0].term).toBe('Why do practice tests beat re-reading?');
    expect(terms[0].definition).toBe('Retrieval strengthens the trace.');
  });

  it('dedupes repeated terms, keeping the longest definition', () => {
    const md = '- **ATP**: energy\n- **ATP**: the energy currency of the cell\n';
    const { terms } = extractStudyMaterial(md);
    expect(terms).toHaveLength(1);
    expect(terms[0].definition).toBe('the energy currency of the cell');
  });

  it('builds a coherent section question from prose-heavy notes', () => {
    const md = '## Why the cohorts are compared\n\nThe two cohorts are compared directly so the statistic isolates the diabetes-associated difference rather than general selection.\n';
    const { terms } = extractStudyMaterial(md);
    expect(terms).toContainEqual(expect.objectContaining({
      term: 'Why are the cohorts compared?',
      definition: expect.stringContaining('compared directly'),
      source: 'section',
    }));
  });
});

describe('cloze extraction', () => {
  it('blanks bold phrases inside prose sentences', () => {
    const md = 'The bottleneck of the whole system is **selective attention**, which filters everything.\n';
    const { clozes } = extractStudyMaterial(md);
    expect(clozes.length).toBeGreaterThan(0);
    expect(clozes[0].prompt).toContain(BLANK);
    expect(clozes[0].prompt).not.toMatch(/selective attention/i);
    expect(clozes[0].answer).toBe('selective attention');
  });

  it('builds definition clozes that never leak the term inside the definition', () => {
    const md = '- **Mitochondria**: mitochondria make ATP for the cell every day\n';
    const { clozes } = extractStudyMaterial(md);
    const defCloze = clozes.find((c) => c.answer === 'Mitochondria');
    expect(defCloze).toBeDefined();
    expect(defCloze!.prompt.toLowerCase()).not.toContain('mitochondria');
    expect(defCloze!.prompt.startsWith(BLANK)).toBe(true);
  });

  it('does not create clozes from tiny fragments', () => {
    const { clozes } = extractStudyMaterial('**Hi** there.\n');
    expect(clozes).toHaveLength(0);
  });

  it('rejects generic emphasized status words and overlong emphasized claims', () => {
    const md = [
      'The pipeline is **running** while the independent verification completes.',
      '**All four candidate genes survived the expanded cohort test.** This is a strong falsification result.',
      'The headline statistic is **DPD**, the probability that one cohort has higher omega.',
    ].join('\n\n');
    const { clozes } = extractStudyMaterial(md);
    expect(clozes.some((card) => card.answer === 'running')).toBe(false);
    expect(clozes.some((card) => card.answer.startsWith('All four'))).toBe(false);
    expect(clozes.some((card) => card.answer === 'DPD')).toBe(true);
  });
});

describe('outline and stats', () => {
  it('collects headings up to depth 3 and counts words', () => {
    const md = '# Top\n\n## Mid\n\n#### Deep heading ignored\n\nSome body words here.\n';
    const { outline, stats } = extractStudyMaterial(md);
    expect(outline.map((o) => o.title)).toEqual(['Top', 'Mid']);
    expect(stats.words).toBeGreaterThan(4);
    expect(stats.readingMinutes).toBeGreaterThanOrEqual(1);
  });
});

describe('sample deck', () => {
  it('extracts a rich set from the bundled sample', () => {
    const { terms, clozes, outline } = extractStudyMaterial(SAMPLE_MARKDOWN);
    expect(terms.length).toBeGreaterThanOrEqual(12);
    expect(clozes.length).toBeGreaterThanOrEqual(8);
    expect(outline.length).toBeGreaterThanOrEqual(5);
    const sources = new Set(terms.map((t) => t.source));
    expect(sources).toContain('bold');
    expect(sources).toContain('colon');
    expect(sources).toContain('table');
    expect(sources).toContain('qa');
  });
});

describe('ids and keys', () => {
  it('hashId is stable and normalizeKey folds case, accents, punctuation', () => {
    expect(hashId('abc')).toBe(hashId('abc'));
    expect(normalizeKey('  Émile — Zola!! ')).toBe('emile zola');
  });
});

describe('sections that should not become cards', () => {
  const md = [
    '# Paper',
    '',
    '## Methods',
    '',
    'We used a **chemostat** to hold the culture at a steady density for many hours.',
    '',
    '## Glossary',
    '',
    '- **OD**: optical density',
    '- **CFU**: colony forming unit',
    '',
    '## Acknowledgements',
    '',
    'We thank the Wilson lab for the strains and the reviewers for their comments on the manuscript.',
    '',
    '## References',
    '',
    '1. Klein A. Human triallelic sites: evidence for a new mechanism. Genetics. 2001.',
    '2. Ng B. Another growth study of interest. Journal of Testing. 2005.',
    '',
  ].join('\n');
  const material = extractStudyMaterial(md);

  it('still mines glossary entries, which are prime study material', () => {
    const terms = new Map(material.terms.map((t) => [t.term, t.definition]));
    expect(terms.get('OD')).toBe('optical density');
    expect(terms.get('CFU')).toBe('colony forming unit');
  });

  it('never turns reference entries into cards', () => {
    const text = material.terms.map((t) => `${t.term} ${t.definition}`).join(' ');
    expect(text).not.toContain('Human triallelic sites');
    expect(text).not.toContain('Journal of Testing');
    expect(material.clozes.some((c) => c.section === 'References')).toBe(false);
  });

  it('skips acknowledgements and funding prose', () => {
    expect(material.terms.some((t) => t.section === 'Acknowledgements')).toBe(false);
    expect(material.clozes.some((c) => c.section === 'Acknowledgements')).toBe(false);
  });

  it('asks no "key idea" question about a glossary or contents heading', () => {
    expect(material.terms.some((t) => /Glossary/i.test(t.term))).toBe(false);
    expect(material.terms.some((t) => /References/i.test(t.term))).toBe(false);
  });

  it('still studies the real sections', () => {
    expect(material.terms.some((t) => t.section === 'Methods')).toBe(true);
  });
});
