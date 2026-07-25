import { describe, expect, it } from 'vitest';
import { checkAnswer, levenshtein, normalizeAnswer } from '../src/lib/answer';

describe('normalizeAnswer', () => {
  it('folds case, accents, punctuation, and leading articles', () => {
    expect(normalizeAnswer('  The Mitochondria!  ')).toBe('mitochondria');
    expect(normalizeAnswer('Émile-Zola')).toBe('emile zola');
    expect(normalizeAnswer('a cell')).toBe('cell');
  });
});

describe('levenshtein', () => {
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });
});

describe('checkAnswer', () => {
  it('accepts exact and case-insensitive matches', () => {
    expect(checkAnswer('Mitochondria', 'mitochondria').correct).toBe(true);
  });

  it('tolerates small typos on longer answers but not short ones', () => {
    expect(checkAnswer('mitochondira', 'mitochondria').correct).toBe(true);
    expect(checkAnswer('photosynthsis', 'photosynthesis').correct).toBe(true);
    expect(checkAnswer('DNA', 'RNA').correct).toBe(false);
    expect(checkAnswer('cat', 'car').correct).toBe(false);
  });

  it('accepts parenthetical and slash alternates', () => {
    expect(checkAnswer('ATP', 'ATP (adenosine triphosphate)').correct).toBe(true);
    expect(checkAnswer('adenosine triphosphate', 'ATP (adenosine triphosphate)').correct).toBe(true);
    expect(checkAnswer('axon', 'axon / nerve fiber').correct).toBe(true);
  });

  it('never accepts an empty answer and flags near misses as close', () => {
    expect(checkAnswer('   ', 'anything').correct).toBe(false);
    const near = checkAnswer('mitochondrxxa', 'mitochondria');
    expect(near.correct).toBe(false);
    expect(near.close).toBe(true);
  });
});
