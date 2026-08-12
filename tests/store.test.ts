import { describe, expect, it } from 'vitest';
import {
  createSet,
  defaultData,
  deleteSet,
  exportSetJson,
  getProgress,
  hasAccountData,
  loadAccountData,
  loadData,
  loadOrAdoptOwnerVaultData,
  masteryPercent,
  memoryStorage,
  nextDataTimestamp,
  parseSetExport,
  recordAnswer,
  readActiveAccountId,
  saveAccountData,
  saveData,
  toggleStar,
  upsertSet,
  weakCardIds,
  withProgress,
  writeActiveAccountId,
} from '../src/lib/store';

describe('persistence round-trip', () => {
  it('starts a fresh signed-out browser with an empty private workspace', () => {
    const storage = memoryStorage();
    expect(readActiveAccountId(storage)).toBeNull();
    expect(loadData(storage)).toEqual({
      version: 1,
      sets: [],
      progress: {},
      tombstones: {},
      theme: 'auto',
    });
  });

  it('saves and reloads sets and progress', () => {
    const storage = memoryStorage();
    let data = defaultData();
    const set = createSet('Bio', '# Bio\n- **ATP**: energy\n', 1000);
    data = upsertSet(data, set);
    data = withProgress(data, set.id, recordAnswer(getProgress(data, set.id), 'card1', true, 2000));
    saveData(data, storage);

    const loaded = loadData(storage);
    expect(loaded.sets).toHaveLength(1);
    expect(loaded.sets[0].title).toBe('Bio');
    expect(loaded.progress[set.id].cards.card1.box).toBe(2);
    expect(loaded.progress[set.id].cards.card1.seen).toBe(1);
  });

  it('survives corrupt storage payloads', () => {
    const storage = memoryStorage();
    storage.setItem('recall.data.v1', '{not json');
    expect(loadData(storage)).toEqual(defaultData());
    storage.setItem('recall.data.v1', JSON.stringify({ version: 9, sets: [{ bogus: true }], theme: 'neon' }));
    const loaded = loadData(storage);
    expect(loaded.sets).toEqual([]);
    expect(loaded.theme).toBe('auto');
  });

  it('keeps browser-local libraries isolated by account UID', () => {
    const storage = memoryStorage();
    const first = upsertSet(defaultData(), createSet('First', '# First', 1));
    const second = upsertSet(defaultData(), createSet('Second', '# Second', 2));

    saveAccountData('uid-one', first, storage);
    saveAccountData('uid-two', second, storage);
    writeActiveAccountId('uid-two', storage);

    expect(hasAccountData('uid-one', storage)).toBe(true);
    expect(hasAccountData('uid-two', storage)).toBe(true);
    expect(loadAccountData('uid-one', storage).sets[0].title).toBe('First');
    expect(loadAccountData('uid-two', storage).sets[0].title).toBe('Second');
    expect(readActiveAccountId(storage)).toBe('uid-two');
  });

  it('adopts the authenticated legacy account cache into the shared vault once', () => {
    const storage = memoryStorage();
    const legacy = upsertSet(defaultData(), createSet('Legacy reader', '# Kept', 10));
    saveAccountData('legacy-uid', legacy, storage);

    const adopted = loadOrAdoptOwnerVaultData(
      'shared-vault',
      'legacy-uid',
      'legacy-uid',
      legacy,
      storage,
    );
    expect(adopted.sets[0].title).toBe('Legacy reader');

    const laterLegacy = upsertSet(legacy, createSet('Do not replay', '# Old cache', 20));
    expect(loadOrAdoptOwnerVaultData(
      'shared-vault',
      'legacy-uid',
      'legacy-uid',
      laterLegacy,
      storage,
    ).sets).toHaveLength(1);
  });

  it('can recover the authenticated UID cache when another account was last active', () => {
    const storage = memoryStorage();
    const owner = upsertSet(defaultData(), createSet('Owner cache', '# Owner', 10));
    const unrelated = upsertSet(defaultData(), createSet('Other cache', '# Other', 11));
    saveAccountData('owner-uid', owner, storage);

    const adopted = loadOrAdoptOwnerVaultData(
      'shared-vault',
      'owner-uid',
      'other-uid',
      unrelated,
      storage,
    );
    expect(adopted.sets.map((set) => set.title)).toEqual(['Owner cache']);
  });

  it('does not import a local cache tied only to a different legacy account', () => {
    const storage = memoryStorage();
    const unrelated = upsertSet(defaultData(), createSet('Other cache', '# Other', 11));
    const adopted = loadOrAdoptOwnerVaultData(
      'shared-vault',
      'owner-uid',
      'other-uid',
      unrelated,
      storage,
    );
    expect(adopted).toEqual(defaultData());
  });
});

