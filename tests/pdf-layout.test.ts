import { describe, expect, it } from 'vitest';
import {
  buildLines,
  buildMarkdown,
  classifyHeading,
  detectTableRun,
  findRunningLines,
  groupReferences,
  isPageNumber,
  joinParagraph,
  looksLikeEquation,
  median,
  orderColumns,
  parseCaption,
  type PdfLine,
  type PdfPage,
  type PdfSpan,
} from '../src/lib/pdf-layout';
import { guessFrontMatter } from '../src/lib/pdf-import';

function span(text: string, x: number, y: number, size = 10, bold = false): PdfSpan {
  return {
    text,
    x,
    y,
    width: text.length * size * 0.5,
    height: size,
    fontName: bold ? 'Times-Bold' : 'Times-Roman',
    bold,
    italic: false,
  };
}

function line(text: string, overrides: Partial<PdfLine> = {}): PdfLine {
  return {
    text,
    x: 50,
    right: 300,
    y: 100,
    size: 10,
    bold: false,
    page: 1,
    gaps: [],
    stops: [50],
    cells: [text],
    cellStops: [50],
    ...overrides,
  };
}

describe('buildLines', () => {
  it('groups spans on the same baseline and orders them left to right', () => {
    const page: PdfPage = {
      page: 1,
      width: 612,
      height: 792,
      spans: [span('world', 90, 700), span('Hello', 50, 700), span('Next line', 50, 720)],
    };
    const lines = buildLines(page);
    expect(lines.map((l) => l.text)).toEqual(['Hello world', 'Next line']);
  });

  it('marks a line bold when most of its characters are bold', () => {
    const page: PdfPage = {
      page: 1,
      width: 612,
      height: 792,
      spans: [span('Methods', 50, 100, 11, true)],
    };
    expect(buildLines(page)[0].bold).toBe(true);
  });

  it('ignores whitespace-only spans', () => {
    const page: PdfPage = { page: 1, width: 612, height: 792, spans: [span('   ', 50, 100), span('Real', 60, 100)] };
    expect(buildLines(page).map((l) => l.text)).toEqual(['Real']);
  });
});

describe('orderColumns', () => {
  it('reads a two-column page down the left column then the right', () => {
    const lines: PdfLine[] = [];
    for (let i = 0; i < 6; i++) lines.push(line(`left ${i}`, { x: 40, right: 280, y: 100 + i * 12 }));
    for (let i = 0; i < 6; i++) lines.push(line(`right ${i}`, { x: 330, right: 570, y: 100 + i * 12 }));
    const ordered = orderColumns(lines, 612);
    expect(ordered.slice(0, 6).map((l) => l.text)).toEqual(['left 0', 'left 1', 'left 2', 'left 3', 'left 4', 'left 5']);
    expect(ordered.slice(6).map((l) => l.text)[0]).toBe('right 0');
  });

  it('leaves single-column pages untouched', () => {
    const lines = Array.from({ length: 10 }, (_, i) => line(`row ${i}`, { x: 40, right: 560, y: 100 + i * 12 }));
    expect(orderColumns(lines, 612)).toEqual(lines);
  });
});

describe('running heads and page numbers', () => {
  it('finds lines repeated at the top or bottom of most pages', () => {
    const pages = Array.from({ length: 6 }, (_, p) => [
      line('Journal of Testing, Vol 4', { y: 20, page: p + 1 }),
      line(`unique body text ${p}`, { y: 300, page: p + 1 }),
      line(`${p + 1}`, { y: 770, page: p + 1 }),
    ]);
    const running = findRunningLines(pages);
    expect(running.has('journal of testing, vol #')).toBe(true);
    expect(running.has('unique body text 0')).toBe(false);
  });

  it('recognises page numbers', () => {
    expect(isPageNumber('7')).toBe(true);
    expect(isPageNumber('Page 3 of 12')).toBe(true);
    expect(isPageNumber('2026')).toBe(true);
    expect(isPageNumber('Results')).toBe(false);
  });
});

describe('classifyHeading', () => {
  it('recognises well-known section names regardless of case', () => {
    expect(classifyHeading(line('MATERIALS AND METHODS'), 10)).toEqual({ level: 2, title: 'Materials and Methods' });
    expect(classifyHeading(line('Results'), 10)?.level).toBe(2);
  });

  it('recognises numbered headings and nests by depth', () => {
    expect(classifyHeading(line('2 Experimental design', { bold: true }), 10)).toEqual({
      level: 2,
      title: '2 Experimental design',
    });
    expect(classifyHeading(line('2.1 Sample preparation', { bold: true }), 10)?.level).toBe(3);
  });

  it('treats larger or bold short lines as headings', () => {
    expect(classifyHeading(line('A New Assay', { size: 14 }), 10)?.level).toBe(2);
    expect(classifyHeading(line('A New Assay', { bold: true }), 10)?.level).toBe(3);
  });

  it('rejects body prose, captions, and long lines', () => {
    expect(classifyHeading(line('We measured growth in three media and compared the rates.'), 10)).toBeNull();
    expect(classifyHeading(line('Table 1. Doubling times', { bold: true }), 10)).toBeNull();
    expect(classifyHeading(line('this is not a heading because it is lowercase and long enough'), 10)).toBeNull();
  });
});

