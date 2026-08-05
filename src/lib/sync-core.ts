import type { AppData, CardProgress, SetProgress, StudySet } from '../model';

/** Firestore document shapes for `recall_users/{uid}/sets` and `/progress`. */
export interface RemoteSet {
  id: string;
  title: string;
  markdown: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
  deletedAt?: number;
}

export interface RemoteProgress {
  setId: string;
  cards: Record<string, CardProgress>;
  bestMatchMs?: number;
  updatedAt: number;
}

export interface RemoteSetMeta {
  createdAt: number;
  updatedAt: number;
  deleted: boolean;
  deletedAt: number;
}

/** Last-known remote state, maintained from snapshot listeners. */
export interface RemoteIndex {
  sets: Map<string, RemoteSetMeta>;
  /** setId → remote progress updatedAt */
  progress: Map<string, number>;
}

export function emptyRemoteIndex(): RemoteIndex {
  return { sets: new Map(), progress: new Map() };
}

/** Why sync cannot use the signed-in account, or `null` when it can. */
export type AccountProblem = 'missing-email' | 'wrong-account';

export interface AccountCheck {
  ok: boolean;
  problem?: AccountProblem;
  message?: string;
}

/**
 * Sync is single-account by design: sets live under `recall_users/{uid}`, so a
 * second Google account would be a second, empty library even if the rules let
 * it in. Checking the address before opening a listener turns a bare
 * `permission-denied` into an answer.
 */
export function checkSyncAccount(email: string | null | undefined, owner: string): AccountCheck {
  const signedIn = (email ?? '').trim().toLowerCase();
  const expected = owner.trim().toLowerCase();
  if (!signedIn) {
    return {
      ok: false,
      problem: 'missing-email',
      message: `This Google account has no email address, so sync cannot tell whose sets these are. Sign in as ${owner}.`,
    };
  }
  if (signedIn !== expected) {
    return {
      ok: false,
      problem: 'wrong-account',
      message: `Signed in as ${email}. Your sets sync under ${owner}, and every account gets its own separate library — switch accounts to sync this device.`,
    };
  }
  return { ok: true };
}

/** The moment this progress was last touched, derived from its cards. */
export function progressStamp(progress: SetProgress): number {
  let stamp = 0;
  for (const card of Object.values(progress.cards)) {
    if (card.last > stamp) stamp = card.last;
  }
  return stamp;
}

const MAX_REMOTE_MARKDOWN = 600_000;

function tombstoneTime(meta: { updatedAt: number; deletedAt?: number }): number {
  return meta.deletedAt ?? meta.updatedAt;
}

function sanitizeRemoteSet(raw: RemoteSet): StudySet | null {
  if (typeof raw.id !== 'string' || typeof raw.markdown !== 'string') return null;
  return {
    id: raw.id,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Untitled set',
    markdown: raw.markdown,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  };
}

/**
 * Fold a remote sets snapshot into local data. Live docs win over older local
 * copies; tombstones remove local sets unless the local copy was edited after
 * the deletion (that edit revives the set on the next push).
 */
export function applyRemoteSets(data: AppData, remote: RemoteSet[]): { data: AppData; changed: boolean } {
  let changed = false;
  let sets = data.sets;
  let progress = data.progress;
  let tombstones = data.tombstones;

  for (const r of remote) {
    const local = sets.find((s) => s.id === r.id);
    if (r.deleted === true) {
      const deletedAt = tombstoneTime(r);
      if (local && local.updatedAt > deletedAt) continue; // local edit outlives the delete
      if (local) {
        sets = sets.filter((s) => s.id !== r.id);
        if (progress[r.id]) {
          progress = { ...progress };
          delete progress[r.id];
        }
        changed = true;
      }
      if ((tombstones[r.id] ?? 0) < deletedAt) {
        tombstones = { ...tombstones, [r.id]: deletedAt };
        changed = true;
      }
      continue;
    }

    const incoming = sanitizeRemoteSet(r);
    if (!incoming) continue;
    const localTombstone = tombstones[r.id] ?? 0;
    if (!local && localTombstone >= incoming.updatedAt) continue; // deletion pending push
    if (!local) {
      sets = [incoming, ...sets];
      if (localTombstone) {
        tombstones = { ...tombstones };
        delete tombstones[r.id];
      }
      changed = true;
    } else if (incoming.updatedAt > local.updatedAt) {
      sets = sets.map((s) => (s.id === r.id ? incoming : s));
      changed = true;
    }
  }

  return changed ? { data: { ...data, sets, progress, tombstones }, changed } : { data, changed };
}

