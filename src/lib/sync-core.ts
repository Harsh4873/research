import type { AppData, CardProgress, SetProgress, StudySet, SyncStatus } from '../model';

/** Firestore document shapes for `recall_users/{vaultId}/sets` and `/progress`. */
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
export type AccountProblem = 'missing-email' | 'unverified-email' | 'non-google-provider';

export interface AccountCheck {
  ok: boolean;
  problem?: AccountProblem;
  message?: string;
}

/**
 * Both approved identities resolve to the same `recall_users/{vaultId}`
 * library. Check the claims needed by the Firestore policy before opening
 * listeners so an invalid session gets a useful message instead of a bare
 * `permission-denied`.
 */
export function checkSyncAccount(
  email: string | null | undefined,
  emailVerified: boolean,
  signInProvider: string | null | undefined,
): AccountCheck {
  const signedIn = (email ?? '').trim();
  if (!signedIn) {
    return {
      ok: false,
      problem: 'missing-email',
      message: 'This Google account has no email address, so Research cannot create a private synced workspace.',
    };
  }
  if (!emailVerified) {
    return {
      ok: false,
      problem: 'unverified-email',
      message: `Verify ${signedIn} with Google before syncing Research.`,
    };
  }
  const googleSession = signInProvider === 'google.com';
  if (!googleSession) {
    return {
      ok: false,
      problem: 'non-google-provider',
      message: 'Research syncs only sessions signed in with Google. Sign in again with the Google button.',
    };
  }
  return { ok: true };
}

/** The moment this progress was last touched, including progress-level fields. */
export function progressStamp(progress: SetProgress): number {
  let stamp = Number.isFinite(progress.updatedAt) ? Math.floor(progress.updatedAt ?? 0) : 0;
  for (const card of Object.values(progress.cards)) {
    if (card.last > stamp) stamp = card.last;
  }
  return stamp;
}

