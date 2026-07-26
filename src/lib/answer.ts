/** Typed-answer checking with normalization and typo tolerance. */

export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(a|an|the)\s+/, '');
}

/**
 * Optimal-string-alignment distance: Levenshtein plus adjacent
 * transpositions counted as a single edit, so swap typos stay cheap.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, i) => i)];
  for (let i = 1; i <= a.length; i++) {
    const row: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      let cost = Math.min(rows[i - 1][j] + 1, row[j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cost = Math.min(cost, rows[i - 2][j - 2] + 1);
      }
      row[j] = cost;
    }
    rows.push(row);
  }
  return rows[a.length][b.length];
}

function tolerance(len: number): number {
  if (len >= 14) return 2;
  if (len >= 6) return 1;
  return 0;
}

/** Alternate acceptable phrasings of an expected answer. */
function alternatesOf(expected: string): string[] {
  const alts = new Set<string>([expected]);
  const parenMatch = expected.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    alts.add(parenMatch[1]);
    alts.add(parenMatch[2]);
  }
  for (const part of expected.split(/\s*(?:\/|,?\s+or\s+)\s*/i)) {
    if (part.trim()) alts.add(part.trim());
  }
  return [...alts];
}

export interface AnswerCheck {
  correct: boolean;
  /** Not correct, but close enough that the user likely knew it. */
  close: boolean;
}

export function checkAnswer(input: string, expected: string): AnswerCheck {
  const given = normalizeAnswer(input);
  if (!given) return { correct: false, close: false };
  let best = Infinity;
  for (const alt of alternatesOf(expected)) {
    const want = normalizeAnswer(alt);
    if (!want) continue;
    if (given === want) return { correct: true, close: false };
    const dist = levenshtein(given, want);
    if (dist <= tolerance(want.length)) return { correct: true, close: false };
    best = Math.min(best, dist - tolerance(want.length));
  }
  return { correct: false, close: best <= 2 };
}
