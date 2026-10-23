/**
 * M4.10's gate (D60), what its specs share: the hut brought into the editor with its scripts let
 * run, the Project panel's Export section, each target's download caught and unpacked, and a
 * static server of the e2e's own, so an exported web build is served as a host would serve it,
 * service worker and all, at a path of its own.
 */
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { HUT } from './hutHelpers.ts';
import { showPlay } from './hutScreens.ts';
import { fixtureZip } from './kitHelpers.ts';
import { openProject, scratch, showProject } from './ludus.ts';

/** The hut imported and its scripts let run, the Project panel at the front. */
export async function importHut(page: Page): Promise<void> {
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import zip' }).click(),
  ]);
  await chooser.setFiles(fixtureZip(HUT, 'the-hut'));
  await expect(openProject(page).getByRole('heading', { name: 'The hut' })).toBeVisible();
  const play = await showPlay(page);
  await play.getByRole('button', { name: 'Run its scripts' }).click();
  // Enabled, not visible: Play is always drawn, and enabled only once the game has loaded.
  await expect(play.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  await showProject(page);
}

/** The Project panel's Export section. */
export const exportSection = (page: Page): Locator => page.getByRole('region', { name: 'Export' });

/** What the last export said. */
export const exportReport = (page: Page): Locator => page.getByRole('status', { name: 'Export report' });

/** Presses a target's button and keeps what it downloads, in the e2e's scratch folder. */
export async function exportFile(page: Page, button: string, tap = false): Promise<string> {
  const section = exportSection(page);
  const target = section.getByRole('button', { name: button, exact: true });
  const [download] = await Promise.all([page.waitForEvent('download'), tap ? target.tap() : target.click()]);
  const path = join(scratch, `${Date.now()}-${download.suggestedFilename()}`);
  await download.saveAs(path);
  await expect(exportReport(page)).toContainText(`Exported ${download.suggestedFilename()}`);
  return path;
}

/** A zip unpacked under `dir` by Python, not the engine's own zip code; its paths, sorted. */
export function unzipTo(zip: string, dir: string): string[] {
  const script = [
    'import sys, zipfile',
    'with zipfile.ZipFile(sys.argv[1]) as z:',
    '    z.extractall(sys.argv[2])',
    '    print("\\n".join(sorted(n for n in z.namelist() if not n.endswith("/"))))',
  ].join('\n');
  return execFileSync('python3', ['-I', '-c', script, zip, dir]).toString().trim().split('\n');
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

export interface Site {
  /** Where the site's root is: http://127.0.0.1:<port><base>. */
  readonly url: string;
  /** Serves another folder from now on, as a new deploy does. */
  serve(dir: string): void;
  /** Every path asked for, in order. */
  readonly asked: string[];
  close(): Promise<void>;
}

/**
 * Serves `dir` at `base` (like "/hut/"), as GitHub Pages does: files by path, a folder's
 * index.html, 404 for anything else, and ten minutes' max-age, which the service worker must see past.
 */
export async function serveSite(dir: string, base: string): Promise<Site> {
  let root = dir;
  const asked: string[] = [];
  const server: Server = createServer((request, response) => {
    const path = decodeURIComponent((request.url ?? '/').split('?')[0] as string);
    asked.push(path);
    if (!path.startsWith(base)) {
      response.writeHead(404).end();
      return;
    }
    let file = normalize(join(root, path.slice(base.length)));
    if (!file.startsWith(root)) {
      response.writeHead(404).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'max-age=600',
    });
    createReadStream(file).pipe(response);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}${base}`,
    serve: (next) => {
      root = next;
    },
    asked,
    close: () => new Promise((done) => server.close(() => done())),
  };
}