/** Stamp a progress-only mutation (for example a faster matching time). */
export function recordBestMatch(progress: SetProgress, bestMatchMs: number, updatedAt: number): SetProgress {
  return { ...progress, bestMatchMs, updatedAt };
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
    } else if (local.createdAt !== incoming.createdAt) {
      // The cloud copy owns creation time — the rules pin `createdAt` immutable
      // once a set doc exists. Adopt it even when the local copy is the newer
      // one, so the two devices stop disagreeing about when the set was made.
      sets = sets.map((s) => (s.id === r.id ? { ...s, createdAt: incoming.createdAt } : s));
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
  let localMustRepublish = false;
  const cards = { ...local.cards };
  const remoteCardIds = new Set<string>();

  for (const [cardId, rawCard] of Object.entries(remote.cards ?? {})) {
    const incoming = sanitizeRemoteCard(rawCard);
    if (!incoming) continue;
    remoteCardIds.add(cardId);
    const existing = cards[cardId];
    if (!existing || incoming.last > existing.last) {
      cards[cardId] = incoming;
      if (!existing || JSON.stringify(existing) !== JSON.stringify(incoming)) changed = true;
    } else if (JSON.stringify(existing) !== JSON.stringify(incoming)) {
      localMustRepublish = true;
    }
  }
  if (Object.keys(local.cards).some((cardId) => !remoteCardIds.has(cardId))) localMustRepublish = true;

  let bestMatchMs = local.bestMatchMs;
  if (typeof remote.bestMatchMs === 'number' && remote.bestMatchMs > 0 && (!bestMatchMs || remote.bestMatchMs < bestMatchMs)) {
    bestMatchMs = remote.bestMatchMs;
    changed = true;
  } else if (bestMatchMs && bestMatchMs !== remote.bestMatchMs) {
    localMustRepublish = true;
  }

  let mergedStamp = Math.max(progressStamp(local), remote.updatedAt);
  if (localMustRepublish && mergedStamp <= remote.updatedAt) mergedStamp = remote.updatedAt + 1;
  if (remote.updatedAt > progressStamp(local) || mergedStamp > progressStamp(local)) changed = true;
  if (!changed) return { data, changed };
  const merged: SetProgress = { cards, updatedAt: mergedStamp };
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

/**
 * Work out what local state is strictly newer than the last-known remote.
 *
 * A set that already exists in the cloud is planned with the cloud's own
 * `createdAt`: the ruleset pins creation time immutable, so pushing a local
 * `createdAt` that another device never saw is rejected forever. Creation time
 * is the cloud's to keep; only the content and `updatedAt` are ours to change.
 */
export function planPush(data: AppData, index: RemoteIndex): PushPlan {
  const plan: PushPlan = { sets: [], tombstones: [], progress: [], oversized: [] };

  for (const set of data.sets) {
    const meta = index.sets.get(set.id);
    const remoteStamp = meta ? (meta.deleted ? tombstoneTime(meta) : meta.updatedAt) : -1;
    if (set.updatedAt > remoteStamp) {
      if (set.markdown.length > MAX_REMOTE_MARKDOWN) plan.oversized.push(set.id);
      else plan.sets.push(meta ? { ...set, createdAt: meta.createdAt } : set);
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

/* ---------- Failure handling ---------- */

export const SYNC_RETRY_BASE_MS = 2_000;
export const SYNC_RETRY_MAX_MS = 30_000;

/**
 * How long to wait before retrying after `failures` consecutive failures.
 * Doubles each time and stops at {@link SYNC_RETRY_MAX_MS} so a failure that
 * never clears costs one attempt a minute rather than freezing sync for good.
 */
export function syncRetryDelay(failures: number): number {
  if (failures <= 0) return 0;
  const exponent = Math.min(failures - 1, 20);
  return Math.min(SYNC_RETRY_BASE_MS * 2 ** exponent, SYNC_RETRY_MAX_MS);
}

/** Firestore and Auth report `code` as `permission-denied` or `auth/…`. */
function bareCode(code: string): string {
  const trimmed = (code ?? '').trim();
  const slash = trimmed.lastIndexOf('/');
  return slash === -1 ? trimmed : trimmed.slice(slash + 1);
}

/**
 * Explain a failed Firestore read or write. Never tells the owner to redeploy
 * the ruleset: a rejection is nearly always this session or this document, and
 * sending someone to re-publish a correct policy hides the real problem.
 */
export function describeSyncError(code: string): string {
  switch (bareCode(code)) {
    case 'permission-denied':
      return 'Firestore turned down this request for the signed-in account. Sync retries on its own; if it keeps failing, sign out and back in with a verified Google account.';
    case 'unauthenticated':
      return 'The Google session expired. Sign out and back in to resume syncing.';
    case 'unavailable':
    case 'deadline-exceeded':
      return 'Offline — changes will sync when the connection returns.';
    case 'resource-exhausted':
      return 'Firestore is rate limiting this account. Sync will slow down and try again.';
    case 'failed-precondition':
      return 'Firestore could not use this browser session. Close other tabs of Research and try again.';
    default:
      return `Sync failed (${bareCode(code) || 'unknown error'}). Retrying…`;
  }
}

/** What to do about a `signInWithPopup` rejection. */
export type SignInOutcome = 'cancelled' | 'redirect' | 'failed';

/**
 * Auth codes are matched exactly. Substring matching cannot work here:
 * `auth/cancelled-popup-request` contains "popup" as well, so a "does it
 * mention a popup" test swallows every cancellation and pushes the person
 * through a redirect they never asked for.
 */
export function classifySignInError(code: string): SignInOutcome {
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return 'cancelled';
    case 'auth/popup-blocked':
    case 'auth/operation-not-supported-in-this-environment':
    case 'auth/web-storage-unsupported':
      return 'redirect';
    default:
      return 'failed';
  }
}

/** Explain a Google sign-in failure, including one returned by a redirect. */
export function describeAuthError(code: string): string {
  switch (code) {
    case 'auth/unauthorized-domain':
      return 'Google sign-in is not allowed from this domain. Add it to the Firebase Authentication authorized domains.';
    case 'auth/operation-not-allowed':
      return 'Google sign-in is switched off for this Firebase project.';
    case 'auth/network-request-failed':
      return 'Could not reach Google to finish signing in. Check the connection and try again.';
    case 'auth/popup-blocked':
      return 'The browser blocked the Google sign-in window. Allow pop-ups for this site, or try again.';
    case 'auth/account-exists-with-different-credential':
      return 'That address is already signed up with a different provider. Use the original sign-in method.';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid':
      return 'This build has an invalid Firebase API key, so sign-in cannot start.';
    default:
      return `Google sign-in failed (${code || 'unknown error'}).`;
  }
}

/** Inputs a snapshot carries about how far behind the local copy is. */
export interface SnapshotState {
  pendingWrites: boolean;
  pushing: boolean;
  /** A failed write is waiting on its backoff. */
  retrying: boolean;
  email?: string;
}

/**
 * Status after a snapshot arrives. A snapshot proves reads work, so it clears a
 * stale error — otherwise one blip freezes the badge for the whole session. The
 * exception is an account the rules will never accept, which no amount of
 * incoming data can fix.
 */
export function statusAfterSnapshot(current: SyncStatus, snapshot: SnapshotState): SyncStatus {
  if (current.state === 'error' && current.wrongAccount === true) return current;
  const busy = snapshot.pendingWrites || snapshot.pushing || snapshot.retrying;
  return { state: busy ? 'syncing' : 'synced', email: snapshot.email };
}
