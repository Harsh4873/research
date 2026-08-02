import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../src/lib/markdown';
import {
  buildPaperViews,
  collectNumbers,
  findNumbers,
  parseSupplementLine,
  scoreClaim,
  searchPaper,
} from '../src/lib/paper-view';

const PAPER = [
  '---',
  'title: A study of things',
  'pmcid: PMC123456',
  '---',
  '',
  '# A study of things',
  '',
  '> Journal of Testing (2024) · DOI 10.1234/test · PMID 12345678',
  '',
  '## Abstract',
  '',
  '- **Results**: We found that treatment raised survival by 18% compared with placebo.',
  '',
  '## Methods',
  '',
  'We enrolled 240 participants over 18 months at three sites and measured outcomes every 4 weeks.',
  '',
  '#### Equation 1',
  '',
  '```math',
  'S(t) = exp(-lambda t)',
  '```',
  '',
  '## Results',
  '',
  '#### Table 1. Outcomes by arm',
  '',
  '| Arm | Survival | n |',
  '| --- | --- | --- |',
  '| Treatment | 78% | 120 |',
  '| Placebo | 60% | 120 |',
  '',
  'We found that survival was significantly higher in the treatment arm (p < 0.001).',
  '',
  '#### Figure 1. Survival curves',
  '',
  'Kaplan-Meier curves for both arms across 18 months of follow-up.',
  '',
  '## Discussion',
  '',
  'Our results suggest that the treatment is effective in this population, though further work is needed.',
  '',
  'Taken together, these findings support wider use of the treatment.',
  '',
  '## Data availability',
  '',
  'All sequencing data are available from the NCBI SRA under accession PRJNA123456.',
  '',
  '## Supplementary material',
  '',
  '- **S1 Table**: Full participant characteristics by site. (file: `study-s01-table.xlsx`)',
  '- **S2 Fig**: Sensitivity analyses. (file: `study-s02-fig.pdf`)',
  '',
  '## References',
  '',
  '1. Klein A. An older study. Old Journal. 2001.',
  '',
].join('\n');

const doc = parseMarkdown(PAPER);
const views = buildPaperViews(doc, 'PMC123456');

describe('data view extraction', () => {
  it('collects tables with their label, caption, and section', () => {
    expect(views.tables).toHaveLength(1);
    expect(views.tables[0].label).toBe('Table 1');
    expect(views.tables[0].caption).toBe('Outcomes by arm');
    expect(views.tables[0].section).toBe('Results');
    expect(views.tables[0].block.header).toEqual(['Arm', 'Survival', 'n']);
  });

  it('collects equations with their maths intact', () => {
    expect(views.equations).toHaveLength(1);
    expect(views.equations[0].label).toBe('Equation 1');
    expect(views.equations[0].code).toBe('S(t) = exp(-lambda t)');
  });

  it('collects figures and attaches the caption paragraph', () => {
    expect(views.figures).toHaveLength(1);
    expect(views.figures[0].label).toBe('Figure 1');
    expect(views.figures[0].caption).toContain('Survival curves');
    expect(views.figures[0].caption).toContain('Kaplan-Meier');
  });

  it('collects the data availability statement', () => {
    expect(views.availability).toHaveLength(1);
    expect(views.availability[0].text).toContain('PRJNA123456');
  });

  it('links supplementary files to their PMC location', () => {
    expect(views.supplements).toHaveLength(2);
    expect(views.supplements[0].name).toBe('S1 Table');
    expect(views.supplements[0].file).toBe('study-s01-table.xlsx');
    expect(views.supplements[0].href).toBe(
      'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC123456/bin/study-s01-table.xlsx',
    );
  });
});

