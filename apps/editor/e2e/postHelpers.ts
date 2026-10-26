/**
 * M6.8's gate (D80, docs/specs/barter.md#the-gate), what its specs share: the post brought into the
 * editor and played, the player walked up to a chest, a barrel or Hild's counter by keys or by touch,
 * and the Container and Shop screens read.
 */
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { closeOn, type hands, type Steer } from './campHelpers.ts';
import { offered } from './glenHelpers.ts';
import { importZip } from './hollowsHelpers.ts';
import { game, newGame, showPlay } from './hutScreens.ts';
import { fixtureZip } from './kitHelpers.ts';
import { drawing, walked } from './walkHelpers.ts';

export const POST = join(import.meta.dirname, '../../../tools/cli/test/fixtures/post');

/** Where each thing the player uses stands, on the ground. */
export const AT = { chest: [-4, 0, 2], barrel: [4, 0, 2], counter: [0, 0, 0] } as const;

/** The open project's scripts let run, unless they may already, and a new game of it in Play: the yard drawn. */
export async function playPost(page: Page, touch = false, trusted = false): Promise<Locator> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  const panel = await showPlay(page);
  if (!trusted) await how(panel.getByRole('button', { name: 'Run its scripts' }));
  const play = panel.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled();
  await how(play);
  await newGame(page, how);
  await expect(game(page).getByText('Hild has 3 coin')).toBeVisible();
  return drawing(page, 'yard', 'The yard');
}

/** The post imported and a new game of it in Play. */
export async function openPost(page: Page, touch = false): Promise<Locator> {
  await importZip(page, fixtureZip(POST, 'post'), 'The post', touch);
  return playPost(page, touch);
}

const across = (a: readonly number[], b: readonly number[]) =>
  Math.hypot((a[0] as number) - (b[0] as number), (a[2] as number) - (b[2] as number));

/** Turned and walked up to `object` until its prompt is the one offered. */
export async function walkTo(page: Page, steer: Steer, object: keyof typeof AT, timeout = 60_000): Promise<void> {
  const at = AT[object];
  const started = Date.now();
  for (;;) {
    const me = await walked(page);
    const prompt = await page.evaluate(
      () => (window as unknown as { __ebWalk?: { prompt(): { object: string } | null } }).__ebWalk?.prompt()?.object,
    );
    if (prompt === object) break;
    if (Date.now() - started > timeout)
      throw new Error(`Never offered ${object}: ${across(me.feet, at).toFixed(1)} m off`);
    await closeOn(steer, me, at, 1.2, 10);
  }
  await offered(page, object);
}

/**
 * Touch for a game with no fighting: a drag on the view's right turns, the stick on its left walks,
 * and the prompt is tapped to use.
 */
export function walkSteer(page: Page, view: Locator, fingers: Awaited<ReturnType<typeof hands>>): Steer {
  const onView = async (across: number, down: number) => {
    await view.scrollIntoViewIfNeeded();
    const area = await view.boundingBox();
    if (!area) throw new Error('No view to touch');
    const bottom = Math.min(area.y + area.height, page.viewportSize()?.height ?? area.y + area.height);
    return { x: area.x + area.width * across, y: area.y + (bottom - area.y) * down };
  };
  return {
    turn: async (degrees) => {
      const at = await onView(0.7, 0.3);
      await fingers.press(2, at.x, at.y);
      await fingers.slide(2, Math.round(-degrees / 0.3), 0);
      await fingers.lift(2);
    },
    walk: async (ms) => {
      const at = await onView(0.25, 0.6);
      await fingers.press(1, at.x, at.y);
      await fingers.slide(1, 0, -44);
      await page.waitForTimeout(ms);
      await fingers.lift(1);
    },
    attack: async () => {},
    use: () => fingers.tap(view.locator('.walk-use')),
  };
}

/** The words of each button a list of the screen draws, in order. */
export async function buttons(screen: Locator): Promise<string[]> {
  return (await screen.getByRole('button').allInnerTexts()).map((text) => text.trim());
}
