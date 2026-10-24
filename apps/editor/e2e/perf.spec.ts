/**
 * M5.7's gate on desktop (D69, docs/specs/performance.md#the-gate), by mouse and keys: the grove
 * imported, its glade opened with Stats shown; Auto at Low on CI's software renderer, and why;
 * Low, Medium and High picked in turn, each read back from three (pixel ratio, antialiasing,
 * shadows, the sky, the drops), each lower tier's plants a subset of the higher's, the camera
 * kept as the view is made again, and the draw calls and triangles within budgets.json's; after a
 * reload, the tier picked and Stats as they were. Then Auto on a computer it reads as High,
 * stepping down as the software renderer's frames run long, and not once High is picked by hand.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import {
  chooseQuality,
  countBudget,
  expectSubset,
  expectTier,
  FAST_COMPUTER,
  openGlade,
  overlay,
  perf,
  plantGrid,
  reopenGlade,
  TIER_WORDS,
  type Tier,
} from './perfHelpers.ts';
import { camera, scenePanel } from './spaceHelpers.ts';

// Auto, as a first visit has it: the config's High is for the specs before M5.7.
test.use({ viewport: { width: 1280, height: 900 }, storageState: { cookies: [], origins: [] } });

const inReach = async (page: Page) => {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, '[data-panel="scene"]')).toEqual([]);
  await expectNoAxeIssues(page);
};

test('the glade at each tier, Auto by the device, within its count budgets, and kept', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await openGlade(page, false);
  const panel = scenePanel(page);
  await panel.getByRole('button', { name: 'Stats' }).click();
  await expect(panel.getByRole('button', { name: 'Stats' })).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByLabel('Quality')).toHaveValue('auto');
  await expect(overlay(page)).toContainText('Auto: Low (a software renderer)');
  await expect(overlay(page)).toContainText('WebGL2, pixel ratio 1');
  await expectTier(page, 'low', 1);
  await inReach(page);

  const framed = await camera(page);
  const grids: Partial<Record<Tier, number[]>> = {};
  for (const tier of ['low', 'medium', 'high'] as const) {
    await chooseQuality(page, TIER_WORDS[tier]);
    const now = await expectTier(page, tier, 1);
    expect(await camera(page)).toEqual(framed);
    await expect(overlay(page)).toContainText(`Chosen: ${TIER_WORDS[tier]}`);
    await expect(overlay(page)).toContainText(/\d+ draw calls, [\d,]+ triangles/);
    const budget = countBudget(`glade-${tier}`);
    console.log(`reading: glade at ${tier}: ${now.drawCalls} draw calls, ${now.triangles} triangles`);
    expect(now.drawCalls).toBeLessThanOrEqual(budget.drawCalls);
    expect(now.triangles).toBeLessThanOrEqual(budget.triangles);
    grids[tier] = await plantGrid(page);
  }
  expectSubset(grids.low ?? [], grids.medium ?? []);
  expectSubset(grids.medium ?? [], grids.high ?? []);
  await inReach(page);

  await page.reload();
  const rows = page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem');
  await rows.first().getByRole('button', { name: 'Open' }).click();
  await reopenGlade(page, false);
  await expect(panel.getByLabel('Quality')).toHaveValue('high');
  await expect(panel.getByRole('button', { name: 'Stats' })).toHaveAttribute('aria-pressed', 'true');
  await expect(overlay(page)).toContainText('Chosen: High');
  await expectTier(page, 'high', 1);
  expect(errors).toEqual([]);
});

test('Auto steps down as frames run long, never while a tier is picked', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await page.addInitScript(FAST_COMPUTER);
  await openGlade(page, false);
  const panel = scenePanel(page);
  await panel.getByRole('button', { name: 'Stats' }).click();
  // The hints say High; the warm-up and a window of frames come before any step. Under load the
  // step can come before the overlay's first reading, so the overlay is read once it has.
  await expect.poll(async () => (await perf(page))?.tier).toBe('high');
  // The glade at High in software WebGL draws a frame in 80 to 100 ms (Readings): a step down.
  await expect.poll(async () => (await perf(page))?.tier, { timeout: 30_000 }).not.toBe('high');
  await expect(overlay(page)).toContainText(/Auto: (Medium, stepped down from High|Low, stepped down from Medium)/);

  // Picked by hand, High stays, however long its frames: longer than the warm-up and a window.
  await chooseQuality(page, 'High');
  await expect(overlay(page)).toContainText('Chosen: High');
  await page.waitForTimeout(7_000);
  const held = await perf(page);
  expect(held?.tier).toBe('high');
  expect(held?.frames.p95).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});
