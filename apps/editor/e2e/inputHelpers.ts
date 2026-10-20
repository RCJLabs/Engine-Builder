/**
 * M4.2's gate (D52), what its specs share: the hut as a game file opened at /play/; focus moved to a
 * button by directions alone, from keys or a pad; a gamepad faked in the page through the Gamepad
 * API; swipes made as touches, through the browser's own touch input; and what the announcer holds.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { HUT } from './hutHelpers.ts';
import { game } from './hutScreens.ts';
import { REPO, scratch } from './ludus.ts';

export type Direction = 'up' | 'down' | 'left' | 'right';

/** The hut as a game file, as `eb build` writes it: the pack Export game writes too. */
export function hutGame(): string {
  const file = join(scratch, `the-hut-${Date.now()}.game.json`);
  execFileSync('node', ['tools/cli/src/cli.ts', 'build', HUT, '--out', file], { cwd: REPO });
  return file;
}

/** The player page with the hut open, its file chosen by a button pressed with `how`. */
export async function openHut(page: Page, how: (button: Locator) => Promise<void>): Promise<void> {
  await page.goto('play/');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    how(page.getByRole('button', { name: 'Open a game file' })),
  ]);
  await chooser.setFiles(hutGame());
  await expect(page.getByRole('heading', { level: 1, name: 'The hut' })).toBeVisible();
  await expect(game(page).getByText(/^Day \d+ of 10$/)).toBeVisible();
}

/** Where focus is: its box's centre, and whether it is a control rather than a screen's heading. */
const focusNow = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) return undefined;
    const box = active.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, control: active.tabIndex >= 0 };
  });

/**
 * Moves focus to `target` by directions alone, as a player would: towards it on the axis it is
 * furthest along, and along the other when that way is blocked. Fails if it never gets there.
 */
export async function focusBy(page: Page, target: Locator, move: (d: Direction) => Promise<void>): Promise<void> {
  for (let step = 0; step < 40; step++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    const from = await focusNow(page);
    const to = await target.boundingBox();
    if (!to) throw new Error('The button to reach isn’t drawn');
    // A screen's heading, or nothing: any direction wakes focus on a control.
    if (!from?.control) {
      await move('down');
      continue;
    }
    const dx = to.x + to.width / 2 - from.x;
    const dy = to.y + to.height / 2 - from.y;
    const vertical: Direction = dy > 0 ? 'down' : 'up';
    const sideways: Direction = dx > 0 ? 'right' : 'left';
    const ways = Math.abs(dy) >= 10 ? [vertical, ...(Math.abs(dx) >= 10 ? [sideways] : [])] : [sideways];
    for (const way of ways) {
      await move(way);
      const now = await focusNow(page);
      if (now && (now.x !== from.x || now.y !== from.y)) break;
    }
  }
  throw new Error('Focus never reached the button by directions alone');
}

/** Waits for the step a press asked for: the game's turn moves on. */
export async function stepWith(page: Page, pressing: () => Promise<void>): Promise<void> {
  const turn = await game(page).getAttribute('data-turn');
  await pressing();
  await expect(game(page)).not.toHaveAttribute('data-turn', turn ?? '');
}

/** What the announcer holds: the last step's lines, as a screen reader is given them. */
export const announcer = (page: Page): Locator => game(page).locator('[role="status"]');

/**
 * A standard gamepad in the page, before its scripts run: the Gamepad API answers with one pad
 * whose buttons and sticks the test sets (window.__pad).
 */
export async function fakePad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = {
      id: 'Fake pad',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons,
    };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null], configurable: true });
  });
}

/** Holds a pad's button for a few frames and lets it go: a press, as the page's loop reads it. */
export async function padPress(page: Page, button: number): Promise<void> {
  const frames = (n: number) =>
    page.evaluate(
      (count) =>
        new Promise<void>((done) => {
          const tick = (left: number) => (left === 0 ? done() : requestAnimationFrame(() => tick(left - 1)));
          tick(count);
        }),
      n,
    );
  const set = (down: boolean) =>
    page.evaluate(
      ([b, d]) => {
        const pad = (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad;
        pad.buttons[b as number] = { ...pad.buttons[b as number], pressed: d as boolean, value: d ? 1 : 0 };
      },
      [button, down] as const,
    );
  await set(true);
  await frames(3);
  await set(false);
  await frames(3);
}

/** The standard mapping's buttons the gate uses. */
export const PAD = { a: 0, b: 1, lb: 4, rb: 5, up: 12, down: 13, left: 14, right: 15 } as const;

/**
 * A finger dragged sideways across an element, quickly, then held still a moment before it lifts: a
 * swipe, as the browser's touch input makes it. Lifted while still moving, the browser would fling,
 * and a tap during a fling only stops it, as on a phone, so the next step's tap would press nothing.
 */
export async function swipe(page: Page, on: Locator, direction: 'left' | 'right'): Promise<void> {
  const box = await on.boundingBox();
  if (!box) throw new Error('Nothing to swipe on');
  const y = box.y + box.height / 2;
  const [from, to] =
    direction === 'right'
      ? [box.x + box.width * 0.2, box.x + box.width * 0.8]
      : [box.x + box.width * 0.8, box.x + box.width * 0.2];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: from + ((to - from) * i) / 6, y }],
    });
  }
  await new Promise((settled) => setTimeout(settled, 150));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: to, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
