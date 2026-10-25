/**
 * budgets.json read and held against the build (M5.7, D69). A size budget is a reading plus 5%;
 * a milestone that adds weight on purpose raises it in the same change, with its new reading.
 * The count budgets are the perf e2e's: this file only reads them.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { bytesIn, chunkNamed, gzipped, precached, startFiles, staticClosure } from './measure.ts';

export const SIZES = [
  'editor-start',
  'scene-view',
  'models-view',
  'walk',
  'precache',
  'space-wrecked-web',
  'trail-web',
] as const;
export type SizeId = (typeof SIZES)[number];

export interface Budget {
  readonly budget: number;
  readonly reading: number;
  /** The date of the reading, YYYY-MM-DD. */
  readonly read: string;
  readonly of: string;
}

export interface CountBudget {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly reading: { readonly drawCalls: number; readonly triangles: number };
  readonly read: string;
}

export interface Budgets {
  readonly sizes: Record<SizeId, Budget>;
  readonly counts: Record<string, CountBudget>;
}

export const readBudgets = (path: string): Budgets => JSON.parse(readFileSync(path, 'utf8')) as Budgets;

/** Each size, in bytes, of the editor built into `dist`. */
export function measureSizes(dist: string): Record<SizeId, number> {
  const assets = join(dist, 'assets');
  const start = new Set(startFiles(dist));
  const adds = (chunk: string, loaded: ReadonlySet<string>) =>
    staticClosure(assets, chunkNamed(assets, chunk)).filter((name) => !loaded.has(name));
  const scene = adds('SceneView', start);
  const models = adds('modelsView', new Set([...start, ...scene]));
  const inAssets = (names: readonly string[]) => names.map((name) => join(assets, name));
  return {
    'editor-start': gzipped([join(dist, 'index.html'), ...inAssets([...start])]),
    'scene-view': gzipped(inAssets(scene)),
    'models-view': gzipped(inAssets(models)),
    // walk.js (M5.8): three, Rapier and the stage, the one file every page that walks a space loads.
    walk: gzipped([join(dist, 'runtime/walk.js')]),
    precache: precached(dist).reduce((sum, path) => sum + statSync(join(dist, path)).size, 0),
    'space-wrecked-web': bytesIn(join(dist, 'games/space-wrecked')),
    'trail-web': bytesIn(join(dist, 'games/trail')),
  };
}

export interface SizeLine {
  readonly id: SizeId;
  readonly bytes: number;
  readonly budget: number;
  readonly over: boolean;
}

export function checkSizes(budgets: Budgets, measured: Record<SizeId, number>): SizeLine[] {
  return SIZES.map((id) => {
    const budget = budgets.sizes[id]?.budget;
    if (typeof budget !== 'number') throw new Error(`budgets.json has no size budget "${id}"`);
    return { id, bytes: measured[id], budget, over: measured[id] > budget };
  });
}

/**
 * The runtime the editor keeps for Export and walks spaces with (runtime/files.json's files and
 * walk.js, M5.8) that its service worker doesn't precache: each would need the network. Workbox
 * leaves out anything over its size limit without a word, and walk.js is about 7 MB.
 */
export function runtimeUncached(dist: string): string[] {
  const list = join(dist, 'runtime/files.json');
  if (!existsSync(list)) return ['runtime/files.json'];
  const { files, walk } = JSON.parse(readFileSync(list, 'utf8')) as { files: string[]; walk?: string };
  const kept = new Set(precached(dist));
  return ['files.json', ...files, ...(walk ? [walk] : [])].map((f) => `runtime/${f}`).filter((f) => !kept.has(f));
}
