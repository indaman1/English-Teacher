// Browser smoke test (Playwright + real Chromium). Run with: npm run test:e2e
// It serves a throwaway production build that points at a dummy Supabase URL, so it checks the public pages,
// route protection, form validation, responsive layout and the real microphone/AudioWorklet capture stack.
// It does NOT sign in or talk to Gemini (that needs your real Supabase + Gemini credentials).
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';

const server = await preview({
  root: process.cwd(),
  build: { outDir: '.e2e-dist' },
  preview: { port: 4173, host: '127.0.0.1', strictPort: true },
});
const BASE = 'http://127.0.0.1:4173';
const OUT = join(tmpdir(), 'ai-english-teacher-e2e');
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

for (const [label, viewport] of [['mobile', { width: 390, height: 844 }], ['tablet', { width: 820, height: 1180 }], ['desktop', { width: 1280, height: 800 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text()) && consoleErrors.push(m.text()));

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const h1 = await page.locator('h1').first().innerText();
  check(`[${label}] landing headline`, /personal AI teacher/i.test(h1), h1.replace(/\n/g, ' '));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`[${label}] landing has no horizontal scroll`, overflow <= 0, `overflow=${overflow}`);
  check(`[${label}] landing title + meta description`, (await page.title()).includes('AI English Teacher') && !!(await page.locator('meta[name=description]').getAttribute('content')));
  await page.screenshot({ path: `${OUT}/${label}-landing.png`, fullPage: false });

  await page.goto(BASE + '/auth/register', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Create account' }).click();
  check(`[${label}] register validates empty form`, await page.getByRole('alert').first().isVisible());
  await page.getByLabel('Your name').fill('Amina');
  await page.getByLabel('Email').fill('amina@example.com');
  await page.getByLabel('Password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  check(`[${label}] register enforces 8-char password`, /at least 8/.test(await page.getByRole('alert').first().innerText()));
  const ov2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`[${label}] register has no horizontal scroll`, ov2 <= 0);
  await page.screenshot({ path: `${OUT}/${label}-register.png` });

  await page.goto(BASE + '/auth/login', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Sign in' }).click();
  check(`[${label}] login validates email`, /valid email/i.test(await page.getByRole('alert').first().innerText()));

  await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
  await page.waitForURL(/\/auth\/login/, { timeout: 8000 }).catch(() => {});
  check(`[${label}] /dashboard redirects signed-out users to login`, page.url().includes('/auth/login'), page.url());
  await page.goto(BASE + '/practice/live', { waitUntil: 'networkidle' });
  await page.waitForURL(/\/auth\/login/, { timeout: 8000 }).catch(() => {});
  check(`[${label}] /practice/live is protected`, page.url().includes('/auth/login'));
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
  await page.waitForURL(/\/auth\/login/, { timeout: 8000 }).catch(() => {});
  check(`[${label}] /admin is protected`, page.url().includes('/auth/login'));

  for (const path of ['/privacy', '/terms']) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' });
    check(`[${label}] ${path} renders`, (await page.locator('h1').first().innerText()).length > 3);
  }
  await page.goto(BASE + '/does-not-exist', { waitUntil: 'networkidle' });
  check(`[${label}] unknown route shows 404`, /could not be found/i.test(await page.locator('h1').first().innerText()));

  check(`[${label}] no console/page errors`, consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  await ctx.close();
}

// Microphone API availability in the browser the app targets (fake device) — confirms the capture stack primitives exist.
{
  const ctx = await browser.newContext({ permissions: ['microphone'] });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  const caps = await page.evaluate(async () => {
    const out = { getUserMedia: !!navigator.mediaDevices?.getUserMedia, audioWorklet: typeof AudioWorkletNode !== 'undefined' };
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      out.mic = s.getAudioTracks().length > 0;
      const ctx = new AudioContext();
      await ctx.audioWorklet.addModule('/pcm-capture-worklet.js');
      out.workletLoads = true;
      let got = 0;
      const src = ctx.createMediaStreamSource(s);
      const node = new AudioWorkletNode(ctx, 'pcm-capture');
      node.port.onmessage = (e) => { got = e.data.length; };
      src.connect(node);
      await new Promise((r) => setTimeout(r, 600));
      out.chunkSamples = got;
      s.getTracks().forEach((t) => t.stop());
      await ctx.close();
    } catch (e) { out.error = String(e); }
    return out;
  });
  check('real browser: microphone + AudioWorklet capture produces PCM chunks', caps.mic && caps.workletLoads && caps.chunkSamples > 0, JSON.stringify(caps));
  await ctx.close();
}


// ---- installable app (PWA) ----
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });

  const mres = await page.request.get(BASE + '/manifest.webmanifest');
  const manifest = await mres.json().catch(() => null);
  check('[pwa] manifest is served as JSON', mres.ok() && !!manifest && manifest.display === 'standalone', mres.headers()['content-type']);
  for (const icon of manifest?.icons ?? []) {
    const r = await page.request.get(BASE + icon.src);
    check(`[pwa] icon ${icon.src} loads`, r.ok() && /image\/png/.test(r.headers()['content-type'] ?? ''));
  }
  const swRes = await page.request.get(BASE + '/sw.js');
  const swText = await swRes.text();
  check('[pwa] service worker file is served with a build id stamped in', swRes.ok() && !swText.includes('__BUILD_ID__'));

  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.scope;
  });
  check('[pwa] service worker registers and activates', scope === BASE + '/', scope);

  const cdp = await ctx.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  check('[pwa] Chrome reports no installability errors', installabilityErrors.length === 0, JSON.stringify(installabilityErrors.map((e) => e.errorId)));

  // API calls must never be answered from the service worker cache.
  const swCaches = await page.evaluate(async () => {
    const out = [];
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) out.push(new URL(req.url).origin + new URL(req.url).pathname);
    return out;
  });
  check('[pwa] cache holds only same-origin app files', swCaches.length > 0 && swCaches.every((u) => u.startsWith(BASE)), `${swCaches.length} entries`);

  // Truly offline: Playwright's setOffline does not stop a service worker's own fetches, so stop the server too.
  await page.reload({ waitUntil: 'networkidle' }); // make sure the page is controlled by the service worker
  await server.close();
  await ctx.setOffline(true);
  await page.goto(BASE + '/dashboard').catch(() => undefined);
  await page.waitForTimeout(800);
  const offlineText = await page.locator('body').innerText().catch(() => '');
  check('[pwa] offline: the saved app opens (not the browser error page)', /Supabase is not configured|English Teacher|Sign in|Welcome/i.test(offlineText), offlineText.slice(0, 50).replace(/\n/g, ' '));
  check('[pwa] offline: the "You are offline" strip is shown', /You are offline/i.test(offlineText) && /Voice lessons need an internet connection/i.test(offlineText));
  const offlineRoutes = [];
  for (const route of ['/lessons', '/progress', '/settings', '/privacy']) {
    await page.goto(BASE + route).catch(() => undefined);
    await page.waitForTimeout(300);
    offlineRoutes.push(!/ERR_INTERNET|This site can.t be reached/i.test(await page.locator('body').innerText().catch(() => '')));
  }
  check('[pwa] offline: deep links /lessons /progress /settings /privacy open the app', offlineRoutes.every(Boolean), offlineRoutes.join(','));
  await ctx.close();
}

await browser.close();
console.log(`Screenshots saved to ${OUT}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
process.exit(failed.length ? 1 : 0);