describe('logical mutation clock', () => {
  it('advances past a future set timestamp observed from another device', () => {
    const data = upsertSet(defaultData(), {
      ...createSet('Future', '# Future', 1),
      createdAt: 50_000,
      updatedAt: 80_000,
    });
    expect(nextDataTimestamp(data, 1_000)).toBe(80_001);
  });

  it('also remembers future deletions and progress while offline', () => {
    const data = defaultData();
    data.tombstones.deleted = 90_000;
    data.progress.study = {
      updatedAt: 110_000,
      cards: {
        card: { box: 1, seen: 1, correct: 0, wrong: 1, starred: false, last: 100_000 },
      },
    };
    expect(nextDataTimestamp(data, 1_000)).toBe(110_001);
  });
});

describe('mastery ladder', () => {
  it('climbs on correct answers and drops to learning on wrong ones', () => {
    let progress = getProgress(defaultData(), 'set');
    progress = recordAnswer(progress, 'c', true, 1); // unseen -> 2
    expect(progress.cards.c.box).toBe(2);
    progress = recordAnswer(progress, 'c', true, 2); // -> 3
    expect(progress.cards.c.box).toBe(3);
    progress = recordAnswer(progress, 'c', true, 3); // stays 3
    expect(progress.cards.c.box).toBe(3);
    progress = recordAnswer(progress, 'c', false, 4); // -> 1
    expect(progress.cards.c.box).toBe(1);
    expect(progress.cards.c.correct).toBe(3);
    expect(progress.cards.c.wrong).toBe(1);
  });

  it('computes mastery percent and weak cards', () => {
    let progress = getProgress(defaultData(), 'set');
    progress = recordAnswer(progress, 'a', true, 1);
    progress = recordAnswer(progress, 'a', true, 2); // a mastered (3)
    progress = recordAnswer(progress, 'b', false, 3); // b learning (1)
    expect(masteryPercent(progress, ['a', 'b'])).toBe(Math.round((4 / 6) * 100));
    expect([...weakCardIds(progress, ['a', 'b', 'c'])]).toEqual(['b', 'c']);
    expect(masteryPercent(progress, [])).toBe(0);
  });

  it('toggles stars without touching answer stats, stamping last-touched', () => {
    let progress = getProgress(defaultData(), 'set');
    progress = toggleStar(progress, 'x', 7);
    expect(progress.cards.x.starred).toBe(true);
    expect(progress.cards.x.seen).toBe(0);
    expect(progress.cards.x.last).toBe(7);
    progress = toggleStar(progress, 'x', 8);
    expect(progress.cards.x.starred).toBe(false);
  });
});

describe('set management and export', () => {
  it('upserts, deletes, and round-trips exports', () => {
    let data = defaultData();
    const set = createSet('Chem', '# Chem', 5);
    data = upsertSet(data, set);
    data = upsertSet(data, { ...set, title: 'Chemistry' });
    expect(data.sets).toHaveLength(1);
    expect(data.sets[0].title).toBe('Chemistry');

    const json = exportSetJson(data.sets[0]);
    const imported = parseSetExport(json);
    expect(imported.title).toBe('Chemistry');
    expect(imported.markdown).toBe('# Chem');
    expect(() => parseSetExport('{"format":"other"}')).toThrow();

    data = withProgress(data, set.id, recordAnswer(getProgress(data, set.id), 'c', true, 6));
    data = deleteSet(data, set.id, 7);
    expect(data.sets).toHaveLength(0);
    expect(data.progress[set.id]).toBeUndefined();
    expect(data.tombstones[set.id]).toBe(7);
  });

  it('generates distinct ids for different content and times', () => {
    const a = createSet('A', 'alpha', 1);
    const b = createSet('B', 'beta', 2);
    expect(a.id).not.toBe(b.id);
  });
});
