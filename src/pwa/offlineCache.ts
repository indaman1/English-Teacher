import { useSyncExternalStore } from 'react';

// Saves the last successful copy of read-only information (lessons, your progress, your word list...) on THIS device,
// so the app can still show it when the connection drops. It is a convenience copy, never a source of truth:
//  - nothing is saved that a request did not return (no tokens, keys, passwords or audio);
//  - your own information is stored under your user id and ERASED when you sign out, your sign-in expires,
//    or you delete your data/account;
//  - when you are online the server's answer always wins.

const NS = 'english-teacher:offline:v1';
type Scope = 'public' | 'user';
export interface Snapshot<T> {
  savedAt: number;
  data: T;
}

let currentUser: string | null = null;
let usedSavedAt: number | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function store(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null; // private mode / blocked storage: the app simply works online-only
  }
}

function keyFor(scope: Scope, key: string): string | null {
  if (scope === 'public') return `${NS}:public:${key}`;
  return currentUser ? `${NS}:user:${currentUser}:${key}` : null;
}

/** Tells the cache whose information "user" entries belong to (null when signed out). */
export function setOfflineUser(id: string | null): void {
  currentUser = id;
}

export function writeSnapshot<T>(scope: Scope, key: string, data: T): void {
  const k = keyFor(scope, key);
  const s = store();
  if (!k || !s) return;
  try {
    s.setItem(k, JSON.stringify({ savedAt: Date.now(), data } satisfies Snapshot<T>));
  } catch {
    // storage full: skip, the app keeps working online
  }
}

export function readSnapshot<T>(scope: Scope, key: string): Snapshot<T> | null {
  const k = keyFor(scope, key);
  const s = store();
  if (!k || !s) return null;
  try {
    const raw = s.getItem(k);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot<T>;
    return typeof parsed?.savedAt === 'number' && 'data' in parsed ? parsed : null;
  } catch {
    return null;
  }
}

/** Erases every signed-in user's saved information from this device. Public lesson content is kept. */
export function clearUserSnapshots(): void {
  const s = store();
  if (!s) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(`${NS}:user:`)) doomed.push(k);
    }
    doomed.forEach((k) => s.removeItem(k));
  } catch {
    // ignore
  }
  usedSavedAt = null;
  notify();
}

export function isNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = err instanceof Error ? err.message : String(err ?? '');
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|timed out/i.test(message);
}

/**
 * Runs `fetcher`. On success the answer is saved for offline use. If the device is offline (or the network request
 * fails) and a saved copy exists, that copy is returned instead. Any other error is thrown as usual.
 */
export async function withOfflineCache<T>(scope: Scope, key: string, fetcher: () => Promise<T>): Promise<T> {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (!offline) {
    try {
      const fresh = await fetcher();
      writeSnapshot(scope, key, fresh);
      if (usedSavedAt !== null) {
        usedSavedAt = null;
        notify();
      }
      return fresh;
    } catch (err) {
      if (!isNetworkFailure(err)) throw err;
      return fromSnapshotOrThrow<T>(scope, key, err);
    }
  }
  return fromSnapshotOrThrow<T>(scope, key, new Error('You are offline.'));
}

function fromSnapshotOrThrow<T>(scope: Scope, key: string, original: unknown): T {
  const snap = readSnapshot<T>(scope, key);
  if (!snap) throw original instanceof Error ? original : new Error('You are offline.');
  noteSavedDataUsed(snap.savedAt);
  return snap.data;
}

export function noteSavedDataUsed(savedAt: number): void {
  usedSavedAt = usedSavedAt === null ? savedAt : Math.min(usedSavedAt, savedAt);
  notify();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The time of the oldest saved copy currently being shown, or null when everything on screen is live. */
export function useSavedDataNotice(): number | null {
  return useSyncExternalStore(subscribe, () => usedSavedAt, () => null);
}

/** Test helper. */
export function __resetOfflineCacheForTests(): void {
  currentUser = null;
  usedSavedAt = null;
  notify();
}
