import type { ClozeCard, TermCard } from '../model';
import { normalizeKey } from './extract';

export type QuizKind = 'def-to-term' | 'term-to-def' | 'cloze';

export interface QuizQuestion {
  cardId: string;
  kind: QuizKind;
  prompt: string;
  options: string[];
  answerIndex: number;
  section: string;
}

/** Deterministic PRNG so quizzes and tests are reproducible for a given seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(input: readonly T[], rng: () => number): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function overlapScore(a: string, b: string): number {
  const wordsA = new Set(normalizeKey(a).split(' ').filter((w) => w.length > 2));
  const wordsB = new Set(normalizeKey(b).split(' ').filter((w) => w.length > 2));
  let shared = 0;
  for (const w of wordsA) if (wordsB.has(w)) shared += 1;
  return shared;
}

/**
 * Pick distractors for `correct` from `pool`: prefer options that share words
 * with the correct answer (plausible confusions), then fill randomly.
 */
function pickDistractors(pool: string[], correct: string, count: number, rng: () => number): string[] {
  const correctKey = normalizeKey(correct);
  const unique = new Map<string, string>();
  for (const option of pool) {
    const key = normalizeKey(option);
    if (key && key !== correctKey && !unique.has(key)) unique.set(key, option);
  }
  const candidates = [...unique.values()];
  const scored = candidates
    .map((option) => ({ option, score: overlapScore(option, correct) }))
    .sort((a, b) => b.score - a.score);
  const similar = shuffle(scored.filter((s) => s.score > 0).slice(0, 6).map((s) => s.option), rng);
  const rest = shuffle(scored.filter((s) => s.score === 0).map((s) => s.option), rng);
  return [...similar, ...rest].slice(0, count);
}

export interface QuizOptions {
  count?: number;
  seed?: number;
  /** Restrict to these card ids (e.g. weak cards). */
  cardIds?: Set<string>;
}

export function buildQuiz(terms: TermCard[], clozes: ClozeCard[], opts: QuizOptions = {}): QuizQuestion[] {
  const seed = opts.seed ?? 1;
  const rng = mulberry32(seed);
  const pickedTerms = opts.cardIds ? terms.filter((t) => opts.cardIds!.has(t.id)) : terms;
  const pickedClozes = opts.cardIds ? clozes.filter((c) => opts.cardIds!.has(c.id)) : clozes;
  const questions: QuizQuestion[] = [];

  if (terms.length >= 4) {
    pickedTerms.forEach((card, index) => {
      // Section cards are already written as question → answer prompts. Asking
      // learners to infer a question from a paragraph produces unnatural quiz
      // items, so those cards always keep the question on the front.
      const askForTerm = card.source !== 'section' && index % 2 === 0;
      if (askForTerm) {
        const options = pickDistractors(terms.map((t) => t.term), card.term, 3, rng);
        if (options.length < 2) return;
        questions.push(finishQuestion(card.id, 'def-to-term', card.definition, card.term, options, card.section, rng));
      } else {
        const options = pickDistractors(terms.map((t) => t.definition), card.definition, 3, rng);
        if (options.length < 2) return;
        questions.push(finishQuestion(card.id, 'term-to-def', card.term, card.definition, options, card.section, rng));
      }
    });
  }

  const answerPool = [...new Set([...clozes.map((c) => c.answer), ...terms.map((t) => t.term)])];
  if (answerPool.length >= 4) {
    for (const cloze of pickedClozes) {
      const options = pickDistractors(answerPool, cloze.answer, 3, rng);
      if (options.length < 2) continue;
      questions.push(finishQuestion(cloze.id, 'cloze', cloze.prompt, cloze.answer, options, cloze.section, rng));
    }
  }

  const mixed = shuffle(questions, rng);
  const count = opts.count && opts.count > 0 ? Math.min(opts.count, mixed.length) : mixed.length;
  return mixed.slice(0, count);
}

function finishQuestion(
  cardId: string,
  kind: QuizKind,
  prompt: string,
  correct: string,
  distractors: string[],
  section: string,
  rng: () => number,
): QuizQuestion {
  const options = shuffle([correct, ...distractors], rng);
  return { cardId, kind, prompt, options, answerIndex: options.indexOf(correct), section };
}

export interface MatchPair {
  id: string;
  term: string;
  definition: string;
}

/** Sample up to `size` term/definition pairs for a match round. */
export function buildMatchRound(terms: TermCard[], size: number, seed: number): MatchPair[] {
  const rng = mulberry32(seed);
  return shuffle(terms, rng)
    .slice(0, Math.max(0, size))
    .map((t) => ({ id: t.id, term: t.term, definition: t.definition }));
}
