/**
 * M5.1's gate by touch (D63), at 360×740 and 390×844 upright and 844×390 sideways: the space
 * spaces.spec.ts builds by mouse and keys, built with fingers. The Scene panel behind More on a
 * phone and a tab on its side; the outliner a tab of the inspector sheet upright and a panel of its
 * own sideways; gizmo drags by one finger, landing on the steps; two picked with Select more and
 * grouped; the placement renamed; a pinch; every screen in reach; and all of it after a reload.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { createProject, stored } from './kitHelpers.ts';
import { showProject } from './ludus.ts';
import {
  add,
  camera,
  dragTouch,
  grip,
  newSpaceFile,
  objectAt,
  outlinerRow,
  pinchOut,
  scenePanel,
  showScene,
  viewStarted,
} from './spaceHelpers.ts';
import { lowerSheet } from './templateHelpers.ts';

const FOLDER = 'yard-works';
type Obj = { id: string; name?: string; prefab?: string; at?: number[]; turn?: number[]; scale?: number[] };
const yard = (page: Page) => stored(page, FOLDER, 'spaces/yard.json') as Promise<{ objects: Obj[] } | null>;
const object = async (page: Page, id: string) => (await yard(page))?.objects.find((o) => o.id === id);
const onSteps = (values: number[] | undefined, step: number) =>
  (values ?? []).every((v) => Math.abs(v / step - Math.round(v / step)) < 1e-9);

/** The outliner: a tab of the sheet upright (D63), its own tab sideways. */
async function showOutliner(page: Page): Promise<Locator> {
  const handle = page.locator('.sheet-handle');
  if ((await handle.isVisible()) && (await handle.getAttribute('aria-expanded')) === 'false') await handle.tap();
  await page.getByRole('tab', { name: 'Outliner' }).tap();
  const outliner = page.locator('[data-panel="outliner"]');
  await expect(outliner.getByRole('heading', { name: 'Outliner' })).toBeVisible();
  return outliner;
}

/** The whole view in sight, the sheet lowered: what a finger drags on. */
async function toView(page: Page): Promise<void> {
  await lowerSheet(page);
  await scenePanel(page)
    .locator('.scene-view')
    .evaluate((view) => view.scrollIntoView({ block: 'nearest' }));
}

/**
 * The whole view on screen once scrolled to: each corner the canvas's own, under no bar. On a phone on
 * its side the view is held to what fits; a planted view as tall as upright still let every drag land.
 */
async function expectViewWhole(page: Page): Promise<void> {
  await toView(page);
  const covered = await scenePanel(page)
    .locator('.scene-canvas')
    .evaluate((canvas) => {
      const box = canvas.getBoundingClientRect();
      // 8 px in from each corner: nearer, the view's rounded corner clips the canvas.
      const corners: [number, number][] = [
        [box.left + 8, box.top + 8],
        [box.right - 8, box.top + 8],
        [box.left + 8, box.bottom - 8],
        [box.right - 8, box.bottom - 8],
      ];
      return corners.filter(([x, y]) => document.elementFromPoint(x, y) !== canvas).map(([x, y]) => `${x},${y}`);
    });
  expect(covered).toEqual([]);
}

async function expectInReach(page: Page): Promise<void> {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, '[data-panel="scene"], [data-panel="outliner"], [data-panel="inspector"]')).toEqual(
    [],
  );
  await expectNoAxeIssues(page);
}