describe('captions and equations', () => {
  it('parses table and figure captions', () => {
    expect(parseCaption('Table 2. Growth rates')).toEqual({ label: 'Table 2', rest: 'Growth rates' });
    expect(parseCaption('Fig. 3: Curves')).toEqual({ label: 'Figure 3', rest: 'Curves' });
    expect(parseCaption('Figure 1')).toEqual({ label: 'Figure 1', rest: '' });
    expect(parseCaption('Tables are useful')).toBeNull();
  });

  it('spots equation lines by operators and symbol density', () => {
    expect(looksLikeEquation(line('μ = (ln N_t − ln N_0) / t'))).toBe(true);
    expect(looksLikeEquation(line('Growth was faster in rich medium than in minimal medium.'))).toBe(false);
  });
});

describe('paragraph assembly', () => {
  it('repairs hyphenation across line breaks', () => {
    expect(joinParagraph(['We exam-', 'ined the samples'])).toBe('We examined the samples');
  });

  it('joins wrapped lines with single spaces', () => {
    expect(joinParagraph(['The quick', 'brown fox'])).toBe('The quick brown fox');
  });

  it('groups reference lines into entries', () => {
    const refs = groupReferences(['1. Klein A. A study. Journal. 2001.', 'Continued title here', '2. Ng B. Another. 2005.']);
    expect(refs).toHaveLength(2);
    expect(refs[0]).toContain('Continued title here');
  });
});

describe('detectTableRun', () => {
  it('finds consecutive rows that share column stops', () => {
    const rows = [
      line('Medium Time n', { cells: ['Medium', 'Time', 'n'], cellStops: [50, 200, 350] }),
      line('LB 20 min 3', { cells: ['LB', '20 min', '3'], cellStops: [50, 200, 350] }),
      line('M9 60 min 3', { cells: ['M9', '60 min', '3'], cellStops: [52, 201, 349] }),
      line('Ordinary prose follows here and is not part of the table.'),
    ];
    expect(detectTableRun(rows, 0)).toBe(3);
  });

  it('returns the start index when there is no table', () => {
    expect(detectTableRun([line('just prose')], 0)).toBe(0);
  });
});

describe('buildMarkdown', () => {
  it('assembles sections, captions, tables, equations, and references', () => {
    const lines: PdfLine[] = [
      line('Introduction', { y: 100 }),
      line('Bacteria grow at different rates in different media.', { y: 120 }),
      line('Methods', { y: 200 }),
      line('μ = (ln N_t − ln N_0) / t', { y: 220 }),
      line('Table 1. Doubling times', { y: 260 }),
      line('Medium Time', { y: 275, cells: ['Medium', 'Time'], cellStops: [50, 200] }),
      line('LB 20 min', { y: 290, cells: ['LB', '20 min'], cellStops: [50, 200] }),
      line('References', { y: 400 }),
      line('1. Klein A. An older growth study. Old Journal. 2001.', { y: 420 }),
    ];
    const { markdown, counts } = buildMarkdown(lines);
    expect(markdown).toContain('## Introduction');
    expect(markdown).toContain('Bacteria grow at different rates');
    expect(markdown).toContain('## Methods');
    expect(markdown).toContain('```math');
    expect(markdown).toContain('#### Table 1. Doubling times');
    expect(markdown).toContain('| Medium | Time |');
    expect(markdown).toContain('1. Klein A. An older growth study');
    expect(counts.sections).toBeGreaterThanOrEqual(3);
    expect(counts.equations).toBe(1);
    expect(counts.tables).toBe(1);
  });

  it('starts a new paragraph after a large vertical gap', () => {
    const { markdown } = buildMarkdown([
      line('First paragraph text here.', { y: 100 }),
      line('Still the first paragraph.', { y: 112 }),
      line('A separate paragraph entirely.', { y: 200 }),
    ]);
    const paragraphs = markdown.split('\n\n');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toContain('Still the first paragraph.');
  });
});

describe('guessFrontMatter', () => {
  it('takes the largest first-page text as the title and the following line as authors', () => {
    const first = [
      line('Journal of Testing', { size: 8, y: 20 }),
      line('Measuring bacterial growth precisely', { size: 18, y: 60 }),
      line('Ana Rivera, Chidi Okafor, Lee Park', { size: 11, y: 90 }),
      line('Abstract', { size: 11, y: 130 }),
    ];
    const guessed = guessFrontMatter(first, 'fallback');
    expect(guessed.title).toBe('Measuring bacterial growth precisely');
    expect(guessed.authors).toEqual(['Ana Rivera', 'Chidi Okafor', 'Lee Park']);
  });

  it('falls back to the supplied name when the page has nothing usable', () => {
    expect(guessFrontMatter([], 'my-paper').title).toBe('my-paper');
  });
});

describe('median', () => {
  it('handles odd, even, and empty inputs', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});
