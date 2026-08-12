import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { authPersistenceReady, firebaseAuth, googleProvider, recallFirestore } from '../firebase';
import type { AppData, SyncStatus } from '../model';
import { resolveOwnerVault } from '../owner-vault';
import {
  applyRemoteProgress,
  applyRemoteSets,
  checkSyncAccount,
  classifySignInError,
  describeAuthError,
  describeSyncError,
  emptyRemoteIndex,
  planPush,
  progressToRemote,
  setToRemote,
  statusAfterSnapshot,
  syncRetryDelay,
  tombstoneToRemote,
  type RemoteIndex,
  type RemoteProgress,
  type RemoteSet,
} from './sync-core';

export interface CloudHandlers {
  onStatus: (status: SyncStatus) => void;
  /** Switch browser-local state to the shared vault before listening. */
  onAccount: (vaultId: string, legacyUid: string) => AppData;
  /** Fold remote changes into app state; must return same-reference data when nothing changed. */
  onRemote: (fold: (data: AppData) => AppData) => void;
}

const PUSH_DEBOUNCE_MS = 900;

class CloudEngine {
  private handlers: CloudHandlers;
  private index: RemoteIndex = emptyRemoteIndex();
  private unsubs: Unsubscribe[] = [];
  private user: User | null = null;
  private vaultId: string | null = null;
  private latest: AppData | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pushing = false;
  private status: SyncStatus = { state: 'connecting' };
  /** Consecutive write failures, and the moment the next push may run. */
  private writeFailures = 0;
  private retryAt = 0;
  /** Consecutive listener failures, and the pending re-listen. */
  private readFailures = 0;
  private relistenTimer: ReturnType<typeof setTimeout> | null = null;
  /** A sign-in failure survives the signed-out auth callback that follows it. */
  private authError: string | null = null;
  /** Invalidates an async token/provider check when the auth session changes. */
  private authRevision = 0;

  constructor(handlers: CloudHandlers) {
    this.handlers = handlers;
    void this.boot();
  }

  setHandlers(handlers: CloudHandlers) {
    this.handlers = handlers;
    this.handlers.onStatus(this.status);
  }

  private setStatus(status: SyncStatus) {
    this.status = status;
    this.handlers.onStatus(status);
  }

  private async boot() {
    this.setStatus({ state: 'connecting' });
    await authPersistenceReady.catch(() => undefined);
    // A redirect that came back rejected (an unauthorized domain, a disabled
    // provider) has no other way to reach the person who started it — the auth
    // callback below reports a plain signed-out session. Keep the reason.
    await getRedirectResult(firebaseAuth).catch((error) => this.failAuth(error));
    onAuthStateChanged(firebaseAuth, (user) => {
      const revision = ++this.authRevision;
      this.teardownListeners();
      this.user = null;
      this.vaultId = null;
      if (!user) {
        if (this.authError) this.setStatus({ state: 'error', error: this.authError });
        else this.setStatus({ state: 'off' });
        return;
      }
      this.authError = null;
      this.setStatus({ state: 'connecting', email: user.email ?? undefined });
      void this.activateUser(user, revision);
    });
  }

  private async activateUser(user: User, revision: number) {
    let signInProvider: string | null | undefined;
    try {
      signInProvider = (await user.getIdTokenResult()).signInProvider ?? null;
    } catch {
      // The rules require the current token's exact provider. If the claim
      // cannot be inspected, fail closed instead of trusting linked identities.
      signInProvider = undefined;
    }
    if (revision !== this.authRevision || firebaseAuth.currentUser !== user) return;
    const check = checkSyncAccount(
      user.email,
      user.emailVerified,
      signInProvider,
    );
    if (!check.ok) {
      // Stay signed in so the address is visible, but never read, write, or
      // push until the account has the claims required by the rules.
      this.user = null;
      this.setStatus({
        state: 'error',
        email: user.email ?? undefined,
        error: check.message,
        wrongAccount: true,
      });
      return;
    }
    let membership;
    try {
      membership = await resolveOwnerVault(recallFirestore, user);
    } catch (error) {
      if (revision !== this.authRevision || firebaseAuth.currentUser !== user) return;
      this.setStatus({
        state: 'error',
        email: user.email ?? undefined,
        error: error instanceof Error ? error.message : 'This account cannot access the shared owner vault.',
        wrongAccount: true,
      });
      return;
    }
    if (revision !== this.authRevision || firebaseAuth.currentUser !== user) return;
    this.latest = this.handlers.onAccount(membership.vaultId, user.uid);
    this.user = user;
    this.vaultId = membership.vaultId;
    this.listen(user, membership.vaultId);
  }

