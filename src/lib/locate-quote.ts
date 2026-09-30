/**
 * Find a quoted sentence inside PDF text or the extracted article.
 * Matching ignores case, punctuation, and line-break hyphenation so a claim
 * still lands on the passage it came from.
 */

export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, '')
    .replace(/-\s+/g, '')
    .replace(/-/g, '')
    .replace(/[“”«»]/g, '')
    .replace(/[‘’]/g, '')
    .replace(/[^a-z0-9%.\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Longest distinctive phrases to try, then shorter windows of the same quote. */
export function quoteNeedles(quote: string): string[] {
  const words = normalizeForMatch(quote).split(' ').filter((word) => word.length > 1);
  if (words.length === 0) return [];
  const needles: string[] = [words.join(' ')];
  const size = Math.min(8, words.length);
  if (words.length > size) {
    needles.push(words.slice(0, size).join(' '));
    const mid = Math.max(0, Math.floor((words.length - size) / 2));
    needles.push(words.slice(mid, mid + size).join(' '));
    needles.push(words.slice(-size).join(' '));
  }
  if (words.length >= 5) {
    for (let i = 0; i <= words.length - 5; i += 3) {
      needles.push(words.slice(i, i + 5).join(' '));
    }
  }
  return [...new Set(needles.filter((needle) => needle.length >= 6))];
}

function joined(items: string[]): { text: string; ranges: Array<{ start: number; end: number }> } {
  let text = '';
  const ranges: Array<{ start: number; end: number }> = [];
  let glue = false;
  for (const item of items) {
    // An item that ends in a hyphen is a word split across a line.
    const broken = /[-–—]\s*$/.test(item);
    const piece = normalizeForMatch(item);
    if (!piece) {
      ranges.push({ start: text.length, end: text.length });
      continue;
    }
    if (text.length > 0 && !glue) text += ' ';
    const start = text.length;
    text += piece;
    ranges.push({ start, end: text.length });
    glue = broken;
  }
  return { text, ranges };
}

/** Page text in the same normalized form `findQuotePage` searches. */
export function pageText(items: string[]): string {
  return joined(items).text;
}

function firstHit(text: string, quote: string): { at: number; needle: string } | null {
  for (const needle of quoteNeedles(quote)) {
    const at = text.indexOf(needle);
    if (at >= 0) return { at, needle };
  }
  return null;
}

/** 0-based page index, or -1 when the quote is not in any page. */
export function findQuotePage(pages: string[], quote: string): number {
  const norms = pages.map((page) => normalizeForMatch(page));
  for (const needle of quoteNeedles(quote)) {
    const index = norms.findIndex((text) => text.includes(needle));
    if (index >= 0) return index;
  }
  return -1;
}

/** Inclusive item indexes that cover the quote, or null. */
export function findItemSpan(items: string[], quote: string): { start: number; end: number } | null {
  const { text, ranges } = joined(items);
  const hit = firstHit(text, quote);
  if (!hit) return null;
  const endAt = hit.at + hit.needle.length;
  let start = -1;
  let end = -1;
  ranges.forEach((range, index) => {
    if (range.end <= range.start) return;
    if (range.end > hit.at && range.start < endAt) {
      if (start < 0) start = index;
      end = index;
    }
  });
  if (start < 0 || end < 0) return null;
  return { start, end };
}
