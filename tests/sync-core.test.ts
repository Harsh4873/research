import { describe, expect, it } from 'vitest';
import type { AppData, StudySet, SyncStatus } from '../src/model';
import { defaultData, recordAnswer, toggleStar } from '../src/lib/store';
import {
  applyRemoteProgress,
  applyRemoteSets,
  checkSyncAccount,
  classifySignInError,
  describeAuthError,
  describeSyncError,
  emptyRemoteIndex,
  planPush,
  progressStamp,
  recordBestMatch,
  progressToRemote,
  setToRemote,
  statusAfterSnapshot,
  syncRetryDelay,
  tombstoneToRemote,
  SYNC_RETRY_MAX_MS,
  type RemoteIndex,
  type RemoteSet,
} from '../src/lib/sync-core';

function makeSet(id: string, updatedAt: number, markdown = `# ${id}`): StudySet {
  return { id, title: id, markdown, createdAt: 1, updatedAt };
}

function dataWith(sets: StudySet[], extra: Partial<AppData> = {}): AppData {
  return { ...defaultData(), sets, ...extra };
}

function remoteLive(id: string, updatedAt: number, markdown = `# remote ${id}`): RemoteSet {
  return { id, title: `remote ${id}`, markdown, createdAt: 1, updatedAt };
}

function remoteTombstone(id: string, deletedAt: number): RemoteSet {
  return { id, title: 'Deleted set', markdown: '', createdAt: 1, updatedAt: deletedAt, deleted: true, deletedAt };
}

describe('applyRemoteSets', () => {
  it('adds unknown remote sets and replaces older local copies', () => {
    const local = dataWith([makeSet('a', 10)]);
    const { data, changed } = applyRemoteSets(local, [remoteLive('a', 20), remoteLive('b', 5)]);
    expect(changed).toBe(true);
    expect(data.sets.find((s) => s.id === 'a')?.markdown).toBe('# remote a');
    expect(data.sets.some((s) => s.id === 'b')).toBe(true);
  });

  it('keeps newer local edits and reports no change for stale remotes', () => {
    const local = dataWith([makeSet('a', 30)]);
    const { data, changed } = applyRemoteSets(local, [remoteLive('a', 20)]);
    expect(changed).toBe(false);
    expect(data).toBe(local);
    expect(data.sets[0].markdown).toBe('# a');
  });

  it('applies remote tombstones, removing the set and its progress', () => {
    let local = dataWith([makeSet('a', 10)]);
    local = { ...local, progress: { a: { cards: {} } } };
    const { data, changed } = applyRemoteSets(local, [remoteTombstone('a', 20)]);
    expect(changed).toBe(true);
    expect(data.sets).toHaveLength(0);
    expect(data.progress.a).toBeUndefined();
    expect(data.tombstones.a).toBe(20);
  });

  it('lets a local edit made after the remote delete survive (revival)', () => {
    const local = dataWith([makeSet('a', 30)]);
    const { data, changed } = applyRemoteSets(local, [remoteTombstone('a', 20)]);
    expect(changed).toBe(false);
    expect(data.sets).toHaveLength(1);
    expect(data.tombstones.a).toBeUndefined();
    // The next push re-uploads the newer set over the remote tombstone.
    const plan = planPush(data, indexFrom([remoteTombstone('a', 20)]));
    expect(plan.sets.map((s) => s.id)).toEqual(['a']);
    expect(plan.tombstones).toHaveLength(0);
  });

  it('does not resurrect a set deleted locally until the tombstone is pushed', () => {
    const local = dataWith([], { tombstones: { a: 50 } });
    const { data, changed } = applyRemoteSets(local, [remoteLive('a', 40)]);
    expect(changed).toBe(false);
    expect(data.sets).toHaveLength(0);
  });

  it('revives when the remote copy is newer than the local tombstone', () => {
    const local = dataWith([], { tombstones: { a: 50 } });
    const { data } = applyRemoteSets(local, [remoteLive('a', 60)]);
    expect(data.sets).toHaveLength(1);
    expect(data.tombstones.a).toBeUndefined();
  });
});

