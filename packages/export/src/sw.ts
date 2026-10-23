/**
 * The web build's service worker (docs/specs/export.md#the-service-worker), written for each
 * build. Its caches are named by its scope and the build's hash and it deletes only its own, since
 * a Pages origin holds many games (Rule or Drool's public/sw.js). It waits for the player to choose
 * a new build, and never answers for /.well-known/ (project-ascent M12) or version.json.
 */

export interface WorkerParts {
  /** The game's id, for people reading the cache list. */
  readonly game: string;
  readonly build: string;
  /** Every file it keeps, relative to the scope: the build's, less sw.js, version.json and .well-known. */
  readonly files: readonly string[];
}

/** The files a web build's worker keeps: every one but those it never answers for. */
export const cachedFiles = (paths: Iterable<string>): string[] =>
  ['./', ...[...paths].filter((p) => p !== 'sw.js' && p !== 'version.json' && !p.startsWith('.well-known/'))].sort();

export function serviceWorker({ game, build, files }: WorkerParts): string {
  return `// ${game}'s service worker, written by Engine-Builder's export for build ${build}.
'use strict';
const SCOPE = self.registration.scope;
const PREFIX = 'eb ${game} ' + SCOPE + ' ';
const CACHE = PREFIX + '${build}';
const FILES = ${JSON.stringify(files)};
const PASS = /^(?:version\\.json|\\.well-known\\/)/;

// Only what came whole from this site: no error page, no redirect, nothing from elsewhere.
const good = (response) => response.ok && response.type === 'basic' && !response.redirected;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        FILES.map(async (file) => {
          // Past the HTTP cache: Pages serves files with ten minutes' max-age.
          const response = await fetch(new Request(file, { cache: 'reload' }));
          if (!good(response)) throw new Error(file + ': ' + response.status);
          await cache.put(file, response);
        }),
      ),
    ),
  );
});

// A new build waits for the player to choose it (the shell's "Reload to update").
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(SCOPE)) return;
  const path = request.url.slice(SCOPE.length).split(/[?#]/)[0];
  if (PASS.test(path)) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request, { ignoreSearch: true });
      if (hit) return hit;
      if (request.mode === 'navigate') {
        const page = await cache.match('./');
        if (page) return page;
      }
      return fetch(request);
    }),
  );
});
`;
}
