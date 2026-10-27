/** The size budgets' reader (M5.7, D69): on a made-up build, then budgets.json itself. */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { type Budgets, checkSizes, measureSizes, readBudgets, runtimeUncached, SIZES } from '../src/budgets.ts';
import { startFiles, staticClosure } from '../src/measure.ts';

/** A built editor, its chunks importing as Vite's minified ones do. */
function dist(): string {
  const dir = mkdtempSync(join(tmpdir(), 'eb-budgets-'));
  const files: Record<string, string> = {
    'index.html': `<!doctype html><head>
    <script type="module" crossorigin src="/assets/main-a1.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/shared-b2.js">
    <link rel="stylesheet" crossorigin href="/assets/main-c3.css"></head>`,
    'assets/main-a1.js': 'import{a as e}from"./shared-b2.js";const t=()=>import("./SceneView-d4.js");e(t);',
    'assets/shared-b2.js': 'export const a=e=>e;'.repeat(20),
    'assets/main-c3.css': 'body{margin:0}',
    'assets/SceneView-d4.js':
      'import*as t from"./three-e5.js";import"./side-f6.js";export{a}from"./shared-b2.js";import("./modelsView-g7.js");',
    'assets/three-e5.js': 'export const Mesh=1;import"./SceneView-d4.js";'.repeat(30),
    'assets/side-f6.js': 'console.log(1);',
    'assets/modelsView-g7.js': 'import{Mesh}from"./three-e5.js";import"./draco-h8.js";',
    'assets/draco-h8.js': 'export default 2;',
    'sw.js':
      'define(["./workbox"],function(e){e.precacheAndRoute([{url:"index.html",revision:"1"},{url:"assets/main-a1.js",revision:null},{url:"runtime/files.json",revision:"2"},{url:"runtime/game.js",revision:"3"}])});',
    'runtime/files.json':
      '{"version":"0.0.1","files":["game.js"],"walk":"walk.js","nav":"nav.js","stage2d":"stage2d.js"}',
    'runtime/game.js': 'game();',
    'games/space-wrecked/index.html': 'x'.repeat(100),
    'games/space-wrecked/icons/icon.png': 'y'.repeat(50),
    'runtime/walk.js': 'const rapier="AGFzbQ";'.repeat(40),
    'runtime/nav.js': 'const recast="AGFzbQ";'.repeat(25),
    'runtime/stage2d.js': 'ctx.drawImage(sheet);'.repeat(15),
    'games/trail/index.html': 'z'.repeat(70),
    'games/trail/walk.0a1b2c3d.js': 'w'.repeat(30),
    'games/kaldvik/index.html': 'k'.repeat(60),
    'games/kaldvik/nav.0a1b2c3d.js': 'n'.repeat(20),
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}
const gz = (text: string) => gzipSync(text, { level: 9 }).length;

describe('the size budgets', () => {
  it('follow a chunk’s static imports, never its dynamic ones, each chunk once', () => {
    const assets = join(dist(), 'assets');
    expect(staticClosure(assets, 'SceneView-d4.js')).toEqual([
      'SceneView-d4.js',
      'three-e5.js',
      'side-f6.js',
      'shared-b2.js',
    ]);
    expect(staticClosure(assets, 'main-a1.js')).toEqual(['main-a1.js', 'shared-b2.js']);
  });

  it('measure the start, what the 3D view and its models add to it, walk.js, nav.js, stage2d.js, the precache and the exports', () => {
    const dir = dist();
    expect(startFiles(dir)).toEqual(['main-a1.js', 'shared-b2.js', 'main-c3.css']);
    const read = (path: string) => readFileSync(join(dir, path), 'utf8');
    const sizes = measureSizes(dir);
    const sum = (paths: string[]) => paths.reduce((n, p) => n + gz(read(p)), 0);
    expect(sizes['editor-start']).toBe(
      sum(['index.html', 'assets/main-a1.js', 'assets/shared-b2.js', 'assets/main-c3.css']),
    );
    // shared-b2.js came with the start; three-e5.js with the view.
    expect(sizes['scene-view']).toBe(sum(['assets/SceneView-d4.js', 'assets/three-e5.js', 'assets/side-f6.js']));
    expect(sizes['models-view']).toBe(sum(['assets/modelsView-g7.js', 'assets/draco-h8.js']));
    expect(sizes.precache).toBe(
      ['index.html', 'assets/main-a1.js', 'runtime/files.json', 'runtime/game.js'].reduce(
        (n, p) => n + read(p).length,
        0,
      ),
    );
    expect(sizes.walk).toBe(gz(read('runtime/walk.js')));
    expect(sizes.nav).toBe(gz(read('runtime/nav.js')));
    expect(sizes.stage2d).toBe(gz(read('runtime/stage2d.js')));
    expect(sizes['space-wrecked-web']).toBe(150);
    expect(sizes['trail-web']).toBe(100);
    expect(sizes['kaldvik-web']).toBe(80);
  });

  it('say which is over its budget, and refuse a budgets.json without one', () => {
    const measured = Object.fromEntries(SIZES.map((id) => [id, 1000])) as Record<(typeof SIZES)[number], number>;
    const at = (budget: number) => ({ budget, reading: 950, read: '2026-10-24', of: '' });
    const budgets = { sizes: Object.fromEntries(SIZES.map((id) => [id, at(1000)])), counts: {} } as Budgets;
    expect(checkSizes(budgets, measured).filter((line) => line.over)).toEqual([]);
    const over = { ...budgets, sizes: { ...budgets.sizes, 'scene-view': at(999) } };
    expect(checkSizes(over, measured).filter((line) => line.over)).toEqual([
      { id: 'scene-view', bytes: 1000, budget: 999, over: true },
    ]);
    const { precache: _, ...rest } = budgets.sizes;
    expect(() => checkSizes({ ...budgets, sizes: rest } as Budgets, measured)).toThrow('no size budget "precache"');
  });
});

describe('budgets.json', () => {
  const budgets = readBudgets(resolve(import.meta.dirname, '../../../budgets.json'));
  const date = /^\d{4}-\d{2}-\d{2}$/;

  it('holds each size to its reading plus at most 5%, with the date read', () => {
    for (const id of SIZES) {
      const size = budgets.sizes[id];
      expect(size.read, id).toMatch(date);
      expect(size.budget, id).toBeGreaterThanOrEqual(size.reading);
      expect(size.budget, id).toBeLessThanOrEqual(Math.ceil(size.reading * 1.05));
    }
  });

  it('holds each count to its reading plus at most 10%, with the date read', () => {
    expect(Object.keys(budgets.counts).length).toBeGreaterThan(0);
    for (const [id, count] of Object.entries(budgets.counts)) {
      expect(count.read, id).toMatch(date);
      for (const what of ['drawCalls', 'triangles'] as const) {
        expect(count[what], id).toBeGreaterThanOrEqual(count.reading[what]);
        expect(count[what], id).toBeLessThanOrEqual(Math.ceil(count.reading[what] * 1.1));
      }
    }
  });

  it('find the runtime the service worker doesn’t keep: walk.js, nav.js and stage2d.js, left out here as Workbox leaves out a big file', () => {
    expect(runtimeUncached(dist())).toEqual(['runtime/walk.js', 'runtime/nav.js', 'runtime/stage2d.js']);
  });
});