describe('applyRemoteProgress', () => {
  it('merges per card by most recent touch and keeps the fastest match time', () => {
    let localProgress = recordAnswer({ cards: {} }, 'c1', true, 100);
    localProgress = recordAnswer(localProgress, 'c2', false, 200);
    localProgress = { ...localProgress, bestMatchMs: 9000 };
    const local = dataWith([makeSet('a', 1)], { progress: { a: localProgress } });

    const remote = progressToRemote(
      'a',
      {
        cards: {
          c1: { box: 1, seen: 5, correct: 2, wrong: 3, starred: true, last: 50 }, // older, loses
          c2: { box: 3, seen: 4, correct: 4, wrong: 0, starred: false, last: 300 }, // newer, wins
          c3: { box: 2, seen: 1, correct: 1, wrong: 0, starred: false, last: 400 }, // new card
        },
        bestMatchMs: 7000,
      },
      400,
    );

    const { data, changed } = applyRemoteProgress(local, remote);
    expect(changed).toBe(true);
    const merged = data.progress.a;
    expect(merged.cards.c1.box).toBe(2); // local kept
    expect(merged.cards.c2.box).toBe(3); // remote won
    expect(merged.cards.c3).toBeDefined();
    expect(merged.bestMatchMs).toBe(7000);
    expect(merged.updatedAt).toBe(401); // local c1 must be repaired back to cloud
  });

  it('is a no-op when remote holds nothing newer', () => {
    const progress = recordAnswer({ cards: {} }, 'c1', true, 500);
    const local = dataWith([makeSet('a', 1)], { progress: { a: progress } });
    const remote = progressToRemote('a', recordAnswer({ cards: {} }, 'c1', false, 100), 100);
    const { data, changed } = applyRemoteProgress(local, remote);
    expect(changed).toBe(false);
    expect(data).toBe(local);
  });

  it('ignores progress for sets tombstoned locally', () => {
    const local = dataWith([], { tombstones: { a: 10 } });
    const remote = progressToRemote('a', recordAnswer({ cards: {} }, 'c1', true, 5), 5);
    expect(applyRemoteProgress(local, remote).changed).toBe(false);
  });
});

function indexFrom(remote: RemoteSet[], progress: Record<string, number> = {}): RemoteIndex {
  const index = emptyRemoteIndex();
  for (const r of remote) {
    index.sets.set(r.id, {
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      deleted: r.deleted === true,
      deletedAt: r.deletedAt ?? 0,
    });
  }
  for (const [id, at] of Object.entries(progress)) index.progress.set(id, at);
  return index;
}

describe('planPush', () => {
  it('pushes only strictly newer sets, tombstones, and progress', () => {
    const progress = toggleStar(recordAnswer({ cards: {} }, 'c1', true, 500), 'c2', 600);
    const data = dataWith([makeSet('new', 100), makeSet('same', 50)], {
      tombstones: { gone: 70 },
      progress: { new: progress, same: { cards: {} } },
    });
    const index = indexFrom([remoteLive('same', 50), remoteLive('gone', 60)], { same: 999 });
    const plan = planPush(data, index);
    expect(plan.sets.map((s) => s.id)).toEqual(['new']);
    expect(plan.tombstones).toEqual([{ id: 'gone', deletedAt: 70, createdAt: 1 }]);
    expect(plan.progress).toEqual([{ setId: 'new', progress, updatedAt: 600 }]);
  });

  it('pushes a best-match improvement even when no card changed', () => {
    const progress = { cards: {}, bestMatchMs: 4_000, updatedAt: 700 };
    const data = dataWith([makeSet('match', 100)], { progress: { match: progress } });
    const plan = planPush(data, indexFrom([remoteLive('match', 100)], { match: 600 }));
    expect(plan.progress).toEqual([{ setId: 'match', progress, updatedAt: 700 }]);
  });

  it('skips tombstones already deleted remotely and oversized sets', () => {
    const big = makeSet('big', 10, 'x'.repeat(600_001));
    const data = dataWith([big], { tombstones: { gone: 70 } });
    const plan = planPush(data, indexFrom([remoteTombstone('gone', 80)]));
    expect(plan.tombstones).toHaveLength(0);
    expect(plan.sets).toHaveLength(0);
    expect(plan.oversized).toEqual(['big']);
  });

  it('does not push a tombstone over a newer remote edit', () => {
    const data = dataWith([], { tombstones: { a: 50 } });
    const plan = planPush(data, indexFrom([remoteLive('a', 60)]));
    expect(plan.tombstones).toHaveLength(0);
  });
});

describe('progress-level mutations', () => {
  it('stamps a best-match result so it is eligible for sync with no cards', () => {
    const progress = recordBestMatch({ cards: {} }, 4_000, 700);
    expect(progress).toEqual({ cards: {}, bestMatchMs: 4_000, updatedAt: 700 });
    expect(progressStamp(progress)).toBe(700);
  });
});