  private teardownListeners() {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    this.index = emptyRemoteIndex();
    if (this.relistenTimer) {
      clearTimeout(this.relistenTimer);
      this.relistenTimer = null;
    }
  }

  private listen(user: User, vaultId: string) {
    const email = user.email ?? undefined;
    this.setStatus({ state: 'syncing', email });
    const setsRef = collection(recallFirestore, 'recall_users', vaultId, 'sets');
    const progressRef = collection(recallFirestore, 'recall_users', vaultId, 'progress');

    this.unsubs.push(
      onSnapshot(
        setsRef,
        (snap) => {
          const remote: RemoteSet[] = [];
          for (const docSnap of snap.docs) {
            const data = docSnap.data() as RemoteSet;
            remote.push(data);
            this.index.sets.set(docSnap.id, {
              createdAt: typeof data.createdAt === 'number' ? data.createdAt : 0,
              updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
              deleted: data.deleted === true,
              deletedAt: typeof data.deletedAt === 'number' ? data.deletedAt : 0,
            });
          }
          this.handlers.onRemote((data) => applyRemoteSets(data, remote).data);
          this.afterSnapshot(snap.metadata.hasPendingWrites, email);
        },
        (error) => this.failListener(error, user),
      ),
      onSnapshot(
        progressRef,
        (snap) => {
          const docs: RemoteProgress[] = [];
          for (const docSnap of snap.docs) {
            const data = docSnap.data() as RemoteProgress;
            docs.push({ ...data, setId: docSnap.id });
            this.index.progress.set(docSnap.id, typeof data.updatedAt === 'number' ? data.updatedAt : 0);
          }
          this.handlers.onRemote((data) => {
            let next = data;
            for (const remote of docs) next = applyRemoteProgress(next, remote).data;
            return next;
          });
          this.afterSnapshot(snap.metadata.hasPendingWrites, email);
        },
        (error) => this.failListener(error, user),
      ),
    );
  }

  /**
   * A snapshot proves reads still work, so it retires a stale error instead of
   * leaving the badge stuck for the rest of the session. A write waiting on its
   * backoff keeps the state at "syncing" rather than claiming everything landed.
   */
  private afterSnapshot(pendingWrites: boolean, email?: string) {
    this.readFailures = 0;
    this.setStatus(
      statusAfterSnapshot(this.status, {
        pendingWrites,
        pushing: this.pushing,
        retrying: this.retryAt > Date.now(),
        email,
      }),
    );
    if (this.latest) this.schedulePush();
  }

  /** A rejected write: report it, then try again on a widening backoff. */
  private fail(error: unknown, email?: string) {
    const code = (error as { code?: string })?.code ?? '';
    this.writeFailures += 1;
    this.retryAt = Date.now() + syncRetryDelay(this.writeFailures);
    this.setStatus({ state: 'error', email, error: describeSyncError(code) });
    if (this.user) this.schedulePush();
  }

  /**
   * A rejected listener: Firestore drops the listener for good, so re-open it
   * after a backoff. Without this a single blip ends syncing until a reload.
   */
  private failListener(error: unknown, user: User) {
    this.readFailures += 1;
    const delay = syncRetryDelay(this.readFailures);
    const code = (error as { code?: string })?.code ?? '';
    this.teardownListeners();
    this.setStatus({ state: 'error', email: user.email ?? undefined, error: describeSyncError(code) });
    this.relistenTimer = setTimeout(() => {
      this.relistenTimer = null;
      if (this.user === user && this.vaultId) this.listen(user, this.vaultId);
    }, delay);
  }

  /** A sign-in failure, which needs the person to act rather than a retry. */
  private failAuth(error: unknown) {
    const code = (error as { code?: string })?.code ?? '';
    this.authError = describeAuthError(code);
    this.setStatus({ state: 'error', error: this.authError });
  }

  /** Called on every local data change; diffs against the remote index. */
  push(data: AppData) {
    this.latest = data;
    if (!this.user) return;
    this.schedulePush();
  }

