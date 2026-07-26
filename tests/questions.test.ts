import { describe, expect, it } from 'vitest';
import { extractStudyMaterial } from '../src/lib/extract';
import { SAMPLE_MARKDOWN } from '../src/lib/sample';
import { buildMatchRound, buildQuiz, mulberry32, shuffle } from '../src/lib/questions';

const material = extractStudyMaterial(SAMPLE_MARKDOWN);

describe('mulberry32 + shuffle', () => {
  it('is deterministic per seed and does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffle(input, mulberry32(42));
    const b = shuffle(input, mulberry32(42));
    const c = shuffle(input, mulberry32(7));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...a].sort((x, y) => x - y)).toEqual(input);
  });
});

describe('buildQuiz', () => {
  it('builds well-formed questions with the right answer present exactly once', () => {
    const quiz = buildQuiz(material.terms, material.clozes, { count: 10, seed: 3 });
    expect(quiz).toHaveLength(10);
    for (const q of quiz) {
      expect(q.options.length).toBeGreaterThanOrEqual(3);
      expect(q.options.length).toBeLessThanOrEqual(4);
      expect(new Set(q.options).size).toBe(q.options.length);
      expect(q.options[q.answerIndex]).toBeDefined();
      if (q.kind === 'def-to-term') {
        const card = material.terms.find((t) => t.id === q.cardId)!;
        expect(q.prompt).toBe(card.definition);
        expect(q.options[q.answerIndex]).toBe(card.term);
      }
    }
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const a = buildQuiz(material.terms, material.clozes, { count: 8, seed: 11 });
    const b = buildQuiz(material.terms, material.clozes, { count: 8, seed: 11 });
    expect(a).toEqual(b);
  });

  it('respects a card filter', () => {
    const allowed = new Set(material.terms.slice(0, 5).map((t) => t.id));
    const quiz = buildQuiz(material.terms, material.clozes, { seed: 1, cardIds: allowed });
    expect(quiz.length).toBeGreaterThan(0);
    for (const q of quiz) expect(allowed.has(q.cardId)).toBe(true);
  });

  it('returns no term questions when there are fewer than four terms', () => {
    const few = material.terms.slice(0, 3);
    const quiz = buildQuiz(few, [], { seed: 1 });
    expect(quiz).toHaveLength(0);
  });
});

describe('buildMatchRound', () => {
  it('samples the requested number of unique pairs', () => {
    const round = buildMatchRound(material.terms, 6, 5);
    expect(round).toHaveLength(6);
    expect(new Set(round.map((p) => p.id)).size).toBe(6);
  });

  it('caps at the available terms', () => {
    const round = buildMatchRound(material.terms.slice(0, 2), 6, 5);
    expect(round).toHaveLength(2);
  });
});
