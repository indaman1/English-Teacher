import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InstallAppCard } from '@/components/pwa/InstallAppCard';
import { UpdateBar } from '@/components/pwa/UpdateBar';
import { __resetPwaForTests, detectIOS } from './pwa';

const read = (p: string) => readFileSync(p, 'utf8');

describe('detectIOS', () => {
  it('recognises iPhone, iPad and iPadOS-as-Mac, but not Android or desktop', () => {
    expect(detectIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(detectIOS('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe(true);
    expect(detectIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(detectIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(detectIOS('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120')).toBe(false);
    expect(detectIOS('Mozilla/5.0 (X11; Linux x86_64) Chrome/120')).toBe(false);
  });
});

describe('<InstallAppCard />', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetPwaForTests();
  });

  it('stays hidden on the dashboard when the browser offers nothing to install', () => {
    const { container } = render(<InstallAppCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a one-tap install button when the browser supports it', () => {
    __resetPwaForTests({ canInstall: true });
    render(<InstallAppCard />);
    expect(screen.getByRole('button', { name: /install app/i })).toBeTruthy();
  });

  it('shows Share → Add to Home Screen steps on iPhone', () => {
    __resetPwaForTests({ isIOS: true });
    render(<InstallAppCard />);
    expect(screen.getByText(/Add to Home Screen/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /install app/i })).toBeNull();
  });

  it('stays dismissed: "Not now" is remembered on this device', () => {
    __resetPwaForTests({ canInstall: true });
    render(<InstallAppCard />);
    fireEvent.click(screen.getByRole('button', { name: /not now/i }));
    expect(screen.queryByText(/Install English Teacher/)).toBeNull();
    expect(Number(window.localStorage.getItem('english-teacher:install-dismissed-at'))).toBeGreaterThan(0);
  });

  it('never shows an install prompt once installed, and says so in settings', () => {
    __resetPwaForTests({ installed: true, canInstall: true });
    const { container, rerender } = render(<InstallAppCard />);
    expect(container).toBeEmptyDOMElement();
    rerender(<InstallAppCard always />);
    expect(screen.getByText(/installed on this device/i)).toBeTruthy();
  });

  it('settings always gives some install help, even without a browser prompt', () => {
    render(<InstallAppCard always />);
    expect(screen.getByText(/Add to Home screen/i)).toBeTruthy();
  });
});

describe('<UpdateBar />', () => {
  beforeEach(() => __resetPwaForTests());
  it('appears only when an update is ready', () => {
    const { container } = render(<UpdateBar />);
    expect(container).toBeEmptyDOMElement();
    act(() => __resetPwaForTests({ updateReady: true }));
    expect(screen.getByRole('button', { name: /update/i })).toBeTruthy();
  });
});

describe('web app manifest', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  it('is installable: name, standalone display, start url and required icon sizes', () => {
    expect(manifest.name).toBe('English Teacher');
    expect(manifest.short_name).toBe('English Teacher');
    expect(manifest.short_name.length).toBeLessThanOrEqual(15);
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/dashboard');
    const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toContain('192x192:any');
    expect(sizes).toContain('512x512:any');
    expect(sizes).toContain('512x512:maskable');
  });
  it('points at icon files that exist', () => {
    for (const icon of manifest.icons) expect(() => readFileSync(`public${icon.src}`)).not.toThrow();
    expect(() => readFileSync('public/icons/apple-touch-icon.png')).not.toThrow();
  });
  it('is linked from index.html together with the iOS tags', () => {
    const html = read('index.html');
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('apple-touch-icon');
    expect(html).toContain('apple-mobile-web-app-capable');
  });
});

// ---- service worker, executed with stubbed browser APIs ----
type Handler = (event: unknown) => void;
function loadServiceWorker(initiallyOnline: boolean, precache: string[] = []) {
  let online = initiallyOnline;
  const handlers: Record<string, Handler> = {};
  const store = new Map<string, Map<string, Response>>();
  const pathOf = (r: Request | string) => new URL(typeof r === 'string' ? r : r.url, 'https://app.test').pathname;
  const cacheFor = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name)!;
    return {
      addAll: async (urls: string[]) => urls.forEach((u) => m.set(pathOf(u), new Response('cached:' + pathOf(u)))),
      add: async (u: string) => {
        if (!online) throw new TypeError('offline');
        m.set(pathOf(u), new Response('cached:' + pathOf(u)));
      },
      match: async (r: Request | string) => m.get(pathOf(r))?.clone(),
      put: async (r: Request | string, res: Response) => void m.set(pathOf(r), res),
    };
  };
  const caches = {
    open: async (n: string) => cacheFor(n),
    keys: async () => [...store.keys()],
    delete: async (n: string) => store.delete(n),
  };
  const fetchSpy = vi.fn(async (r: Request | string) => {
    if (!online) throw new TypeError('offline');
    return new Response('net:' + pathOf(r), { headers: { 'content-type': 'text/html' } });
  });
  const self = {
    location: { origin: 'https://app.test' },
    addEventListener: (t: string, h: Handler) => (handlers[t] = h),
    clients: { claim: async () => undefined },
    skipWaiting: vi.fn(),
  };
  const code = read('public/sw.js').replaceAll('__BUILD_ID__', 'test1').replace('[]; /*PRECACHE*/', JSON.stringify(precache) + ';');
  new Function('self', 'caches', 'fetch', 'URL', 'Response', code)(self, caches, fetchSpy, URL, Response);
  const request = (url: string, init: { method?: string; mode?: string } = {}) => ({ url, method: init.method ?? 'GET', mode: init.mode ?? 'cors' }) as unknown as Request;
  const dispatch = async (req: Request) => {
    let responded: Promise<Response> | undefined;
    handlers.fetch({ request: req, respondWith: (p: Promise<Response>) => (responded = Promise.resolve(p)) });
    return responded;
  };
  const install = async () => {
    let done: Promise<unknown> = Promise.resolve();
    handlers.install({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  };
  return { handlers, store, fetchSpy, self, request, dispatch, install, setOnline: (v: boolean) => (online = v) };
}

describe('service worker', () => {
  it('never touches API traffic: other origins, POSTs and non-app files are left alone', async () => {
    const sw = loadServiceWorker(true);
    expect(await sw.dispatch(sw.request('https://abc.supabase.co/rest/v1/profiles'))).toBeUndefined();
    expect(await sw.dispatch(sw.request('https://generativelanguage.googleapis.com/x'))).toBeUndefined();
    expect(await sw.dispatch(sw.request('https://app.test/api/anything', { method: 'POST' }))).toBeUndefined();
    expect(await sw.dispatch(sw.request('https://app.test/some-data.json'))).toBeUndefined();
    expect(sw.fetchSpy).not.toHaveBeenCalled();
  });

  it('opens the saved app (any route) when offline, and the live page when online', async () => {
    const sw = loadServiceWorker(true);
    await sw.install();
    expect(sw.store.get('shell-test1')!.has('/index.html')).toBe(true);
    const live = await sw.dispatch(sw.request('https://app.test/dashboard', { mode: 'navigate' }));
    expect(await live!.text()).toBe('net:/dashboard');
    sw.setOnline(false);
    for (const route of ['/dashboard', '/lessons', '/progress', '/settings']) {
      const res = await sw.dispatch(sw.request('https://app.test' + route, { mode: 'navigate' }));
      // the same saved single-page app for every route (in production all routes return identical HTML), so React Router handles the route
      expect(await res!.text(), route).toBe('net:/dashboard');
    }
  });

  it('falls back to the offline page only when the app was never saved', async () => {
    const sw = loadServiceWorker(false);
    await sw.install(); // installed with no connection: the app page could not be saved
    const res = await sw.dispatch(sw.request('https://app.test/dashboard', { mode: 'navigate' }));
    expect(await res!.text()).toBe('cached:/offline.html');
  });

  it('saves the built files at install time so every route works offline', async () => {
    const sw = loadServiceWorker(true, ['/assets/Dashboard-abc.js', '/assets/index-xyz.css']);
    await sw.install();
    sw.setOnline(false);
    const js = await sw.dispatch(sw.request('https://app.test/assets/Dashboard-abc.js'));
    expect(await js!.text()).toBe('cached:/assets/Dashboard-abc.js');
    expect(sw.fetchSpy).toHaveBeenCalledTimes(1); // only the app page was fetched during install
  });

  it('caches built assets after the first load and serves them without the network', async () => {
    const sw = loadServiceWorker(true);
    const req = sw.request('https://app.test/assets/index-abc123.js');
    expect(await (await sw.dispatch(req))!.text()).toBe('net:/assets/index-abc123.js');
    sw.setOnline(false);
    expect(await (await sw.dispatch(req))!.text()).toBe('net:/assets/index-abc123.js');
  });

  it('waits for the student before updating, and deletes old caches when it takes over', async () => {
    const sw = loadServiceWorker(true);
    const code = read('public/sw.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const installBody = code.slice(code.indexOf("'install'"), code.indexOf("'activate'"));
    expect(installBody).not.toContain('skipWaiting'); // only the student's tap may activate a new version
    sw.handlers.message({ data: { type: 'SKIP_WAITING' } });
    expect(sw.self.skipWaiting).toHaveBeenCalled();
    sw.store.set('shell-old', new Map());
    let done: Promise<unknown> = Promise.resolve();
    sw.handlers.activate({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
    expect(sw.store.has('shell-old')).toBe(false);
  });
});
