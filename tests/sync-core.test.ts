import { describe, expect, it } from 'vitest';
import type { AppData, StudySet } from '../src/model';
import { defaultData, recordAnswer, toggleStar } from '../src/lib/store';
import {
  applyRemoteProgress,
  applyRemoteSets,
  checkSyncAccount,
  emptyRemoteIndex,
  planPush,
  progressStamp,
  progressToRemote,
  setToRemote,
  tombstoneToRemote,
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

  it('progressStamp is the max card touch time', () => {
    let p = recordAnswer({ cards: {} }, 'a', true, 100);
    p = recordAnswer(p, 'b', true, 300);
    p = recordAnswer(p, 'c', false, 200);
    expect(progressStamp(p)).toBe(300);
    expect(progressStamp({ cards: {} })).toBe(0);
  });
});

describe('checkSyncAccount', () => {
  const owner = 'owner@example.test';

  it('accepts the owner account, ignoring case and stray spacing', () => {
    expect(checkSyncAccount(owner, owner).ok).toBe(true);
    expect(checkSyncAccount(' Owner@Example.Test ', owner).ok).toBe(true);
  });

  it('rejects a different Google account and names both addresses', () => {
    const check = checkSyncAccount('someone@school.test', owner);
    expect(check.ok).toBe(false);
    expect(check.problem).toBe('wrong-account');
    expect(check.message).toContain('someone@school.test');
    expect(check.message).toContain(owner);
  });

  it('rejects an account with no email at all', () => {
    expect(checkSyncAccount(null, owner)).toMatchObject({ ok: false, problem: 'missing-email' });
    expect(checkSyncAccount('   ', owner).problem).toBe('missing-email');
  });
});
