/**
 * M7.1's editor gate (D83, docs/specs/2d-scenes.md#the-gate), what its specs share: a project's 2D
 * space built from the starter sprites in the Scene panel, and what window.__ebView2d says the view
 * drew: its zoom, its middle, each item's box on the page, the chosen.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { hands } from './campHelpers.ts';
import { press } from './componentHelpers.ts';
import { stored } from './kitHelpers.ts';
import { showAssets } from './ludus.ts';
import { scenePanel, showScene } from './spaceHelpers.ts';

export const FOLDER = 'night-wall';

type Box = { x: number; y: number; w: number; h: number };

export interface View2dSeen {
  readonly zoom: number;
  readonly centre: readonly [number, number];
  readonly drawn: readonly { path: string; sprite?: string; at: readonly [number, number]; page: Box }[];
  readonly picked: readonly string[];
  readonly frames: number;
}

export async function view2d(page: Page): Promise<View2dSeen> {
  const seen = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: the view's own hook, read as it is
    const hook = (window as any).__ebView2d;
    return hook
      ? { zoom: hook.zoom(), centre: hook.centre(), drawn: hook.drawn(), picked: hook.picked(), frames: hook.frames() }
      : null;
  });
  if (!seen) throw new Error('No 2D view is open');
  return seen as View2dSeen;
}

/** A space object as the stored file has it. */
export async function placed(page: Page, id: string): Promise<Record<string, unknown> | undefined> {
  const space = (await stored(page, FOLDER, 'spaces/wall.json')) as { objects?: { id: string }[] } | null;
  return space?.objects?.find((o) => o.id === id) as Record<string, unknown> | undefined;
}

/** The starter sprites added from the Assets panel. */
export async function addStarterSprites(page: Page, touch: boolean): Promise<void> {
  const assets = await showAssets(page);
  await press(assets.getByRole('button', { name: 'Add starter sprites' }), touch);
  await expect
    .poll(() => stored(page, FOLDER, 'records/sprite/torch.json'))
    .toMatchObject({ name: 'Torch', sheet: 'starter-sprites/torch.png' });
}

/** New 2D space, named Wall: it opens in the 2D view. */
export async function newWall(page: Page, touch: boolean): Promise<Locator> {
  const panel = await showScene(page);
  await press(panel.getByRole('button', { name: 'New 2D space' }), touch);
  await panel.getByLabel('Name of the new 2D space').fill('Wall');
  await press(panel.getByRole('button', { name: 'Create' }), touch);
  await expect.poll(() => stored(page, FOLDER, 'spaces/wall.json')).toEqual({ name: 'Wall', view: '2d', objects: [] });
  const view = panel.getByRole('application', { name: /^Wall: / });
  await expect(view).toHaveAttribute('aria-roledescription', '2D view');
  await expect.poll(async () => (await view2d(page)).frames).toBeGreaterThan(0);
  return view;
}

/** Add → Sprite…, the sprite named: put in the middle of the view and chosen. */
export async function placeSprite(page: Page, name: RegExp, id: string, touch: boolean): Promise<void> {
  const panel = scenePanel(page);
  await press(panel.getByRole('button', { name: 'Add', exact: true }), touch);
  await press(panel.getByRole('button', { name: 'Sprite…' }), touch);
  await press(page.getByRole('dialog', { name: 'Place a sprite' }).getByRole('option', { name }).first(), touch);
  await expect.poll(async () => (await placed(page, id))?.components).toEqual({ sprite: { sprite: id } });
  await expect.poll(async () => (await view2d(page)).picked).toEqual([id]);
}

/** The item drawn at `path`, its box on the page, once the view has drawn it. */
export async function drawnBox(page: Page, path: string): Promise<Box> {
  let box: Box | undefined;
  await expect
    .poll(async () => {
      box = (await view2d(page)).drawn.find((d) => d.path === path)?.page;
      return box !== undefined;
    })
    .toBe(true);
  return box as Box;
}

/** A drag from the middle of `from` by `by` CSS pixels: the mouse's, or a finger's. */
export async function dragBy(page: Page, from: Box, by: readonly [number, number], touch: boolean): Promise<void> {
  const [x, y] = [from.x + from.w / 2, from.y + from.h / 2];
  if (!touch) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + by[0], y + by[1], { steps: 8 });
    await page.mouse.up();
    return;
  }
  const fingers = await hands(page);
  try {
    await fingers.press(1, x, y);
    await fingers.slide(1, by[0], by[1]);
    await fingers.lift(1);
  } finally {
    await fingers.close();
  }
}

/** A panel to the front: its tab where the layout has one, else More's item on a phone. */
export async function showPanel(page: Page, name: string, touch: boolean): Promise<Locator> {
  const tab = page.getByRole('tab', { name, exact: true });
  if (await tab.isVisible()) await press(tab, touch);
  else {
    await press(page.getByRole('tab', { name: 'More' }), touch);
    await press(page.locator('[data-panel="more"]').getByRole('button', { name: new RegExp(`^${name}`) }), touch);
  }
  return page.locator(`[data-panel="${name.toLowerCase()}"]`);
}