describe('parseSupplementLine', () => {
  it('keeps hyphenated filenames out of the name', () => {
    const item = parseSupplementLine(
      '**CD016013-SUP-01-searchStrategy.html**: Search strategies (file: `CD016013-SUP-01-searchStrategy.html`)',
      'PMC9',
    )!;
    expect(item.name).toBe('CD016013-SUP-01-searchStrategy.html');
    expect(item.description).toBe('Search strategies');
  });

  it('handles an entry with no file reference', () => {
    const item = parseSupplementLine('**Appendix A**: Extra methods detail')!;
    expect(item).toMatchObject({ name: 'Appendix A', description: 'Extra methods detail' });
    expect(item.file).toBeUndefined();
  });
});

describe('claims', () => {
  it('finds "we found" style statements and ranks them', () => {
    const texts = views.claims.map((c) => c.text);
    expect(texts.some((t) => t.includes('survival was significantly higher'))).toBe(true);
    expect(texts.some((t) => t.includes('raised survival by 18%'))).toBe(true);
  });

  it('classifies conclusions separately from findings', () => {
    const kinds = new Set(views.claims.map((c) => c.kind));
    expect(kinds.has('finding')).toBe(true);
    expect(kinds.has('conclusion')).toBe(true);
  });

  it('scores hedged sentences below concrete ones', () => {
    const concrete = scoreClaim('We found that survival rose by 18% in the treated group (p < 0.001).', 'Results')!;
    const hedged = scoreClaim('Our results suggest the treatment may help, though further work is needed.', 'Discussion')!;
    expect(concrete.score).toBeGreaterThan(hedged.score);
  });

  it('ignores ordinary prose and captions', () => {
    expect(scoreClaim('The samples were stored at four degrees before processing in the laboratory.', 'Methods')).toBeNull();
    expect(scoreClaim('Table 2. We found the following characteristics of the study population here.', 'Results')).toBeNull();
  });

  it('never mines the reference list', () => {
    expect(views.claims.some((c) => c.section === 'References')).toBe(false);
  });
});

describe('numbers', () => {
  it('finds percentages, p-values, counts, and durations', () => {
    const found = findNumbers('Survival rose 18% (p < 0.001) among n = 240 participants over 18 months.');
    expect(found.join(' ')).toContain('18%');
    expect(found.join(' ')).toContain('p < 0.001');
    expect(found.some((v) => v.includes('240'))).toBe(true);
  });

  it('ignores digits that belong to identifiers', () => {
    const found = findNumbers('See DOI 10.1234/test and PMID 12345678 for details.');
    expect(found).toEqual([]);
  });

  it('ignores plain years', () => {
    expect(findNumbers('The study ran in 2019 and 2020.')).toEqual([]);
  });

  it('collects numbers with the sentence they came from', () => {
    const numbers = collectNumbers(doc);
    const hit = numbers.find((n) => n.value.includes('18%'));
    expect(hit?.text).toContain('survival');
  });
});

describe('search', () => {
  it('finds every occurrence with ranges for highlighting', () => {
    const hits = searchPaper(doc, 'survival');
    expect(hits.length).toBeGreaterThan(1);
    for (const hit of hits) {
      for (const [start, end] of hit.ranges) {
        expect(hit.text.slice(start, end).toLowerCase()).toBe('survival');
      }
    }
  });

  it('searches table contents too', () => {
    expect(searchPaper(doc, 'Placebo').some((hit) => hit.kind === 'table')).toBe(true);
  });

  it('needs at least two characters', () => {
    expect(searchPaper(doc, 'a')).toEqual([]);
  });
});

describe('skim', () => {
  it('gives each section a gist and its key numbers', () => {
    const methods = views.skim.find((s) => s.title === 'Methods')!;
    expect(methods.gist).toContain('enrolled 240 participants');
    expect(methods.numbers.length).toBeGreaterThan(0);
    expect(methods.words).toBeGreaterThan(5);
  });

  it('keeps sections in document order', () => {
    const titles = views.skim.map((s) => s.title);
    expect(titles.indexOf('Methods')).toBeLessThan(titles.indexOf('Results'));
    expect(titles.indexOf('Results')).toBeLessThan(titles.indexOf('Discussion'));
  });
});
