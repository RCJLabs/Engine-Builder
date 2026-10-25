/**
 * M5.8's gate (D70), what its specs share: the trail brought into the editor and played to its
 * trailhead, what window.__ebWalk says of the walk, keys held until the walk has done something,
 * a mouse dragged across the view, and the floating stick and the look drag by touch.
 */
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { game, newGame, showPlay } from './hutScreens.ts';
import { fixtureZip } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';

export const TRAIL = join(import.meta.dirname, '../../../tools/cli/test/fixtures/trail');

type Vec3 = readonly [number, number, number];

export interface Walked {
  readonly space: string;
  readonly feet: Vec3;
  readonly velocity: Vec3;
  readonly grounded: boolean;
  readonly view: 'third' | 'first';
  readonly yaw: number;
  readonly pitch: number;
  readonly camera: { readonly at: Vec3; readonly distance: number };
  readonly zones: readonly string[];
  readonly sent: readonly { readonly object: string; readonly sent: string }[];
  readonly moving: readonly { readonly path: string; readonly at: Vec3 }[];
  readonly frames: number;
}

/** The page's window.__ebWalk, as src/walk/hook.ts declares it. */
interface Hooked {
  __ebWalk?: {
    readonly space: string;
    character(): Pick<Walked, 'feet' | 'velocity' | 'grounded' | 'view' | 'yaw' | 'pitch'>;
    camera(): Walked['camera'];
    zones(): Walked['zones'];
    sent(): Walked['sent'];
    moving(): Walked['moving'];
    readonly frames: number;
  };
}

/** What the walk's hook says now. */
export async function walked(page: Page): Promise<Walked> {
  const read = await page.evaluate(() => {
    const hook = (window as unknown as Hooked).__ebWalk;
    if (!hook) return null;
    return {
      space: hook.space,
      ...hook.character(),
      camera: hook.camera(),
      zones: hook.zones(),
      sent: hook.sent(),
      moving: hook.moving(),
      frames: hook.frames,
    };
  });
  if (!read) throw new Error('No space is being walked');
  return read as Walked;
}

/** How fast it moves across the ground, in metres a second. */
export const across = (w: Walked): number => Math.hypot(w.velocity[0], w.velocity[2]);

/** A space's box, drawing: its hook set and a few frames drawn. */
export async function drawing(page: Page, space: string, label: string): Promise<Locator> {
  const box = page.getByRole('application', { name: label });
  await expect(box).toBeVisible();
  await expect
    .poll(
      () =>
        page.evaluate((id) => {
          const hook = (window as unknown as Hooked).__ebWalk;
          return hook?.space === id ? hook.frames : 0;
        }, space),
      {
        timeout: 60_000,
      },
    )
    .toBeGreaterThan(3);
  return box;
}

/** The trail imported, its scripts let run, and a new game of it in Play: the trailhead drawn. */
export async function openTrail(page: Page, touch = false): Promise<Locator> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    how(page.getByRole('button', { name: 'Import zip' })),
  ]);
  await chooser.setFiles(fixtureZip(TRAIL, 'trail'));
  await expect(openProject(page).getByRole('heading', { name: 'The trail' })).toBeVisible();
  const panel = await showPlay(page);
  await how(panel.getByRole('button', { name: 'Run its scripts' }));
  const play = panel.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled();
  await how(play);
  await newGame(page, how);
  await expect(game(page).getByText('Walk up the path to the cairn.')).toBeVisible();
  return drawing(page, 'trailhead', 'The trailhead');
}

/** Keys held, by KeyboardEvent.code, until the walk says `done`, then let go. */
export async function holdUntil(
  page: Page,
  keys: readonly string[],
  done: (w: Walked) => boolean,
  timeout = 30_000,
): Promise<Walked> {
  for (const key of keys) await page.keyboard.down(key);
  try {
    await expect.poll(async () => done(await walked(page)), { timeout, intervals: [50] }).toBe(true);
  } finally {
    for (const key of [...keys].reverse()) await page.keyboard.up(key);
  }
  return walked(page);
}

/** Keys held for `ms` of the page's time, then let go: the walk where it ends up. */
export async function holdFor(page: Page, keys: readonly string[], ms: number): Promise<Walked> {
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  for (const key of [...keys].reverse()) await page.keyboard.up(key);
  return walked(page);
}

/** Until the character stands still on the ground: what a walk ends with. */
export async function settled(page: Page): Promise<Walked> {
  await expect
    .poll(async () => {
      const w = await walked(page);
      return w.grounded && across(w) < 0.05 && Math.abs(w.velocity[1]) < 0.5;
    })
    .toBe(true);
  return walked(page);
}

/** The mouse pressed in the view's middle and dragged by `dx` and `dy` pixels, in small moves. */
export async function dragMouse(page: Page, box: Locator, dx: number, dy: number): Promise<void> {
  const area = await box.boundingBox();
  if (!area) throw new Error('No view to drag');
  const [x, y] = [area.x + area.width / 2, area.y + area.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
  await page.mouse.up();
}

/** A finger on the view: down at a point, moved to others, held as the test asks, and lifted. */
export async function finger(page: Page, id: number) {
  const cdp = await page.context().newCDPSession(page);
  let at: { x: number; y: number } | null = null;
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p) => ({ ...p, id })) });
  return {
    down: async (x: number, y: number) => {
      at = { x, y };
      await send('touchStart', [at]);
    },
    /** To a point `dx`, `dy` from where it went down, in a few moves. */
    move: async (dx: number, dy: number) => {
      const from = at;
      if (!from) throw new Error('No finger down');
      for (let i = 1; i <= 6; i++) await send('touchMove', [{ x: from.x + (dx * i) / 6, y: from.y + (dy * i) / 6 }]);
    },
    up: async () => {
      await send('touchEnd', []);
      await cdp.detach();
    },
  };
}

/** The stick pushed `px` up from where a thumb lands on the view's left half, held until `done`. */
export async function stickUntil(page: Page, box: Locator, px: number, done: (w: Walked) => boolean): Promise<Walked> {
  const area = await box.boundingBox();
  if (!area) throw new Error('No view to touch');
  const thumb = await finger(page, 1);
  await thumb.down(area.x + area.width * 0.25, area.y + area.height * 0.7);
  await thumb.move(0, -px);
  try {
    await expect.poll(async () => done(await walked(page)), { timeout: 60_000, intervals: [50] }).toBe(true);
  } finally {
    await thumb.up();
  }
  return walked(page);
}

/** A drag by one finger on the view's right half, `dx` and `dy` pixels: a look. */
export async function lookByTouch(page: Page, box: Locator, dx: number, dy: number): Promise<void> {
  const area = await box.boundingBox();
  if (!area) throw new Error('No view to touch');
  const look = await finger(page, 2);
  await look.down(area.x + area.width * 0.7, area.y + area.height * 0.5);
  await look.move(dx, dy);
  await look.up();
}

export const near = (a: number, b: number, by: number): boolean => Math.abs(a - b) <= by;
