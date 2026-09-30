import { describe, expect, it } from 'vitest';
import { findItemSpan, findQuotePage, pageText } from '../src/lib/locate-quote';

describe('findQuotePage', () => {
  const pages = [
    'Introduction. This paper asks whether rho is essential.',
    'We found that rho is required for growth on solid medium (p < 0.001).',
    'Discussion. Further work is needed.',
  ];

  it('lands on the page that contains the sentence', () => {
    expect(findQuotePage(pages, 'We found that rho is required for growth on solid medium (p < 0.001).')).toBe(1);
  });

  it('ignores case, punctuation, and a line-break hyphen', () => {
    const broken = ['Results. Termina-\ntion was rho dependent in this strain.'];
    expect(findQuotePage(broken, 'Termination was rho dependent in this strain.')).toBe(0);
  });

  it('returns -1 when the quote is not in the document', () => {
    expect(findQuotePage(pages, 'The crystal structure was solved at 1.8 angstroms.')).toBe(-1);
  });
});

describe('findItemSpan', () => {
  it('covers the text items that make up the quote', () => {
    const items = ['We found that', 'rho is required', 'for growth.', 'Next sentence.'];
    expect(pageText(items)).toContain('rho is required');
    expect(findItemSpan(items, 'rho is required for growth.')).toEqual({ start: 1, end: 2 });
  });

  it('still matches when the PDF split a hyphenated word', () => {
    const items = ['Termina-', 'tion was rho', 'dependent here.'];
    expect(findItemSpan(items, 'Termination was rho dependent here.')).toEqual({ start: 0, end: 2 });
  });
});
