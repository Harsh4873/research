import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFile } from 'node:fs/promises';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

const PROJECT_ID = 'demo-research';
const OWNER_UID = 'recall-owner';
const TEST_EMAIL = 'user.one@example.com';
const EMULATOR_ADDRESS = process.env.FIRESTORE_EMULATOR_HOST;

function authorizedContext(
  environment: RulesTestEnvironment,
  uid = OWNER_UID,
  overrides: Record<string, unknown> = {},
): RulesTestContext {
  return environment.authenticatedContext(uid, {
    email: TEST_EMAIL,
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
    ...overrides,
  });
}

function validSet(overrides: Record<string, unknown> = {}) {
  return {
    id: 'set-1',
    title: 'Cell Biology',
    markdown: '# Cell Biology\n\n- **ATP**: energy currency\n',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function validProgress(overrides: Record<string, unknown> = {}) {
  return {
    setId: 'set-1',
    cards: { abc123: { box: 2, seen: 1, correct: 1, wrong: 0, starred: false, last: 1000 } },
    updatedAt: 1000,
    ...overrides,
  };
}

describe.skipIf(!EMULATOR_ADDRESS)('recall Firestore security rules', () => {
  let env: RulesTestEnvironment;

  const setDocRef = (context: RulesTestContext, uid = OWNER_UID, setId = 'set-1') =>
    doc(context.firestore(), 'recall_users', uid, 'sets', setId);
  const progressDocRef = (context: RulesTestContext, uid = OWNER_UID, setId = 'set-1') =>
    doc(context.firestore(), 'recall_users', uid, 'progress', setId);

  beforeAll(async () => {
    const [host, rawPort] = EMULATOR_ADDRESS!.split(':');
    const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: { host, port: Number(rawPort), rules },
    });
  });

  afterEach(async () => env.clearFirestore());
  afterAll(async () => env.cleanup());

  describe('sets', () => {
    it('lets the owner create, read, and update a valid set', async () => {
      const context = authorizedContext(env);
      await assertSucceeds(setDoc(setDocRef(context), validSet()));
      await assertSucceeds(getDoc(setDocRef(context)));
      await assertSucceeds(setDoc(setDocRef(context), validSet({ updatedAt: 2000, markdown: '# Edited' })));
    });

    it('accepts a valid tombstone and rejects malformed ones', async () => {
      const context = authorizedContext(env);
      await assertSucceeds(setDoc(setDocRef(context), validSet()));
      await assertFails(
        setDoc(setDocRef(context), validSet({ updatedAt: 2000, deleted: true })), // missing deletedAt
      );
      await assertSucceeds(
        setDoc(setDocRef(context), validSet({ markdown: '', updatedAt: 2000, deleted: true, deletedAt: 2000 })),
      );
    });

    it('rejects unknown fields, mismatched ids, and wrong types', async () => {
      const context = authorizedContext(env);
      await assertFails(setDoc(setDocRef(context), validSet({ extra: 'nope' })));
      await assertFails(setDoc(setDocRef(context), validSet({ id: 'other-id' })));
      await assertFails(setDoc(setDocRef(context), validSet({ updatedAt: '1000' })));
      await assertFails(setDoc(setDocRef(context), validSet({ title: '' })));
    });

    it('blocks createdAt rewrites and updatedAt regressions', async () => {
      const context = authorizedContext(env);
      await assertSucceeds(setDoc(setDocRef(context), validSet({ updatedAt: 5000 })));
      await assertFails(setDoc(setDocRef(context), validSet({ createdAt: 1, updatedAt: 6000 })));
      await assertFails(setDoc(setDocRef(context), validSet({ updatedAt: 4000 })));
    });

    it('allows another verified Google account to use its own UID-scoped workspace', async () => {
      const secondUid = 'second-recall-user';
      const secondUser = authorizedContext(env, secondUid, { email: 'someone@example.com' });
      await assertSucceeds(setDoc(setDocRef(secondUser, secondUid), validSet()));
      await assertSucceeds(getDoc(setDocRef(secondUser, secondUid)));
    });

    it('denies other uids, unverified emails, non-Google providers, and signed-out access', async () => {
      const owner = authorizedContext(env);
      await assertSucceeds(setDoc(setDocRef(owner), validSet()));

      const otherUid = authorizedContext(env, 'someone-else');
      await assertFails(getDoc(setDocRef(otherUid, OWNER_UID)));
      const unverified = authorizedContext(env, OWNER_UID, { email_verified: false });
      await assertFails(getDoc(setDocRef(unverified)));
      const passwordProvider = authorizedContext(env, OWNER_UID, {
        firebase: { sign_in_provider: 'password' },
      });
      await assertFails(getDoc(setDocRef(passwordProvider)));
      const anonymous = env.unauthenticatedContext();
      await assertFails(getDoc(doc(anonymous.firestore(), 'recall_users', OWNER_UID, 'sets', 'set-1')));
    });

    it('does not allow hard deletes of set documents', async () => {
      const context = authorizedContext(env);
      await assertSucceeds(setDoc(setDocRef(context), validSet()));
      await assertFails(deleteDoc(setDocRef(context)));
    });
  });

  describe('progress', () => {
    it('lets the owner create, update, and delete progress', async () => {
      const context = authorizedContext(env);
      await assertSucceeds(setDoc(progressDocRef(context), validProgress()));
      await assertSucceeds(setDoc(progressDocRef(context), validProgress({ updatedAt: 2000, bestMatchMs: 8000 })));
      await assertSucceeds(deleteDoc(progressDocRef(context)));
    });

    it('rejects updatedAt regressions, id mismatches, and bad shapes', async () => {
      const context = authorizedContext(env);
      await assertSucceeds(setDoc(progressDocRef(context), validProgress({ updatedAt: 5000 })));
      await assertFails(setDoc(progressDocRef(context), validProgress({ updatedAt: 4000 })));
      await assertFails(setDoc(progressDocRef(context), validProgress({ setId: 'other', updatedAt: 6000 })));
      await assertFails(setDoc(progressDocRef(context), validProgress({ updatedAt: 6000, bestMatchMs: 0 })));
      await assertFails(setDoc(progressDocRef(context), validProgress({ updatedAt: 6000, extra: true })));
    });

    it('denies access for other uids', async () => {
      const owner = authorizedContext(env);
      await assertSucceeds(setDoc(progressDocRef(owner), validProgress()));
      const other = authorizedContext(env, 'someone-else');
      await assertFails(getDoc(progressDocRef(other, OWNER_UID)));
      await assertFails(setDoc(progressDocRef(other, OWNER_UID), validProgress({ updatedAt: 9000 })));
    });
  });
});
