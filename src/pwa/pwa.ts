import { useSyncExternalStore } from 'react';

// Install + update handling for the installable app (PWA).
// Nothing here is saved to the device: the "Not now" choice lasts until the page is reloaded.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaState {
  /** The browser can show its own install dialog (Android Chrome, desktop Chrome/Edge). */
  canInstall: boolean;
  /** Already running as an installed app. */
  installed: boolean;
  /** iPhone/iPad: no install dialog exists, the user adds the app from the Share menu. */
  isIOS: boolean;
  /** A newer version is downloaded and waiting. */
  updateReady: boolean;
  /** The user tapped "Not now" for this visit. */
  dismissed: boolean;
}

export function detectIOS(userAgent: string, maxTouchPoints = 0): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1; // iPadOS reports itself as a Mac
}

export function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)').matches : false;
  return mq || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// One small, harmless flag is saved on the device: when the student last tapped "Not now" on the install banner.
const DISMISS_KEY = 'english-teacher:install-dismissed-at';
const DISMISS_DAYS = 30;

function wasDismissedRecently(now = Date.now()): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY));
    return at > 0 && now - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;
let refreshRequested = false;
let initialised = false;
let state: PwaState = {
  canInstall: false,
  installed: detectStandalone(),
  isIOS: typeof navigator !== 'undefined' && detectIOS(navigator.userAgent, navigator.maxTouchPoints),
  updateReady: false,
  dismissed: typeof window !== 'undefined' && wasDismissedRecently(),
};
const listeners = new Set<() => void>();

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function initPwa(): void {
  if (initialised || typeof window === 'undefined') return;
  initialised = true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep the event so our own button can open the dialog
    deferredPrompt = e as BeforeInstallPromptEvent;
    set({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    set({ canInstall: false, installed: true });
  });
  if (typeof window.matchMedia === 'function') {
    window.matchMedia('(display-mode: standalone)').addEventListener?.('change', () => set({ installed: detectStandalone() }));
  }

  // The service worker is only registered in the production build, so local development is never served stale files.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        const markWaiting = (w: ServiceWorker | null) => {
          if (w && navigator.serviceWorker.controller) {
            waitingWorker = w;
            set({ updateReady: true });
          }
        };
        markWaiting(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const incoming = reg.installing;
          incoming?.addEventListener('statechange', () => {
            if (incoming.state === 'installed') markWaiting(incoming);
          });
        });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => undefined);
        });
      } catch {
        // Not fatal: the app works the same without a service worker, it just cannot be installed offline-ready.
      }
    };
    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', () => void register(), { once: true });

    // Reload only in the tab that asked for the update, never in another tab that may be mid-lesson.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshRequested) window.location.reload();
    });
  }
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const ev = deferredPrompt;
  if (!ev) return 'unavailable';
  deferredPrompt = null; // a prompt can only be used once
  set({ canInstall: false });
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  return outcome;
}

export function applyUpdate(): void {
  if (!waitingWorker) return;
  refreshRequested = true;
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}

export function dismissInstallHint(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // storage blocked: it only lasts for this visit
  }
  set({ dismissed: true });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function usePwa(): PwaState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Test helper: resets module state. */
export function __resetPwaForTests(patch: Partial<PwaState> = {}): void {
  deferredPrompt = null;
  waitingWorker = null;
  refreshRequested = false;
  state = { canInstall: false, installed: false, isIOS: false, updateReady: false, dismissed: false, ...patch };
  listeners.forEach((l) => l());
}