describe('remote document builders', () => {
  it('round numbers and shape docs for Firestore rules', () => {
    const set = makeSet('a', 10.6);
    expect(setToRemote(set).updatedAt).toBe(11);
    const tomb = tombstoneToRemote('a', 20.2, 5.8);
    expect(tomb).toMatchObject({ deleted: true, deletedAt: 20, createdAt: 6, markdown: '' });
    const progress = progressToRemote('a', { cards: { c: { box: 2, seen: 1, correct: 1, wrong: 0, starred: false, last: 3.9 } } }, 3.9);
    expect(progress.cards.c.last).toBe(4);
    expect(progress.updatedAt).toBe(4);
    expect('bestMatchMs' in progress).toBe(false);
  });

  it('progressStamp includes progress-level changes as well as card touches', () => {
    let p = recordAnswer({ cards: {} }, 'a', true, 100);
    p = recordAnswer(p, 'b', true, 300);
    p = recordAnswer(p, 'c', false, 200);
    expect(progressStamp(p)).toBe(300);
    expect(progressStamp({ cards: {} })).toBe(0);
    expect(progressStamp({ cards: {}, bestMatchMs: 4000, updatedAt: 500 })).toBe(500);
  });
});

/**
 * The shared ruleset pins a set's creation time once the doc exists:
 *
 *   request.resource.data.createdAt == resource.data.createdAt
 *   && request.resource.data.updatedAt >= resource.data.updatedAt
 *
 * A push that breaks this is rejected forever, so model it here and check the
 * documents the client actually plans to write against it.
 */
function keepsRecallSetHistory(stored: RemoteSet, outgoing: RemoteSet): boolean {
  return outgoing.createdAt === stored.createdAt && outgoing.updatedAt >= stored.updatedAt;
}

describe('createdAt is the cloud’s to keep', () => {
  it('pushes the stored creation time, not the local one', () => {
    // Device B made its copy of the same set at a different moment — a content
    // refresh that renumbers creation time used to deadlock sync right here.
    const local = { ...makeSet('a', 200), createdAt: 999 };
    const stored = { ...remoteLive('a', 100), createdAt: 1 };
    const plan = planPush(dataWith([local]), indexFrom([stored]));

    expect(plan.sets).toHaveLength(1);
    expect(setToRemote(plan.sets[0]).createdAt).toBe(1);
    expect(keepsRecallSetHistory(stored, setToRemote(plan.sets[0]))).toBe(true);
  });

  it('keeps the local creation time when the cloud has no copy yet', () => {
    const local = { ...makeSet('fresh', 200), createdAt: 999 };
    const plan = planPush(dataWith([local]), emptyRemoteIndex());
    expect(setToRemote(plan.sets[0]).createdAt).toBe(999);
  });

  it('reviving a remotely deleted set keeps the tombstone’s creation time', () => {
    const local = { ...makeSet('a', 300), createdAt: 999 };
    const stored = { ...remoteTombstone('a', 200), createdAt: 42 };
    const plan = planPush(dataWith([local]), indexFrom([stored]));

    expect(plan.sets).toHaveLength(1);
    expect(keepsRecallSetHistory(stored, setToRemote(plan.sets[0]))).toBe(true);
  });

  it('adopts the cloud creation time even when the local copy is newer', () => {
    const local = { ...makeSet('a', 300), createdAt: 999 };
    const { data, changed } = applyRemoteSets(dataWith([local]), [{ ...remoteLive('a', 100), createdAt: 1 }]);
    expect(changed).toBe(true);
    expect(data.sets[0].createdAt).toBe(1);
    expect(data.sets[0].markdown).toBe('# a'); // the newer local content survives
    expect(data.sets[0].updatedAt).toBe(300);
  });

  it('converges: after one snapshot a blind push would still be accepted', () => {
    const stored = { ...remoteLive('a', 100), createdAt: 1 };
    const local = { ...makeSet('a', 300), createdAt: 999 };
    // Snapshot first, then push with an index that has not been filled in yet.
    const { data } = applyRemoteSets(dataWith([local]), [stored]);
    const plan = planPush(data, emptyRemoteIndex());
    expect(keepsRecallSetHistory(stored, setToRemote(plan.sets[0]))).toBe(true);
  });
});