/** A handle dragged by one finger, after Frame puts what is chosen in the middle of the view, as a person would. */
async function dragHandle(page: Page, name: string, px: number): Promise<void> {
  await scenePanel(page).getByRole('button', { name: 'Frame' }).tap();
  await toView(page);
  const at = await grip(page, name);
  await dragTouch(page, at, at.along, px);
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`a space built by touch, ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('placed, moved, turned, scaled, grouped, renamed and kept', async ({ page }) => {
      test.setTimeout(240_000);
      const errors = watchErrors(page);
      await createProject(page, 'Yard works');
      await showScene(page);
      await expectInReach(page);

      await newSpaceFile(page, 'prefab', 'Crate');
      await add(page, 'Box');
      await expect
        .poll(() => stored(page, FOLDER, 'prefabs/crate.json'))
        .toEqual({
          name: 'Crate',
          objects: [{ id: 'box', shape: 'box' }],
        });
      await scenePanel(page).getByRole('button', { name: 'Back to the list' }).tap();
      await newSpaceFile(page, 'space', 'Yard');
      for (let i = 0; i < 3; i++) await add(page, 'Crate');
      await expect
        .poll(async () => (await yard(page))?.objects.map((o) => o.id))
        .toEqual(['crate', 'crate-2', 'crate-3']);
      await expectInReach(page);
      await expectViewWhole(page);

      // The first crate chosen in the outliner, then moved, turned and scaled by one finger.
      const outliner = await showOutliner(page);
      await outlinerRow(outliner, 'crate').tap();
      await expectInReach(page);
      await dragHandle(page, 'move-x', -100);
      await expect.poll(async () => (await object(page, 'crate'))?.at?.[0] ?? 0).toBeLessThan(0);
      expect(onSteps((await object(page, 'crate'))?.at, 0.5)).toBe(true);
      await scenePanel(page).getByRole('button', { name: 'Turn', exact: true }).tap();
      await dragHandle(page, 'turn-y', 80);
      await expect.poll(async () => (await object(page, 'crate'))?.turn?.[1] ?? 0).not.toBe(0);
      expect(onSteps((await object(page, 'crate'))?.turn, 15)).toBe(true);
      await scenePanel(page).getByRole('button', { name: 'Scale', exact: true }).tap();
      await dragHandle(page, 'scale-y', 40);
      await expect.poll(async () => (await object(page, 'crate'))?.scale?.[1] ?? 1).toBeGreaterThan(1);
      expect(onSteps((await object(page, 'crate'))?.scale, 0.1)).toBe(true);

      // Two picked by tapping them in the view with Select more, and grouped. With it on, a tap on the
      // chosen crate's row takes it away, and Frame with nothing chosen shows the whole space.
      const view = page.locator('.scene-view');
      await scenePanel(page).getByRole('button', { name: 'Move', exact: true }).tap();
      await scenePanel(page).getByRole('button', { name: 'Select more' }).tap();
      await outlinerRow(await showOutliner(page), 'crate').tap();
      await expect(view).toHaveAttribute('aria-label', 'Yard: 3 objects');
      await lowerSheet(page);
      await scenePanel(page).getByRole('button', { name: 'Frame' }).tap();
      await toView(page);
      for (const id of ['crate-2', 'crate-3']) {
        const at = await objectAt(page, id);
        await page.touchscreen.tap(at.x, at.y);
      }
      await scenePanel(page).getByRole('button', { name: 'Select more' }).tap();
      await expect(view).toHaveAttribute('aria-label', 'Yard: 3 objects, 2 objects chosen');
      await lowerSheet(page);
      await scenePanel(page).getByRole('button', { name: 'Group into prefab' }).tap();
      await scenePanel(page).getByLabel('Name of the new prefab, made of the 2 objects chosen').fill('Pair');
      await scenePanel(page).getByRole('button', { name: 'Group', exact: true }).tap();
      await expect.poll(async () => (await yard(page))?.objects.map((o) => o.id)).toEqual(['crate', 'pair']);
      expect(await stored(page, FOLDER, 'prefabs/pair.json')).toEqual({
        name: 'Pair',
        objects: [
          { id: 'crate-2', prefab: 'crate', at: [-0.75, 0, 0] },
          { id: 'crate-3', prefab: 'crate', at: [0.75, 0, 0] },
        ],
      });

      // Renamed in the outliner, by touch.
      const list = await showOutliner(page);
      await list.getByRole('button', { name: 'Rename pair' }).tap();
      await list.getByLabel('Name of pair').fill('Crate pair');
      await list.getByRole('button', { name: 'Save' }).tap();
      await expect.poll(async () => (await object(page, 'pair'))?.name).toBe('Crate pair');
      await expectInReach(page);

      // A pinch zooms in.
      await toView(page);
      const before = await camera(page);
      await pinchOut(page);
      await expect.poll(async () => (await camera(page)).distance).toBeLessThan(before.distance);

      // Kept through a reload.
      const kept = await yard(page);
      await page.reload();
      await showProject(page);
      const rows = page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem');
      await rows.first().getByRole('button', { name: 'Open' }).tap();
      const panel = await showScene(page);
      await panel.getByRole('button', { name: 'Yard (yard) 2 objects' }).tap();
      await viewStarted(page);
      await expect(outlinerRow(await showOutliner(page), 'Crate pair')).toBeVisible();
      expect(await yard(page)).toEqual(kept);
      await expectInReach(page);
      expect(errors).toEqual([]);
    });
  });
}
