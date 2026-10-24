/**
 * M5.1's gate on desktop (D63): a space built by mouse and keys. A prefab made with a box in it; a
 * space with three placements of it; one moved, turned and scaled by gizmo drags, each landing on
 * the snap steps and each one step of undo; two picked together in the view and grouped into a new
 * prefab; that placement renamed in the outliner; the camera flown and zoomed; nothing drawn while
 * the editor is still; and, after a reload, everything as it was.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { createProject, stored } from './kitHelpers.ts';
import {
  add,
  camera,
  dragMouse,
  frames,
  grip,
  newSpaceFile,
  objectAt,
  outlinerRow,
  scenePanel,
  showScene,
  viewStarted,
} from './spaceHelpers.ts';

test.use({ viewport: { width: 1280, height: 900 } });

const FOLDER = 'yard-works';
type Obj = {
  id: string;
  name?: string;
  prefab?: string;
  shape?: string;
  at?: number[];
  turn?: number[];
  scale?: number[];
};
type SpaceFile = { name: string; objects: Obj[] };
const yard = (page: Page) => stored(page, FOLDER, 'spaces/yard.json') as Promise<SpaceFile | null>;
const object = async (page: Page, id: string) => (await yard(page))?.objects.find((o) => o.id === id);
const distance = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - (b[i] ?? 0)));
const onSteps = (values: number[] | undefined, step: number) =>
  (values ?? []).every((v) => Math.abs(v / step - Math.round(v / step)) < 1e-9);

test('a space built with the gizmo, grouped, renamed and kept', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await createProject(page, 'Yard works');
  await showScene(page);
  // three loads with the first file opened, never with the editor's start or the panel's list.
  const viewLoaded = () =>
    page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => /\/SceneView-[^/]*\.js$/.test(name)),
    );
  expect(await viewLoaded()).toEqual([]);

  // A prefab with a box in it.
  await newSpaceFile(page, 'prefab', 'Crate');
  expect(await viewLoaded()).toHaveLength(1);
  await add(page, 'Box');
  await expect
    .poll(() => stored(page, FOLDER, 'prefabs/crate.json'))
    .toEqual({ name: 'Crate', objects: [{ id: 'box', shape: 'box' }] });

  // A space with three placements of it, side by side.
  await scenePanel(page).getByRole('button', { name: 'Back to the list' }).click();
  await newSpaceFile(page, 'space', 'Yard');
  for (let i = 0; i < 3; i++) await add(page, 'Crate');
  await expect
    .poll(async () => (await yard(page))?.objects.map((o) => [o.id, o.at ?? [0, 0, 0]]))
    .toEqual([
      ['crate', [0, 0, 0]],
      ['crate-2', [1.5, 0, 0]],
      ['crate-3', [3, 0, 0]],
    ]);
  await expect(page.locator('.scene-view')).toHaveAttribute('aria-label', 'Yard: 3 objects, 1 object chosen');
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, '[data-panel="scene"], [data-panel="outliner"], [data-panel="inspector"]')).toEqual(
    [],
  );
  await expectNoAxeIssues(page);

  // The first crate chosen in the outliner, moved by its x arrow: it lands on the 0.5 m steps.
  const outliner = page.locator('[data-panel="outliner"]');
  await outlinerRow(outliner, 'crate').click();
  await dragMouse(page, await grip(page, 'move-x'), -110);
  await expect.poll(async () => (await object(page, 'crate'))?.at?.[0] ?? 0).toBeLessThan(0);
  const moved = await object(page, 'crate');
  expect(moved?.at?.slice(1)).toEqual([0, 0]);
  expect(onSteps(moved?.at, 0.5)).toBe(true);
  // One drag, one step of undo.
  await page.getByRole('button', { name: 'Undo: Move crate' }).click();
  await expect.poll(async () => (await object(page, 'crate'))?.at).toBeUndefined();
  await page.getByRole('button', { name: 'Redo: Move crate' }).click();
  await expect.poll(async () => (await object(page, 'crate'))?.at).toEqual(moved?.at);

  // Turned by its y ring, in 15° steps.
  await scenePanel(page).getByRole('button', { name: 'Turn', exact: true }).click();
  await dragMouse(page, await grip(page, 'turn-y'), 90);
  await expect.poll(async () => (await object(page, 'crate'))?.turn?.[1] ?? 0).not.toBe(0);
  const turned = await object(page, 'crate');
  expect([turned?.turn?.[0], turned?.turn?.[2]]).toEqual([0, 0]);
  expect(onSteps(turned?.turn, 15)).toBe(true);

  // Scaled up by its own y block, in steps of 0.1; snapping the other way with Ctrl held lands off them.
  await scenePanel(page).getByRole('button', { name: 'Scale', exact: true }).click();
  await dragMouse(page, await grip(page, 'scale-y'), 45);
  await expect.poll(async () => (await object(page, 'crate'))?.scale?.[1] ?? 1).toBeGreaterThan(1);
  const scaled = await object(page, 'crate');
  expect([scaled?.scale?.[0], scaled?.scale?.[2]]).toEqual([1, 1]);
  expect(onSteps(scaled?.scale, 0.1)).toBe(true);
  await dragMouse(page, await grip(page, 'scale-y'), 13, { ctrl: true });
  await expect.poll(async () => onSteps((await object(page, 'crate'))?.scale, 0.1)).toBe(false);
  await page.getByRole('button', { name: 'Undo: Scale crate' }).click();
  await expect.poll(async () => (await object(page, 'crate'))?.scale).toEqual(scaled?.scale);

  // Two crates picked in the view, the second with Shift, and grouped into a new prefab.
  await scenePanel(page).getByRole('button', { name: 'Move', exact: true }).click();
  const second = await objectAt(page, 'crate-2');
  await page.mouse.click(second.x, second.y);
  await expect(page.locator('[data-panel="inspector"]').getByRole('heading', { name: 'crate-2' })).toBeVisible();
  const third = await objectAt(page, 'crate-3');
  await page.keyboard.down('Shift');
  await page.mouse.click(third.x, third.y);
  await page.keyboard.up('Shift');
  await expect(page.locator('[data-panel="inspector"]').getByRole('heading', { name: '2 objects' })).toBeVisible();
  await scenePanel(page).getByRole('button', { name: 'Group into prefab' }).click();
  await scenePanel(page).getByLabel('Name of the new prefab, made of the 2 objects chosen').fill('Pair');
  await scenePanel(page).getByRole('button', { name: 'Group', exact: true }).click();
  await expect
    .poll(() => stored(page, FOLDER, 'prefabs/pair.json'))
    .toEqual({
      name: 'Pair',
      objects: [
        { id: 'crate-2', prefab: 'crate', at: [-0.75, 0, 0] },
        { id: 'crate-3', prefab: 'crate', at: [0.75, 0, 0] },
      ],
    });
  await expect.poll(async () => (await yard(page))?.objects.map((o) => o.id)).toEqual(['crate', 'pair']);
  expect(await object(page, 'pair')).toEqual({ id: 'pair', prefab: 'pair', at: [2.25, 0, 0] });

  // The new placement renamed in the outliner; its id stays.
  await outliner.getByRole('button', { name: 'Rename pair' }).click();
  await outliner.getByLabel('Name of pair').fill('Crate pair');
  await outliner.getByRole('button', { name: 'Save' }).click();
  await expect(outlinerRow(outliner, 'Crate pair')).toBeVisible();
  await expect.poll(async () => (await object(page, 'pair'))?.name).toBe('Crate pair');

  // The camera flown with the right button held and W, and zoomed by the wheel.
  const view = page.locator('.scene-view');
  const box = await view.boundingBox();
  if (!box) throw new Error('No view');
  const before = await camera(page);
  await page.mouse.move(box.x + box.width / 2, box.y + 30);
  await page.mouse.down({ button: 'right' });
  await page.keyboard.down('KeyW');
  await expect.poll(async () => distance((await camera(page)).target, before.target)).toBeGreaterThan(0.5);
  await page.keyboard.up('KeyW');
  await page.mouse.up({ button: 'right' });
  const flown = await camera(page);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => (await camera(page)).distance).toBeLessThan(flown.distance);

  // A still editor draws nothing.
  const drawn = await frames(page);
  await page.waitForTimeout(800);
  expect(await frames(page)).toBe(drawn);

  // After a reload, the space and its prefabs are as they were.
  const kept = await yard(page);
  await expect(page.getByText('All changes saved.')).toBeVisible();
  await page.reload();
  const rows = page.getByRole('list', { name: 'Projects in this browser' }).getByRole('listitem');
  await rows.first().getByRole('button', { name: 'Open' }).click();
  const panel = await showScene(page);
  await expect(panel.getByRole('button', { name: 'Yard (yard) 2 objects' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Pair (pair) 2 objects' })).toBeVisible();
  await panel.getByRole('button', { name: 'Yard (yard) 2 objects' }).click();
  await viewStarted(page);
  await expect(outlinerRow(outliner, 'crate')).toBeVisible();
  await expect(outlinerRow(outliner, 'Crate pair')).toBeVisible();
  expect(await yard(page)).toEqual(kept);
  await expectNoAxeIssues(page);
  expect(errors).toEqual([]);
});
