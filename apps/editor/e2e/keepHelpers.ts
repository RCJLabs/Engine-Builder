/**
 * M7.1's gate (D83, docs/specs/2d-scenes.md#the-gate), what its specs share: the keep brought into
 * the editor and played, and what window.__ebStage2d says it drew: the scale, the canvas's art
 * pixels, the camera, each item's sprite, clip, frame and whole-pixel place, the uses' buttons, the
 * guards walking and what was sent.
 */
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { game, newGame, showPlay } from './hutScreens.ts';
import { fixtureZip } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';

export const KEEP = join(import.meta.dirname, '../../../tools/cli/test/fixtures/keep');
/** The starter sprites' sixteen colours (tools/starter-kit/src/sprites/palette.ts). */
export const PALETTE = [
  '#0a0b14',
  '#131a33',
  '#1f2a4f',
  '#2f3f6b',
  '#3b3c4f',
  '#5e6072',
  '#8c8fa1',
  '#e9e5c8',
  '#b7c3e8',
  '#8c2f1c',
  '#e5772a',
  '#ffd36b',
  '#5a3a22',
  '#7d2233',
  '#3e6b8c',
  '#d8a27c',
];

type Point = readonly [number, number];
type Box = { x: number; y: number; w: number; h: number };

/** What the 2D stage says of itself (stage2d/hook.ts), read once. */
export interface Stage2dSeen {
  readonly space: string;
  readonly scaled: { scale: number; cols: number; rows: number; dpr: number };
  readonly camera: Point;
  readonly drawn: readonly {
    path: string;
    sprite?: string;
    clip?: string;
    frame?: number;
    at: Point;
    flip: boolean;
    box: Box;
  }[];
  readonly frames: number;
  readonly uses: readonly { path: string; label: string; box: Box }[];
  readonly used: readonly { path: string; sent: string }[];
  readonly walkers: readonly { actor: string; at: Point; goal?: string; moving: boolean; flip: boolean }[];
  readonly npcsSent: readonly { arrived: Record<string, string>; sent: string }[];
}

export async function stage2d(page: Page): Promise<Stage2dSeen> {
  const seen = await page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: the page's own hook, read as it is
    const hook = (window as any).__ebStage2d;
    if (!hook) return null;
    return {
      space: hook.space,
      scaled: hook.scaled(),
      camera: hook.camera(),
      drawn: hook.drawn(),
      frames: hook.frames(),
      uses: hook.uses(),
      used: hook.used(),
      walkers: hook.walkers(),
      npcsSent: hook.npcsSent(),
    };
  });
  if (!seen) throw new Error('No 2D space is drawn');
  return seen as Stage2dSeen;
}

/** One item as it was last drawn. */
export async function drawnItem(page: Page, path: string) {
  const item = (await stage2d(page)).drawn.find((d) => d.path === path);
  if (!item) throw new Error(`Nothing drawn at ${path}`);
  return item;
}

/** The camera moved as a drag would, kept within the space. */
export async function look(page: Page, at: Point): Promise<void> {
  // biome-ignore lint/suspicious/noExplicitAny: the page's own hook
  await page.evaluate((to) => (window as any).__ebStage2d.look(to), at);
}

/** The keep brought into the editor from a zip of its fixture. */
export async function importKeep(page: Page, touch = false): Promise<void> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    how(page.getByRole('button', { name: 'Import zip' })),
  ]);
  await chooser.setFiles(fixtureZip(KEEP, 'keep'));
  await expect(openProject(page).getByRole('heading', { name: 'The keep' })).toBeVisible();
}

/** Its scripts let run and a new game of it in Play: the keep drawn, some frames on. */
export async function playKeep(page: Page, touch = false): Promise<Locator> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  const panel = await showPlay(page);
  await how(panel.getByRole('button', { name: 'Run its scripts' }));
  const play = panel.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled();
  await how(play);
  return startKeep(page, touch);
}

/** A new game of the keep from the title, in Slot 1: the keep drawn, some frames on. */
export async function startKeep(page: Page, touch = false): Promise<Locator> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await newGame(page, how);
  await expect(game(page).getByRole('heading', { name: '21:00' })).toBeVisible();
  const box = page.getByRole('application', { name: 'The keep at night' });
  await expect(box).toBeVisible();
  await expect
    .poll(
      () =>
        stage2d(page).then(
          (s) => (s.space === 'keep' ? s.frames : 0),
          () => 0,
        ),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(3);
  return box;
}

/** The keep imported and played. */
export async function openKeep(page: Page, touch = false): Promise<Locator> {
  await importKeep(page, touch);
  return playKeep(page, touch);
}

/**
 * The part of an element the page shows: its box cut by every ancestor that clips and by the
 * viewport, a pixel in from each edge so no border's blend is counted.
 */
async function shownOf(element: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  return element.evaluate((el) => {
    let { left, top, right, bottom } = el.getBoundingClientRect();
    right = Math.min(right, window.innerWidth);
    bottom = Math.min(bottom, window.innerHeight);
    for (let up = el.parentElement; up; up = up.parentElement) {
      if (getComputedStyle(up).overflow === 'visible') continue;
      const r = up.getBoundingClientRect();
      left = Math.max(left, r.left);
      top = Math.max(top, r.top);
      right = Math.min(right, r.right);
      bottom = Math.min(bottom, r.bottom);
    }
    const x = Math.ceil(left) + 1;
    const y = Math.ceil(top) + 1;
    return { x, y, width: Math.floor(right) - 1 - x, height: Math.floor(bottom) - 1 - y };
  });
}

/** The colours the page shows of an element, from a screenshot of what is shown: each pixel's hex, counted. */
export async function coloursIn(page: Page, box: Locator): Promise<Map<string, number>> {
  const clip = await shownOf(box);
  expect(clip.width * clip.height).toBeGreaterThan(0);
  const shot = await page.screenshot({ clip });
  const counted = await page.evaluate(
    async (bytes) => {
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
      const image = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, image.width, image.height).data;
      const seen: Record<string, number> = {};
      for (let i = 0; i < data.length; i += 4) {
        const hex = `#${[data[i], data[i + 1], data[i + 2]].map((c) => (c as number).toString(16).padStart(2, '0')).join('')}`;
        seen[hex] = (seen[hex] ?? 0) + 1;
      }
      return seen;
    },
    [...shot],
  );
  return new Map(Object.entries(counted));
}