describe('failures recover', () => {
  it('backs off further after each failure and then stops growing', () => {
    expect(syncRetryDelay(0)).toBe(0);
    expect(syncRetryDelay(1)).toBe(2_000);
    expect(syncRetryDelay(2)).toBe(4_000);
    expect(syncRetryDelay(3)).toBe(8_000);
    expect(syncRetryDelay(4)).toBe(16_000);
    expect(syncRetryDelay(5)).toBe(SYNC_RETRY_MAX_MS);
    expect(syncRetryDelay(400)).toBe(SYNC_RETRY_MAX_MS);
  });

  it('lets a later snapshot clear an error instead of freezing the session', () => {
    const failed: SyncStatus = { state: 'error', email: 'owner@example.test', error: 'Sync failed (internal).' };
    const next = statusAfterSnapshot(failed, {
      pendingWrites: false,
      pushing: false,
      retrying: false,
      email: 'owner@example.test',
    });
    expect(next).toEqual({ state: 'synced', email: 'owner@example.test' });
  });

  it('says syncing, not synced, while a failed write waits on its backoff', () => {
    const failed: SyncStatus = { state: 'error', error: 'Sync failed (internal).' };
    const next = statusAfterSnapshot(failed, { pendingWrites: false, pushing: false, retrying: true });
    expect(next.state).toBe('syncing');
    expect(next.error).toBeUndefined();
  });

  it('keeps an account the rules will never accept on screen', () => {
    const wrong: SyncStatus = { state: 'error', error: 'Verify the address.', wrongAccount: true };
    expect(statusAfterSnapshot(wrong, { pendingWrites: false, pushing: false, retrying: false })).toBe(wrong);
  });

  it('never tells anyone to redeploy the rules over a denied request', () => {
    const denied = describeSyncError('permission-denied');
    expect(denied).not.toMatch(/deploy|firestore\.rules|npm run/i);
    expect(denied).toMatch(/retr/i);
    expect(describeSyncError('unavailable')).toMatch(/offline/i);
    expect(describeSyncError('')).toMatch(/unknown error/i);
    expect(describeSyncError('firestore/permission-denied')).toBe(denied);
  });
});

describe('sign-in errors', () => {
  it('treats a cancelled popup request as a cancellation, not a popup block', () => {
    // Both codes contain "popup"; matching on that substring made this branch
    // unreachable and sent anyone who dismissed the window off to a redirect.
    expect(classifySignInError('auth/cancelled-popup-request')).toBe('cancelled');
    expect(classifySignInError('auth/popup-closed-by-user')).toBe('cancelled');
    expect(classifySignInError('auth/user-cancelled')).toBe('cancelled');
  });

  it('redirects only when the browser refused the window', () => {
    expect(classifySignInError('auth/popup-blocked')).toBe('redirect');
    expect(classifySignInError('auth/operation-not-supported-in-this-environment')).toBe('redirect');
  });

  it('reports anything else as a failure', () => {
    expect(classifySignInError('auth/unauthorized-domain')).toBe('failed');
    expect(classifySignInError('')).toBe('failed');
  });

  it('explains a redirect that came back rejected', () => {
    expect(describeAuthError('auth/unauthorized-domain')).toMatch(/domain/i);
    expect(describeAuthError('auth/operation-not-allowed')).toMatch(/switched off/i);
    expect(describeAuthError('auth/network-request-failed')).toMatch(/connection/i);
    expect(describeAuthError('auth/weird-new-code')).toContain('auth/weird-new-code');
    expect(describeAuthError('')).toMatch(/unknown error/i);
  });
});

describe('checkSyncAccount', () => {
  it('accepts a verified account whose token says Google', () => {
    expect(checkSyncAccount('owner@example.test', true, 'google.com').ok).toBe(true);
    expect(checkSyncAccount(' someone@school.test ', true, 'google.com').ok).toBe(true);
  });

  it('rejects an unverified account and names its address', () => {
    const check = checkSyncAccount('someone@school.test', false, 'google.com');
    expect(check.ok).toBe(false);
    expect(check.problem).toBe('unverified-email');
    expect(check.message).toContain('someone@school.test');
  });

  it('rejects an account with no email at all', () => {
    expect(checkSyncAccount(null, true, 'google.com')).toMatchObject({ ok: false, problem: 'missing-email' });
    expect(checkSyncAccount('   ', true, 'google.com').problem).toBe('missing-email');
  });

  it('rejects a non-Google token even when Google is linked to the account', () => {
    expect(checkSyncAccount('owner@example.test', true, 'password'))
      .toMatchObject({ ok: false, problem: 'non-google-provider' });
  });

  it('fails closed when the token provider cannot be inspected', () => {
    expect(checkSyncAccount('owner@example.test', true, undefined).problem)
      .toBe('non-google-provider');
  });
});
