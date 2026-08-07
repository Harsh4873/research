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
import {
  applyRemoteProgress,
  applyRemoteSets,
  checkSyncAccount,
  emptyRemoteIndex,
  planPush,
  progressToRemote,
  setToRemote,
  tombstoneToRemote,
  type RemoteIndex,
  type RemoteProgress,
  type RemoteSet,
} from './sync-core';

export interface CloudHandlers {
  onStatus: (status: SyncStatus) => void;
  /** Switch browser-local state to the authenticated account before listening. */
  onAccount: (uid: string) => AppData;
  /** Fold remote changes into app state; must return same-reference data when nothing changed. */
  onRemote: (fold: (data: AppData) => AppData) => void;
}

const PUSH_DEBOUNCE_MS = 900;

class CloudEngine {
  private handlers: CloudHandlers;
  private index: RemoteIndex = emptyRemoteIndex();
  private unsubs: Unsubscribe[] = [];
  private user: User | null = null;
  private latest: AppData | null = null;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private pushing = false;
  private status: SyncStatus = { state: 'connecting' };

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
    await getRedirectResult(firebaseAuth).catch(() => undefined);
    onAuthStateChanged(firebaseAuth, (user) => {
      this.teardownListeners();
      if (!user) {
        this.user = null;
        this.setStatus({ state: 'off' });
        return;
      }
      const check = checkSyncAccount(user.email, user.emailVerified);
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
      this.latest = this.handlers.onAccount(user.uid);
      this.user = user;
      this.listen(user);
    });
  }

  private teardownListeners() {
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
    this.index = emptyRemoteIndex();
  }

  private listen(user: User) {
    const email = user.email ?? undefined;
    this.setStatus({ state: 'syncing', email });
    const setsRef = collection(recallFirestore, 'recall_users', user.uid, 'sets');
    const progressRef = collection(recallFirestore, 'recall_users', user.uid, 'progress');

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
        (error) => this.fail(error, email),
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
        (error) => this.fail(error, email),
      ),
    );
  }

  private afterSnapshot(pendingWrites: boolean, email?: string) {
    if (this.status.state === 'error') return;
    this.setStatus({ state: pendingWrites || this.pushing ? 'syncing' : 'synced', email });
    if (this.latest) this.schedulePush();
  }

  private fail(error: unknown, email?: string) {
    const code = (error as { code?: string })?.code ?? '';
    if (code.includes('permission-denied')) {
      this.setStatus({
        state: 'error',
        email,
        error: 'Firestore denied the request. Confirm this is a verified Google session and deploy the complete shared firestore.rules file (npm run deploy:rules).',
      });
      return;
    }
    const message = code.includes('unavailable')
      ? 'Offline — changes will sync when the connection returns.'
      : `Sync failed (${code || 'unknown error'}).`;
    this.setStatus({ state: 'error', email, error: message });
  }

  /** Called on every local data change; diffs against the remote index. */
  push(data: AppData) {
    this.latest = data;
    if (!this.user) return;
    this.schedulePush();
  }

  private schedulePush() {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => void this.flush(), PUSH_DEBOUNCE_MS);
  }

  private async flush() {
    if (!this.user || !this.latest || this.pushing) return;
    const user = this.user;
    const plan = planPush(this.latest, this.index);
    if (plan.sets.length === 0 && plan.tombstones.length === 0 && plan.progress.length === 0) {
      if (plan.oversized.length > 0) {
        this.setStatus({
          state: 'error',
          email: user.email ?? undefined,
          error: 'One set is too large to sync (over ~600 KB of markdown). It stays local-only.',
        });
      }
      return;
    }
    this.pushing = true;
    this.setStatus({ state: 'syncing', email: user.email ?? undefined });
    try {
      const writes: Promise<void>[] = [];
      for (const set of plan.sets) {
        writes.push(setDoc(doc(recallFirestore, 'recall_users', user.uid, 'sets', set.id), setToRemote(set)));
      }
      for (const tomb of plan.tombstones) {
        writes.push(
          setDoc(
            doc(recallFirestore, 'recall_users', user.uid, 'sets', tomb.id),
            tombstoneToRemote(tomb.id, tomb.deletedAt, tomb.createdAt),
          ),
        );
      }
      for (const p of plan.progress) {
        writes.push(
          setDoc(
            doc(recallFirestore, 'recall_users', user.uid, 'progress', p.setId),
            progressToRemote(p.setId, p.progress, p.updatedAt),
          ),
        );
      }
      await Promise.all(writes);
      this.pushing = false;
      this.setStatus({ state: 'synced', email: user.email ?? undefined });
      // Re-check in case more changes landed while writing.
      this.schedulePush();
    } catch (error) {
      this.pushing = false;
      this.fail(error, user.email ?? undefined);
    }
  }

  async signIn(): Promise<void> {
    this.setStatus({ state: 'connecting' });
    try {
      await signInWithPopup(firebaseAuth, googleProvider);
    } catch (error) {
      const code = (error as { code?: string })?.code ?? '';
      if (code.includes('popup')) {
        // Popup blocked (common in installed PWAs) — fall back to a redirect.
        await signInWithRedirect(firebaseAuth, googleProvider).catch((e) => this.fail(e));
        return;
      }
      if (code.includes('cancelled') || code.includes('closed-by-user')) {
        this.setStatus({ state: 'off' });
        return;
      }
      this.fail(error);
    }
  }

  /** Sign out of the wrong account and reopen the Google picker. */
  async switchAccount(): Promise<void> {
    this.teardownListeners();
    this.user = null;
    this.latest = null;
    await firebaseSignOut(firebaseAuth).catch(() => undefined);
    await this.signIn();
  }

  async signOut(): Promise<void> {
    this.teardownListeners();
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
