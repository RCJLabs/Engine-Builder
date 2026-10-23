/**
 * The web build's service worker (M4.10), run in Node against stand-ins for the worker's global:
 * its caches, fetch and clients. What a browser does with it end to end is export.spec.ts's.
 */
import { describe, expect, it } from 'vitest';
import { serviceWorker } from './sw.ts';

const SCOPE = 'https://rcjlabs.github.io/hut/';

interface Fake {
  readonly handlers: Map<string, (event: unknown) => void>;
  readonly caches: Map<string, Map<string, string>>;
  readonly fetched: { url: string; cache?: string }[];
  readonly calls: string[];
}

/** The worker's script run with a fake `self`, `caches` and `fetch`; pages answer with `respond`. */
function install(
  source: string,
  respond: (url: string) => { ok: boolean; type?: string; redirected?: boolean; body: string },
) {
  const fake: Fake = { handlers: new Map(), caches: new Map(), fetched: [], calls: [] };
  const response = (url: string) => {
    const r = respond(url);
    return {
      ok: r.ok,
      status: r.ok ? 200 : 404,
      type: r.type ?? 'basic',
      redirected: r.redirected ?? false,
      body: r.body,
      url,
    };
  };
  const open = async (name: string) => {
    const cache = fake.caches.get(name) ?? new Map<string, string>();
    fake.caches.set(name, cache);
    const key = (request: string | { url: string }) =>
      new URL(typeof request === 'string' ? request : request.url, SCOPE).href;
    return {
      put: async (request: string, res: { body: string }) => void cache.set(key(request), res.body),
      match: async (request: string | { url: string }) => {
        const hit = cache.get(key(request).split('?')[0] as string);
        return hit === undefined ? undefined : { body: hit };
      },
    };
  };
  const self = {
    registration: { scope: SCOPE },
    addEventListener: (type: string, handler: (event: unknown) => void) => fake.handlers.set(type, handler),
    skipWaiting: () => fake.calls.push('skipWaiting'),
    clients: { claim: async () => void fake.calls.push('claim') },
  };
  const caches = {
    open,
    keys: async () => [...fake.caches.keys()],
    delete: async (name: string) => fake.caches.delete(name),
  };
  class Request {
    constructor(
      readonly url: string,
      readonly init: { cache?: string } = {},
    ) {}
  }
  const fetch = async (request: Request | { url: string }) => {
    const url = new URL(request.url, SCOPE).href;
    fake.fetched.push({ url, ...('init' in request && request.init.cache ? { cache: request.init.cache } : {}) });
    return response(url);
  };
  new Function('self', 'caches', 'fetch', 'Request', source)(self, caches, fetch, Request);
  return fake;
}

/** Fires an extendable event and waits for what it was given to wait on, or what it answered. */
async function fire(fake: Fake, type: string, extra: Record<string, unknown> = {}) {
  let waited: Promise<unknown> | undefined;
  let answered: Promise<unknown> | undefined;
  fake.handlers.get(type)?.({
    ...extra,
    waitUntil: (p: Promise<unknown>) => {
      waited = p;
    },
    respondWith: (p: Promise<unknown>) => {
      answered = p;
    },
  });
  await waited;
  return answered ? { answered: await answered } : { answered: undefined };
}

const source = serviceWorker({ game: 'the-hut', build: 'abc123abc123', files: ['./', 'game.js', 'index.html'] });
const page = (url: string) => ({ ok: true, body: `body of ${url}` });

describe('the web build’s service worker (M4.10)', () => {
  it('installs its files past the HTTP cache, into a cache named by its scope and build, and waits', async () => {
    const fake = install(source, page);
    await fire(fake, 'install');
    expect(fake.fetched.map((f) => f.cache)).toEqual(['reload', 'reload', 'reload']);
    expect([...fake.caches.keys()]).toEqual([`eb the-hut ${SCOPE} abc123abc123`]);
    expect(fake.calls).toEqual([]);
  });

  it('refuses an install that gets an error, a redirect or another origin’s file', async () => {
    for (const bad of [{ ok: false }, { ok: true, redirected: true }, { ok: true, type: 'opaque' }]) {
      const fake = install(source, (url) => (url.endsWith('game.js') ? { ...bad, body: '' } : page(url)));
      await expect(fire(fake, 'install')).rejects.toThrow('game.js');
    }
  });

  it('skips waiting only when the player chooses the update', async () => {
    const fake = install(source, page);
    fake.handlers.get('message')?.({ data: { type: 'hello' } });
    expect(fake.calls).toEqual([]);
    fake.handlers.get('message')?.({ data: { type: 'SKIP_WAITING' } });
    expect(fake.calls).toEqual(['skipWaiting']);
  });

  it('deletes only its own older caches when it takes over, and claims the page', async () => {
    const fake = install(source, page);
    for (const name of [
      `eb the-hut ${SCOPE} old000old000`,
      `eb the-hut ${SCOPE} abc123abc123`,
      'eb the-hut https://rcjlabs.github.io/hut-taster/ abc123abc123',
      'workbox-precache-v2-https://rcjlabs.github.io/other/',
    ]) {
      fake.caches.set(name, new Map());
    }
    await fire(fake, 'activate');
    expect([...fake.caches.keys()].sort()).toEqual([
      'eb the-hut https://rcjlabs.github.io/hut-taster/ abc123abc123',
      `eb the-hut ${SCOPE} abc123abc123`,
      'workbox-precache-v2-https://rcjlabs.github.io/other/',
    ]);
    expect(fake.calls).toEqual(['claim']);
  });

  it('answers from its cache, a navigation it lacks with the page, and leaves version.json, .well-known and other sites to the network', async () => {
    const fake = install(source, page);
    await fire(fake, 'install');
    fake.fetched.length = 0;
    const get = (url: string, mode = 'no-cors') => fire(fake, 'fetch', { request: { url, method: 'GET', mode } });
    expect((await get(`${SCOPE}game.js?v=2`)).answered).toEqual({ body: `body of ${SCOPE}game.js` });
    expect((await get(`${SCOPE}play/somewhere`, 'navigate')).answered).toEqual({ body: `body of ${SCOPE}` });
    expect((await get(`${SCOPE}version.json?abc`)).answered).toBeUndefined();
    expect((await get(`${SCOPE}.well-known/assetlinks.json`, 'navigate')).answered).toBeUndefined();
    expect((await get('https://rcjlabs.github.io/other/game.js')).answered).toBeUndefined();
    expect(
      (await fire(fake, 'fetch', { request: { url: `${SCOPE}game.js`, method: 'POST', mode: 'cors' } })).answered,
    ).toBeUndefined();
    expect(fake.fetched).toEqual([]);
  });
});
