/**
 * What M5.7's specs share (D69, docs/specs/performance.md#the-gate): the grove imported and its
 * glade opened, the view's tier read back through window.__ebViewport.perf(), each tier's settings
 * as three should have them, the plants each tier draws, and the count budgets in budgets.json.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { REPO } from './ludus.ts';
import { importFolder } from './mapHelpers.ts';
import { scenePanel, showScene, viewStarted } from './spaceHelpers.ts';

export const GROVE = join(REPO, 'tools/cli/test/fixtures/grove');
export type Tier = 'low' | 'medium' | 'high';
export const TIER_WORDS = { low: 'Low', medium: 'Medium', high: 'High' } as const satisfies Record<Tier, string>;

export interface Perf {
  tier: Tier;
  backend: 'webgpu' | 'webgl';
  pixelRatio: number;
  antialias: boolean;
  shadowMap: number;
  objectShadows: boolean;
  groundShadows: boolean;
  foliageShadows: boolean;
  shadowReach: number;
  sky: string | null;
  foliageReach: number;
  foliageShare: number;
  weatherShare: number;
  frames: { count: number; fps: number; median: number; p95: number };
  drawCalls: number;
  triangles: number;
}

type Hooked = {
  __ebViewport?: {
    perf(): Perf;
    environment(): { particles: number; sky: string } | null;
    foliage(): { foliage: string; plants: number; drawn: number; froms: number[] }[];
    plantsNear(id: string, x: number, z: number, radius: number): number;
  };
};

export const perf = (page: Page) => page.evaluate(() => (window as unknown as Hooked).__ebViewport?.perf() ?? null);

/** The glade's rain at 0.5, all of its drops: what High draws and each lower tier a share of. */
export const DROPS = 1500;

/** What three should hold at each tier, at the device's pixel ratio. */
export function settingsOf(tier: Tier, dpr: number) {
  const most = { low: 1, medium: 1.5, high: 2 }[tier];
  return {
    tier,
    pixelRatio: Math.min(dpr, most),
    antialias: tier === 'high',
    shadowMap: { low: 0, medium: 1024, high: 2048 }[tier],
    groundShadows: tier !== 'low',
    foliageShadows: tier === 'high',
    sky: tier === 'low' ? 'gradient' : 'physical',
    weatherShare: { low: 0.25, medium: 0.5, high: 1 }[tier],
  };
}

/** The grove from its fixture, the Scene panel shown and the glade's view started. */
export async function openGlade(page: Page, touch: boolean): Promise<void> {
  await importFolder(page, GROVE, 'grove', 'Grove');
  await reopenGlade(page, touch);
}

/** The glade opened again from the Scene panel's list, as after a reload. */
export async function reopenGlade(page: Page, touch: boolean): Promise<void> {
  const panel = await showScene(page);
  const glade = panel.getByRole('button', { name: /^Glade/ });
  await (touch ? glade.tap() : glade.click());
  await viewStarted(page);
}

/** The view at `tier`, every plant's model decoded and drawn: what its counts are of. */
export async function drawnAt(page: Page, tier: Tier): Promise<Perf> {
  await expect.poll(async () => (await perf(page))?.tier, { timeout: 20_000 }).toBe(tier);
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          (window as unknown as Hooked).__ebViewport
            ?.foliage()
            .every((f) => f.froms.length > 0 && f.drawn === f.plants && f.plants > 0),
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
  // Rain falls every frame, so the last frame's counts are of everything shown now.
  await expect.poll(async () => (await perf(page))?.frames.count ?? 0, { timeout: 20_000 }).toBeGreaterThan(10);
  return (await perf(page)) as Perf;
}

/** Quality's row under the toolbar, opened by its button when it isn't. */
export async function qualityRow(page: Page, touch: boolean): Promise<Locator> {
  const panel = scenePanel(page);
  const row = panel.getByRole('group', { name: 'Quality and stats' });
  if (!(await row.isVisible())) {
    const open = panel.getByRole('button', { name: 'Quality', exact: true });
    await (touch ? open.tap() : open.click());
  }
  await expect(row).toBeVisible();
  return row;
}

