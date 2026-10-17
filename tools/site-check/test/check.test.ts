import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assetsOf, checkSite } from '../src/check.ts';

/** The page as Vite builds it for the root of a domain (D28), trimmed. */
const page = (base: string) => `<!doctype html>
<html lang="en">
  <head>
    <link rel="icon" href="${base}icons/icon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="${base}icons/apple-touch-icon.png" />
    <link rel="canonical" href="https://example.com/" />
    <script type="module" crossorigin src="${base}assets/index-a1.js"></script>
    <link rel="stylesheet" crossorigin href="${base}assets/index-b2.css">
  <link rel="manifest" href="${base}manifest.webmanifest"></head>
  <body><div id="app"></div></body>
</html>`;

/** A built site: each path with the type a host like Pages serves it as. */
const SITE: Record<string, [type: string, body: string]> = {
  '/': ['text/html; charset=utf-8', page('/')],
  '/icons/icon.svg': ['image/svg+xml', '<svg/>'],
  '/icons/apple-touch-icon.png': ['image/png', 'png'],
  '/assets/index-a1.js': ['text/javascript; charset=utf-8', 'export {};'],
  '/assets/index-b2.css': ['text/css; charset=utf-8', 'body{}'],
  '/manifest.webmanifest': ['application/manifest+json', '{}'],
  '/sw.js': ['text/javascript; charset=utf-8', ''],
};

let files: Record<string, [string, string]> = {};
let asked: string[] = [];
let server: Server;
let origin = '';

beforeAll(async () => {
  server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    asked.push(request.url ?? '');
    const file = files[path];
    response.writeHead(file ? 200 : 404, { 'content-type': file?.[0] ?? 'text/html' });
    response.end(file?.[1] ?? 'not found');
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((done) => server.close(() => done())));
beforeEach(() => {
  files = { ...SITE };
  asked = [];
});

describe('assetsOf', () => {
  it('finds scripts, styles, icons and the manifest, not links the browser leaves alone', () => {
    const found = assetsOf(page('/'), new URL('https://engine.example/'));
    expect(found.map(String)).toEqual([
      'https://engine.example/icons/icon.svg',
      'https://engine.example/icons/apple-touch-icon.png',
      'https://engine.example/assets/index-a1.js',
      'https://engine.example/assets/index-b2.css',
      'https://engine.example/manifest.webmanifest',
    ]);
  });

  it('resolves relative references against the page and reads any quoting', () => {
    const html = `<script src=./a.js></script><link href='b.css' rel='stylesheet'><script>inline()</script>`;
    expect(assetsOf(html, new URL('https://x.example/app/')).map(String)).toEqual([
      'https://x.example/app/a.js',
      'https://x.example/app/b.css',
    ]);
  });
});

describe('checkSite', () => {
  it('passes a site whose page loads everything it names', async () => {
    const report = await checkSite(`${origin}/`);
    expect(report.failures).toEqual([]);
    expect(report.checked).toEqual([
      '/icons/icon.svg',
      '/icons/apple-touch-icon.png',
      '/assets/index-a1.js',
      '/assets/index-b2.css',
      '/manifest.webmanifest',
      '/sw.js',
    ]);
  });

  it('fails a build made for another base path, as the old /Engine-Builder/ one would be at /', async () => {
    files['/'] = ['text/html', page('/Engine-Builder/')];
    const report = await checkSite(`${origin}/`);
    expect(report.failures).toContain(`${origin}/Engine-Builder/assets/index-a1.js answered 404`);
    expect(report.failures).toHaveLength(5);
  });

  it('fails a script the host answers with an HTML page', async () => {
    files['/assets/index-a1.js'] = ['text/html; charset=utf-8', '<!doctype html>'];
    expect((await checkSite(`${origin}/`)).failures).toEqual([
      `${origin}/assets/index-a1.js came as text/html; charset=utf-8, not javascript`,
    ]);
  });

  it('fails a file from another site without fetching it', async () => {
    files['/'] = ['text/html', `${page('/')}<script src="https://cdn.example/lib.js"></script>`];
    const report = await checkSite(`${origin}/`);
    expect(report.failures).toEqual(['https://cdn.example/lib.js comes from another site']);
  });

  it('fails a missing service worker and a missing page', async () => {
    delete files['/sw.js'];
    expect((await checkSite(`${origin}/`)).failures).toEqual([`${origin}/sw.js answered 404`]);
    delete files['/'];
    expect((await checkSite(`${origin}/`)).failures).toEqual([`${origin}/ answered 404`]);
  });

  it('reads a site URL without its trailing slash as the folder', async () => {
    files = Object.fromEntries(Object.entries(SITE).map(([path, file]) => [`/app${path}`, file]));
    files['/app/'] = ['text/html', page('/app/')];
    const report = await checkSite(`${origin}/app`);
    expect(report.failures).toEqual([]);
    expect(report.checked.at(-1)).toBe('/app/sw.js');
    // The page is asked for with a query of its own, so a CDN can't hand back the old one.
    expect(asked[0]).toMatch(/^\/app\/\?site-check=\d+$/);
  });
});
