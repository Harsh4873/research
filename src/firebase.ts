import { getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  setPersistence,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

// The named app isolates Recall's auth/cache instance from other harsh.bet
// apps that share the same origin and Firebase project. The name is kept from
// the previous app at this path so existing signed-in sessions carry over.
const APP_NAME = 'research';

const firebaseConfig = {
  apiKey: 'AIzaSyATQK7NHNXIshlJIy7xT17z8Kr8fUWatLs',
  authDomain: 'pickledgerpro.firebaseapp.com',
  projectId: 'pickledgerpro',
  storageBucket: 'pickledgerpro.firebasestorage.app',
  messagingSenderId: '285462656063',
  appId: '1:285462656063:web:caa084d1daf04e04eab48a',
};

export const firebaseApp = getApps().find((app) => app.name === APP_NAME)
  ?? initializeApp(firebaseConfig, APP_NAME);

export const firebaseAuth = getAuth(firebaseApp);
export const authPersistenceReady = setPersistence(firebaseAuth, browserLocalPersistence);

/**
 * The one Google account the shared project's security rules admit. Every
 * account gets its own `recall_users/{uid}` silo, so signing in with a
 * different one would not reach these sets even if the rules allowed it —
 * the app checks this before it opens a Firestore listener and says so.
 */
export const OWNER_EMAIL = 'hdav4873@gmail.com';

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  login_hint: OWNER_EMAIL,
  prompt: 'select_account',
});

export const recallFirestore = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