/** Quality picked from its row's list. A phone's list opens the system's picker, which the test can't tap. */
export async function chooseQuality(
  page: Page,
  words: 'Auto' | 'Low' | 'Medium' | 'High',
  touch = false,
): Promise<void> {
  await (await qualityRow(page, touch)).getByLabel('Quality').selectOption({ label: words });
}

/** Stats shown or hidden from Quality's row. */
export async function pressStats(page: Page, touch: boolean): Promise<Locator> {
  const stats = (await qualityRow(page, touch)).getByRole('button', { name: 'Stats' });
  await (touch ? stats.tap() : stats.click());
  return stats;
}

/** Three's settings, the drops, and the glade's two foliage types' plants at the tier now drawn. */
export async function expectTier(page: Page, tier: Tier, dpr: number): Promise<Perf> {
  const now = await drawnAt(page, tier);
  expect(now).toMatchObject(settingsOf(tier, dpr));
  // The sun's shadow camera covers the glade's corners and heights: 32 m each way, 16 m high.
  if (tier === 'low') expect(now.shadowReach).toBe(0);
  else expect(now.shadowReach).toBeGreaterThanOrEqual(Math.hypot(32, 32, 16) - 0.01);
  const drops = await page.evaluate(() => (window as unknown as Hooked).__ebViewport?.environment()?.particles);
  expect(drops).toBe(Math.floor(DROPS * settingsOf(tier, dpr).weatherShare));
  return now;
}

/**
 * How many plants of each type stand within 1.5 m of each point of a 2 m grid over the glade.
 * A lower tier's plants are a subset of a higher's, so no circle holds more at the lower.
 */
export const plantGrid = (page: Page) =>
  page.evaluate(() => {
    const hook = (window as unknown as Hooked).__ebViewport;
    const counts: number[] = [];
    for (const id of ['pines', 'scrub'])
      for (let x = -32; x <= 32; x += 2)
        for (let z = -32; z <= 32; z += 2) counts.push(hook?.plantsNear(id, x, z, 1.5) ?? 0);
    return counts;
  });

export function expectSubset(lower: readonly number[], higher: readonly number[]): void {
  expect(lower).toHaveLength(higher.length);
  const more = lower.flatMap((n, k) => (n > (higher[k] as number) ? [k] : []));
  expect(more, 'circles with more plants at the lower tier').toEqual([]);
  const sum = (list: readonly number[]) => list.reduce((a, b) => a + b, 0);
  expect(sum(lower)).toBeLessThan(sum(higher));
}

/** The draw calls and triangles budgets.json allows a scene at a tier. */
export function countBudget(id: string): { drawCalls: number; triangles: number } {
  const budgets = JSON.parse(readFileSync(join(REPO, 'budgets.json'), 'utf8')) as {
    counts: Record<string, { drawCalls: number; triangles: number }>;
  };
  const budget = budgets.counts[id];
  if (!budget) throw new Error(`budgets.json has no count budget "${id}"`);
  return budget;
}

/**
 * Every tier the view draws at from the page's first frame, recorded on each frame: Auto never
 * draws a tier it hasn't read the device for, a view made and made again on a phone.
 */
export const RECORD_TIERS = () => {
  const seen: string[] = [];
  (window as unknown as { __tiersSeen: string[] }).__tiersSeen = seen;
  const tick = () => {
    const tier = (window as unknown as Hooked).__ebViewport?.perf().tier;
    if (tier && seen.at(-1) !== tier) seen.push(tier);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
export const tiersSeen = (page: Page) =>
  page.evaluate(() => (window as unknown as { __tiersSeen?: string[] }).__tiersSeen ?? []);

/** The overlay's lines. */
export const overlay = (page: Page) => scenePanel(page).locator('.perf-overlay');

/**
 * A computer Auto would draw at High: 16 cores, 8 GB and a named GPU by WebGL's renderer string,
 * and no WebGPU, as CI's software renderer has none; three then draws in WebGL as it does there.
 */
export const FAST_COMPUTER = () => {
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 16 });
  Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8 });
  Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined });
  const real = WebGL2RenderingContext.prototype.getParameter;
  WebGL2RenderingContext.prototype.getParameter = function (this: WebGL2RenderingContext, name: number) {
    // UNMASKED_RENDERER_WEBGL, from WEBGL_debug_renderer_info.
    return name === 0x9246 ? 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)' : real.call(this, name);
  };
};
