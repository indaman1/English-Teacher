import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import { __resetOfflineCacheForTests, clearUserSnapshots, isNetworkFailure, readSnapshot, setOfflineUser, withOfflineCache } from './offlineCache';

const setOnline = (v: boolean) => {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: v });
  window.dispatchEvent(new Event(v ? 'online' : 'offline'));
};

describe('offline cache', () => {
  beforeEach(() => {
    window.localStorage.clear();
    __resetOfflineCacheForTests();
    setOnline(true);
  });
  afterEach(() => setOnline(true));

  it('returns live data online and saves a copy for later', async () => {
    setOfflineUser('user-a');
    expect(await withOfflineCache('user', 'totals', async () => ({ sessions: 3 }))).toEqual({ sessions: 3 });
    expect(readSnapshot('user', 'totals')?.data).toEqual({ sessions: 3 });
  });

  it('serves the saved copy when the network fails, but never hides real errors', async () => {
    setOfflineUser('user-a');
    await withOfflineCache('user', 'vocab', async () => ['hello']);
    expect(await withOfflineCache('user', 'vocab', async () => Promise.reject(new Error('TypeError: Failed to fetch')))).toEqual(['hello']);
    await expect(withOfflineCache('user', 'vocab', async () => Promise.reject(new Error('permission denied for table')))).rejects.toThrow(/permission denied/);
  });

  it('uses the saved copy straight away when the device is offline, and fails clearly when there is none', async () => {
    setOfflineUser('user-a');
    await withOfflineCache('public', 'lessons', async () => [{ id: 1 }]);
    setOnline(false);
    let called = false;
    expect(await withOfflineCache('public', 'lessons', async () => ((called = true), []))).toEqual([{ id: 1 }]);
    expect(called).toBe(false);
    await expect(withOfflineCache('public', 'never-saved', async () => [])).rejects.toThrow(/offline/i);
  });

  it("keeps each person's information separate", async () => {
    setOfflineUser('user-a');
    await withOfflineCache('user', 'vocab', async () => ['a-word']);
    setOfflineUser('user-b');
    expect(readSnapshot('user', 'vocab')).toBeNull();
    setOfflineUser(null);
    expect(readSnapshot('user', 'vocab')).toBeNull();
  });

  it('erases personal information on sign-out but keeps public lessons', async () => {
    setOfflineUser('user-a');
    await withOfflineCache('user', 'vocab', async () => ['secret-word']);
    await withOfflineCache('public', 'lessons', async () => ['Lesson 1']);
    clearUserSnapshots();
    expect(JSON.stringify(Object.entries(window.localStorage))).not.toContain('secret-word');
    setOfflineUser('user-a');
    expect(readSnapshot('user', 'vocab')).toBeNull();
    expect(readSnapshot('public', 'lessons')?.data).toEqual(['Lesson 1']);
  });

  it('does not save personal information when nobody is signed in', async () => {
    await withOfflineCache('user', 'vocab', async () => ['x']);
    expect(window.localStorage.length).toBe(0);
  });

  it('recognises network failures', () => {
    expect(isNetworkFailure(new Error('TypeError: Failed to fetch'))).toBe(true);
    expect(isNetworkFailure(new Error('Load failed'))).toBe(true);
    expect(isNetworkFailure(new Error('duplicate key value'))).toBe(false);
  });
});

describe('<OfflineBanner />', () => {
  const wrap = (path = '/dashboard') => render(<MemoryRouter initialEntries={[path]}><OfflineBanner /></MemoryRouter>);
  afterEach(() => setOnline(true));

  it('is hidden online and appears when the connection is lost', () => {
    setOnline(true);
    const { container } = wrap();
    expect(container).toBeEmptyDOMElement();
    act(() => setOnline(false));
    expect(screen.getByRole('status').textContent).toMatch(/offline/i);
    expect(screen.getByRole('status').textContent).toMatch(/Voice lessons need an internet connection/);
    act(() => setOnline(true));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('leaves the live lesson screen to its own message', () => {
    setOnline(false);
    const { container } = wrap('/practice/live');
    expect(container).toBeEmptyDOMElement();
  });
});