function sanitizeRemoteCard(raw: unknown): CardProgress | null {
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

/**
 * Merge remote progress per card: the entry touched most recently wins.
 * Best match times keep the fastest of the two.
 */
export function applyRemoteProgress(data: AppData, remote: RemoteProgress): { data: AppData; changed: boolean } {
  if (data.tombstones[remote.setId] && !data.sets.some((s) => s.id === remote.setId)) {
    return { data, changed: false };
  }
  const local: SetProgress = data.progress[remote.setId] ?? { cards: {} };
  let changed = false;
  const cards = { ...local.cards };

  for (const [cardId, rawCard] of Object.entries(remote.cards ?? {})) {
    const incoming = sanitizeRemoteCard(rawCard);
    if (!incoming) continue;
    const existing = cards[cardId];
    if (!existing || incoming.last > existing.last) {
      cards[cardId] = incoming;
      if (!existing || JSON.stringify(existing) !== JSON.stringify(incoming)) changed = true;
    }
  }

  let bestMatchMs = local.bestMatchMs;
  if (typeof remote.bestMatchMs === 'number' && remote.bestMatchMs > 0 && (!bestMatchMs || remote.bestMatchMs < bestMatchMs)) {
    bestMatchMs = remote.bestMatchMs;
    changed = true;
  }

  if (!changed) return { data, changed };
  const merged: SetProgress = { cards };
  if (bestMatchMs) merged.bestMatchMs = bestMatchMs;
  return { data: { ...data, progress: { ...data.progress, [remote.setId]: merged } }, changed: true };
}

export interface PushPlan {
  sets: StudySet[];
  tombstones: Array<{ id: string; deletedAt: number; createdAt: number }>;
  progress: Array<{ setId: string; progress: SetProgress; updatedAt: number }>;
  /** Set ids skipped because their markdown exceeds the remote size cap. */
  oversized: string[];
}

/** Work out what local state is strictly newer than the last-known remote. */
export function planPush(data: AppData, index: RemoteIndex): PushPlan {
  const plan: PushPlan = { sets: [], tombstones: [], progress: [], oversized: [] };

  for (const set of data.sets) {
    const meta = index.sets.get(set.id);
    const remoteStamp = meta ? (meta.deleted ? tombstoneTime(meta) : meta.updatedAt) : -1;
    if (set.updatedAt > remoteStamp) {
      if (set.markdown.length > MAX_REMOTE_MARKDOWN) plan.oversized.push(set.id);
      else plan.sets.push(set);
    }
  }

  for (const [id, deletedAt] of Object.entries(data.tombstones)) {
    if (data.sets.some((s) => s.id === id)) continue;
    const meta = index.sets.get(id);
    if (meta?.deleted) continue; // already tombstoned remotely
    if (meta && meta.updatedAt > deletedAt) continue; // remote edit outlives the delete
    plan.tombstones.push({ id, deletedAt, createdAt: meta?.createdAt ?? deletedAt });
  }

  for (const [setId, progress] of Object.entries(data.progress)) {
    if (!data.sets.some((s) => s.id === setId)) continue;
    const stamp = progressStamp(progress);
    if (stamp > (index.progress.get(setId) ?? -1)) {
      plan.progress.push({ setId, progress, updatedAt: stamp });
    }
  }

  return plan;
}

export function setToRemote(set: StudySet): RemoteSet {
  return {
    id: set.id,
    title: set.title.slice(0, 240),
    markdown: set.markdown,
    createdAt: Math.round(set.createdAt),
    updatedAt: Math.round(set.updatedAt),
  };
}

export function tombstoneToRemote(id: string, deletedAt: number, createdAt: number): RemoteSet {
  return {
    id,
    title: 'Deleted set',
    markdown: '',
    createdAt: Math.round(createdAt),
    updatedAt: Math.round(deletedAt),
    deleted: true,
    deletedAt: Math.round(deletedAt),
  };
}

export function progressToRemote(setId: string, progress: SetProgress, updatedAt: number): RemoteProgress {
  const cards: Record<string, CardProgress> = {};
  for (const [cardId, card] of Object.entries(progress.cards)) {
    cards[cardId] = {
      box: card.box,
      seen: card.seen,
      correct: card.correct,
      wrong: card.wrong,
      starred: card.starred === true,
      last: Math.round(card.last),
    };
  }
  const doc: RemoteProgress = { setId, cards, updatedAt: Math.round(updatedAt) };
  if (progress.bestMatchMs && progress.bestMatchMs > 0) doc.bestMatchMs = Math.round(progress.bestMatchMs);
  return doc;
}
