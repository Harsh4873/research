import type { AppData, CardProgress, SetProgress, StudySet, Theme } from '../model';
import { emptyCardProgress } from '../model';
import { hashId } from './extract';

const KEY = 'recall.data.v1';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const fallback = memoryStorage();

export function defaultStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* storage blocked */
  }
  return fallback;
}

export function defaultData(): AppData {
  return { version: 1, sets: [], progress: {}, tombstones: {}, theme: 'auto' };
}

function isTheme(v: unknown): v is Theme {
  return v === 'auto' || v === 'light' || v === 'dark';
}

function sanitizeSet(raw: unknown): StudySet | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.markdown !== 'string') return null;
  return {
    id: r.id,
    title: typeof r.title === 'string' && r.title.trim() ? r.title.trim() : 'Untitled set',
    markdown: r.markdown,
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
  };
}

function sanitizeCard(raw: unknown): CardProgress | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const box = typeof r.box === 'number' && r.box >= 0 && r.box <= 3 ? (Math.round(r.box) as CardProgress['box']) : 0;
  return {
    box,
    seen: typeof r.seen === 'number' ? r.seen : 0,
    correct: typeof r.correct === 'number' ? r.correct : 0,
    wrong: typeof r.wrong === 'number' ? r.wrong : 0,
    starred: r.starred === true,
    last: typeof r.last === 'number' ? r.last : 0,
  };
}

function sanitize(raw: unknown): AppData {
  if (typeof raw !== 'object' || raw === null) return defaultData();
  const r = raw as Record<string, unknown>;
  const data = defaultData();
  if (Array.isArray(r.sets)) {
    for (const candidate of r.sets) {
      const set = sanitizeSet(candidate);
      if (set && !data.sets.some((s) => s.id === set.id)) data.sets.push(set);
    }
  }
  if (typeof r.progress === 'object' && r.progress !== null) {
    for (const [setId, rawProgress] of Object.entries(r.progress as Record<string, unknown>)) {
      if (typeof rawProgress !== 'object' || rawProgress === null) continue;
      const cards: Record<string, CardProgress> = {};
      const rp = rawProgress as Record<string, unknown>;
      if (typeof rp.cards === 'object' && rp.cards !== null) {
        for (const [cardId, rawCard] of Object.entries(rp.cards as Record<string, unknown>)) {
          const card = sanitizeCard(rawCard);
          if (card) cards[cardId] = card;
        }
      }
      const progress: SetProgress = { cards };
      if (typeof rp.bestMatchMs === 'number' && rp.bestMatchMs > 0) progress.bestMatchMs = rp.bestMatchMs;
      data.progress[setId] = progress;
    }
  }
  if (typeof r.tombstones === 'object' && r.tombstones !== null) {
    for (const [setId, at] of Object.entries(r.tombstones as Record<string, unknown>)) {
      if (typeof at === 'number' && at > 0) data.tombstones[setId] = at;
    }
  }
  if (isTheme(r.theme)) data.theme = r.theme;
  return data;
}

export function loadData(storage: StorageLike = defaultStorage()): AppData {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return defaultData();
    return sanitize(JSON.parse(raw));
  } catch {
    return defaultData();
  }
}

export function saveData(data: AppData, storage: StorageLike = defaultStorage()): void {
  try {
    storage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* quota exceeded or storage blocked; keep the in-memory copy */
  }
}

export function createSet(title: string, markdown: string, now: number): StudySet {
  const id = `${now.toString(36)}-${hashId(markdown).slice(0, 6)}`;
  return { id, title: title.trim() || 'Untitled set', markdown, createdAt: now, updatedAt: now };
}

export function upsertSet(data: AppData, set: StudySet): AppData {
  const exists = data.sets.some((s) => s.id === set.id);
  return {
    ...data,
    sets: exists ? data.sets.map((s) => (s.id === set.id ? set : s)) : [set, ...data.sets],
  };
}

export function deleteSet(data: AppData, setId: string, now: number): AppData {
  const progress = { ...data.progress };
  delete progress[setId];
  return {
    ...data,
    sets: data.sets.filter((s) => s.id !== setId),
    progress,
    tombstones: { ...data.tombstones, [setId]: now },
  };
}

export function getProgress(data: AppData, setId: string): SetProgress {
  return data.progress[setId] ?? { cards: {} };
}

export function withProgress(data: AppData, setId: string, progress: SetProgress): AppData {
  return { ...data, progress: { ...data.progress, [setId]: progress } };
}

/**
 * Mastery ladder update: a correct answer climbs one box (unseen jumps to
 * "almost"), a wrong answer drops back to "learning".
 */
export function recordAnswer(progress: SetProgress, cardId: string, correct: boolean, now: number): SetProgress {
  const card = progress.cards[cardId] ?? emptyCardProgress();
  const box = correct ? (Math.min(3, Math.max(1, card.box) + 1) as CardProgress['box']) : 1;
  return {
    ...progress,
    cards: {
      ...progress.cards,
      [cardId]: {
        ...card,
        box,
        seen: card.seen + 1,
        correct: card.correct + (correct ? 1 : 0),
        wrong: card.wrong + (correct ? 0 : 1),
        last: now,
      },
    },
  };
}

export function toggleStar(progress: SetProgress, cardId: string, now: number): SetProgress {
  const card = progress.cards[cardId] ?? emptyCardProgress();
  return { ...progress, cards: { ...progress.cards, [cardId]: { ...card, starred: !card.starred, last: now } } };
}

/** Average mastery of the given cards, 0–100. */
export function masteryPercent(progress: SetProgress, cardIds: string[]): number {
  if (cardIds.length === 0) return 0;
  let total = 0;
  for (const id of cardIds) total += progress.cards[id]?.box ?? 0;
  return Math.round((total / (cardIds.length * 3)) * 100);
}

export function weakCardIds(progress: SetProgress, cardIds: string[]): Set<string> {
  return new Set(cardIds.filter((id) => (progress.cards[id]?.box ?? 0) < 3));
}

const EXPORT_FORMAT = 'recall-set';

export function exportSetJson(set: StudySet): string {
  return JSON.stringify(
    { format: EXPORT_FORMAT, version: 1, title: set.title, markdown: set.markdown, exportedAt: set.updatedAt },
    null,
    2,
  );
}

export function parseSetExport(json: string): { title: string; markdown: string } {
  const raw: unknown = JSON.parse(json);
  if (typeof raw !== 'object' || raw === null) throw new Error('Not a Recall set export.');
  const r = raw as Record<string, unknown>;
  if (r.format !== EXPORT_FORMAT || typeof r.markdown !== 'string') throw new Error('Not a Recall set export.');
  return { title: typeof r.title === 'string' ? r.title : 'Imported set', markdown: r.markdown };
}