  /** Never earlier than the backoff a failed write is still serving. */
  private schedulePush(delayMs = PUSH_DEBOUNCE_MS) {
    const wait = Math.max(delayMs, this.retryAt - Date.now());
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.flush(), wait);
  }

  /** Everything local is in the cloud: drop the backoff and any stale error. */
  private settle(email?: string) {
    this.writeFailures = 0;
    this.retryAt = 0;
    if (this.relistenTimer) return; // reads are still down — keep that on screen
    if (this.status.state !== 'synced') this.setStatus({ state: 'synced', email });
  }

  private async flush() {
    if (!this.user || !this.vaultId || !this.latest || this.pushing) return;
    if (Date.now() < this.retryAt) {
      this.schedulePush(this.retryAt - Date.now());
      return;
    }
    const user = this.user;
    const vaultId = this.vaultId;
    const plan = planPush(this.latest, this.index);
    if (plan.sets.length === 0 && plan.tombstones.length === 0 && plan.progress.length === 0) {
      if (plan.oversized.length > 0) {
        this.setStatus({
          state: 'error',
          email: user.email ?? undefined,
          error: 'One set is too large to sync (over ~600 KB of markdown). It stays local-only.',
        });
        return;
      }
      this.settle(user.email ?? undefined);
      return;
    }
    this.pushing = true;
    this.setStatus({ state: 'syncing', email: user.email ?? undefined });
    try {
      const writes: Promise<void>[] = [];
      for (const set of plan.sets) {
        writes.push(setDoc(doc(recallFirestore, 'recall_users', vaultId, 'sets', set.id), setToRemote(set)));
      }
      for (const tomb of plan.tombstones) {
        writes.push(
          setDoc(
            doc(recallFirestore, 'recall_users', vaultId, 'sets', tomb.id),
            tombstoneToRemote(tomb.id, tomb.deletedAt, tomb.createdAt),
          ),
        );
      }
      for (const p of plan.progress) {
        writes.push(
          setDoc(
            doc(recallFirestore, 'recall_users', vaultId, 'progress', p.setId),
            progressToRemote(p.setId, p.progress, p.updatedAt),
          ),
        );
      }
      await Promise.all(writes);
      this.pushing = false;
      this.settle(user.email ?? undefined);
      // Re-check in case more changes landed while writing.
      this.schedulePush();
    } catch (error) {
      this.pushing = false;
      this.fail(error, user.email ?? undefined);
    }
  }

  async signIn(): Promise<void> {
    this.authError = null;
    this.writeFailures = 0;
    this.readFailures = 0;
    this.retryAt = 0;
    this.setStatus({ state: 'connecting' });
    try {
      await signInWithPopup(firebaseAuth, googleProvider);
    } catch (error) {
      const code = (error as { code?: string })?.code ?? '';
      switch (classifySignInError(code)) {
        case 'cancelled':
          // Closing the Google window means "not now" — stay put.
          this.setStatus({ state: 'off' });
          return;
        case 'redirect':
          // Popup blocked (common in installed PWAs) — fall back to a redirect.
          await signInWithRedirect(firebaseAuth, googleProvider).catch((e) => this.failAuth(e));
          return;
        default:
          this.failAuth(error);
      }
    }
  }

  /** Sign out of the wrong account and reopen the Google picker. */
  async switchAccount(): Promise<void> {
    this.teardownListeners();
    this.user = null;
    this.vaultId = null;
    this.latest = null;
    await firebaseSignOut(firebaseAuth).catch(() => undefined);
    await this.signIn();
  }

  async signOut(): Promise<void> {
    this.teardownListeners();
    this.authError = null;
    this.writeFailures = 0;
    this.readFailures = 0;
    this.retryAt = 0;
    this.vaultId = null;
    await firebaseSignOut(firebaseAuth).catch(() => undefined);
    this.setStatus({ state: 'off' });
  }
}

let engine: CloudEngine | null = null;

/** Idempotent: repeated calls (e.g. React StrictMode) reuse one engine. */
export function startCloud(handlers: CloudHandlers): CloudEngine {
  if (engine) engine.setHandlers(handlers);
  else engine = new CloudEngine(handlers);
  return engine;
}

export type { CloudEngine };
