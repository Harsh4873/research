import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../src/lib/markdown';
import { speakableSegments, splitSentences } from '../src/lib/readaloud';

describe('splitSentences', () => {
  it('splits on sentence boundaries and collapses whitespace', () => {
    expect(splitSentences('First one. Second one! Third?')).toEqual(['First one.', 'Second one!', 'Third?']);
    expect(splitSentences('  spaced   out  text  ')).toEqual(['spaced out text']);
  });

  it('does not split on abbreviations mid-word and keeps decimals intact', () => {
    // No space after the period inside 3.14, so it stays one chunk.
    expect(splitSentences('Pi is 3.14 exactly.')).toEqual(['Pi is 3.14 exactly.']);
  });

  it('chops very long clause-only text so utterances stay short', () => {
    const long = Array.from({ length: 20 }, (_, i) => `clause number ${i} here`).join(', ') + '.';
    const parts = splitSentences(long);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(241);
  });

  it('returns nothing for empty input', () => {
    expect(splitSentences('   ')).toEqual([]);
  });
});

describe('speakableSegments', () => {
  it('reads headings, paragraphs, and list items in order with block indices', () => {
    const doc = parseMarkdown('# Title\n\nAn intro sentence. And another.\n\n- first item\n- second item\n');
    const segments = speakableSegments(doc.blocks);
    expect(segments.map((s) => s.text)).toEqual([
      'Title',
      'An intro sentence.',
      'And another.',
      'first item',
      'second item',
    ]);
    // Heading is block 0, paragraph block 1, list block 2.
    expect(segments.map((s) => s.blockIndex)).toEqual([0, 1, 1, 2, 2]);
  });

  it('skips code blocks and horizontal rules', () => {
    const doc = parseMarkdown('Read me.\n\n```js\nconst x = 1;\n```\n\n---\n\nAnd me.\n');
    expect(speakableSegments(doc.blocks).map((s) => s.text)).toEqual(['Read me.', 'And me.']);
  });

  it('reads a two-column table as term/definition pairs', () => {
    const doc = parseMarkdown('| Term | Meaning |\n| --- | --- |\n| ATP | energy currency |\n| DNA | genetic code |\n');
    const segments = speakableSegments(doc.blocks);
    expect(segments.map((s) => s.text)).toEqual(['ATP: energy currency.', 'DNA: genetic code.']);
  });

  it('reads blockquote contents mapped to the quote block', () => {
    const doc = parseMarkdown('Before.\n\n> Quoted wisdom here.\n');
    const segments = speakableSegments(doc.blocks);
    expect(segments.some((s) => s.text === 'Quoted wisdom here.')).toBe(true);
  });

  it('produces nothing for a code-only document', () => {
    const doc = parseMarkdown('```\njust code\n```\n');
    expect(speakableSegments(doc.blocks)).toEqual([]);
  });
});
