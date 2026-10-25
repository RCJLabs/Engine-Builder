/**
 * M6.1's gate on desktop (D73, docs/specs/npcs.md#the-gate): the ford played in the Play panel and
 * walked by keys and the mouse, then by a stand-in pad. The drover stands in the way with no prompt;
 * the smith, the ferry-keeper and the warden each offer Talk, turn to face the player as it opens and
 * back once it closes; the walk stands still under a talk; the horseshoe goes from Ada's bag to the
 * party's and on to Bryn's on the HUD; and a save in the middle keeps the bags. Everything read
 * through window.__ebWalk and the HUD. The turns' times are first guesses, untested for feel.
 */
import { expect, type Page, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { hud, npcs, openFord, PLACED, paused, turnedTo, yawToward } from './fordHelpers.ts';
import { acted, offered, padUntil, promptButton } from './glenHelpers.ts';
import { game, shellScreens, topScreen } from './hutScreens.ts';
import { fakePad, padPress } from './inputHelpers.ts';
import { pauseDialog } from './playShellHelpers.ts';
import { drawing, faceTowards, holdFor, holdUntilPast, near, settled, walked } from './walkHelpers.ts';

// The drover's capsule and the player's: src/spaces/figureLook.ts's FIGURE and src/walk/physics.ts's BODY.
const FIGURE_RADIUS = 0.3;
const BODY_RADIUS = 0.35;

/** Its Talk used by E: the talk on top, the walk paused, the NPC turned to face where the player stands. */
async function talkTo(page: Page, path: keyof typeof PLACED, opens: string): Promise<void> {
  await offered(page, path);
  await expect(promptButton(page.locator('[data-eb-walk]'))).toHaveText('TalkE');
  const feet = (await walked(page)).feet;
  await page.keyboard.press('KeyE');
  await expect(topScreen(page).getByText(opens)).toBeVisible();
  await expect.poll(() => paused(page)).toBe(true);
  await turnedTo(page, path, yawToward(PLACED[path].at, feet));
}

/** The talk gone by its last Go on: the walk going on, the NPC turned back to where it was placed. */
async function goOn(page: Page, path: keyof typeof PLACED): Promise<void> {
  await topScreen(page).getByRole('button', { name: 'Go on' }).click();
  await expect.poll(() => paused(page)).toBe(false);
  await turnedTo(page, path, PLACED[path].yaw);
  await page.locator('[data-eb-walk]').focus();
}

test('the ford by keys and the mouse: the drover in the way, each talk faced, the bags passed on and kept', async ({
  page,
}) => {
  test.setTimeout(400_000);
  const errors = watchErrors(page);
  const ford = await openFord(page);
  await ford.focus();
  const start = await settled(page);
  expect(near(start.feet[0], 0, 0.01) && near(start.feet[2], 8, 0.01)).toBe(true);

  await test.step('every NPC built, drawn as a figure or, the warden, as its model, facing as placed', async () => {
    const seen = await npcs(page);
    expect(Object.values(seen).map((n) => [n.path, n.actor, n.drawn, n.placed])).toEqual([
      ['smith', 'smith', 'figure', 0],
      ['ferry', 'ferry', 'figure', 180],
      ['warden', 'warden', 'model', 0],
      ['drover', 'drover', 'figure', 0],
    ]);
  });

  await test.step('the drover stands in the way: walked into, held off, and nothing is offered', async () => {
    // A capsule is round: walked into, the player slides along it, never through. 2.5 s at a walk
    // would carry the feet to z 1.75 on open ground.
    const stopped = await holdFor(page, ['KeyW'], 2500);
    const [x, , z] = stopped.feet;
    const off = Math.hypot(x - PLACED.drover.at[0], z - PLACED.drover.at[2]);
    expect(off, JSON.stringify(stopped.feet)).toBeGreaterThanOrEqual(FIGURE_RADIUS + BODY_RADIUS - 0.02);
    expect(z, JSON.stringify(stopped.feet)).toBeGreaterThan(4.4);
    await offered(page, null);
  });

  await test.step('Ada offers Talk; under it the walk stands still, and she gives the horseshoe', async () => {
    await holdUntilPast(page, ['KeyS'], 'z', { atLeast: 7.9 });
    await holdUntilPast(page, ['KeyA'], 'x', { atMost: -1.2 });
    await settled(page);
    await faceTowards(page, ford, -3, 8);
    await talkTo(page, 'smith', 'The ferry’s mare threw a shoe. Take her this one?');
    const before = await walked(page);
    await holdFor(page, ['KeyW'], 600);
    const after = await walked(page);
    expect(near(after.feet[0], before.feet[0], 0.001) && near(after.feet[2], before.feet[2], 0.001)).toBe(true);
    await topScreen(page).getByRole('button', { name: 'I’ll take it' }).click();
    await expect(topScreen(page).getByText('Bryn will be glad of it.')).toBeVisible();
    await goOn(page, 'smith');
    await expect(hud(page, 1, 0, 0)).toBeVisible();
  });

  await test.step('saved in the middle; a load keeps the bags as they were', async () => {
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect.poll(async () => (await acted(page)).stood.at(-1)?.sent).toBe('accepted');
    await pauseDialog(page).getByRole('button', { name: 'Quit to title' }).click();
    await shellScreens(page)
      .getByRole('button', { name: /^Continue/ })
      .click();
    await drawing(page, 'ford', 'The ford');
    expect((await acted(page)).began).toEqual({ from: 'at' });
    await expect(hud(page, 1, 0, 0)).toBeVisible();
    await settled(page);
  });

  await test.step('Bryn offers Talk and takes the horseshoe for the mare; the ford’s folk are friendly', async () => {
    const view = page.locator('[data-eb-walk]');
    await view.focus();
    await faceTowards(page, view, 10, (await walked(page)).feet[2]);
    await holdUntilPast(page, ['KeyW'], 'x', { atLeast: 1.2 });
    await settled(page);
    await faceTowards(page, view, 3, 8);
    await talkTo(page, 'ferry', 'Is that a shoe for my mare?');
    await topScreen(page).getByRole('button', { name: 'Here, from Ada' }).click();
    await expect(topScreen(page).getByText('She’ll pull again by morning. Thank you.')).toBeVisible();
    await goOn(page, 'ferry');
    await expect(hud(page, 0, 0, 1)).toBeVisible();
    await expect(game(page).getByText('The ford’s folk: friendly')).toBeVisible();
    await expect(game(page).getByText('The mare is shod. Talk to the warden.')).toBeVisible();
  });

  await test.step('the warden, drawn as the kit’s pillar, offers Talk and welcomes a friend of the ford', async () => {
    const view = page.locator('[data-eb-walk]');
    await faceTowards(page, view, (await walked(page)).feet[0], -10);
    await holdUntilPast(page, ['KeyW'], 'z', { atMost: 1.8 });
    await settled(page);
    await faceTowards(page, view, 0, 1);
    await talkTo(page, 'warden', 'The ford knows you now. Cross in peace.');
    await goOn(page, 'warden');
  });
  expect(errors).toEqual([]);
});

test('the ford by a pad: X talks to Ada, the left stick moves nothing under the talk', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await fakePad(page);
  const ford = await openFord(page);
  await settled(page);
  await padUntil(page, [-1, 0, 0, 0], { x: -1.2 });
  await settled(page);
  await faceTowards(page, ford, -3, (await walked(page)).feet[2]);
  // Turned by the mouse, then the right stick a frame or two: the walk knows the pad is in use again.
  await padUntil(page, [0, 0, 0.3, 0], { frames: 2 });
  await offered(page, 'smith');
  await expect(promptButton(ford)).toHaveText('TalkX');
  const feet = (await walked(page)).feet;
  await padPress(page, 2);
  await expect(topScreen(page).getByText('The ferry’s mare threw a shoe. Take her this one?')).toBeVisible();
  await expect.poll(() => paused(page)).toBe(true);
  await turnedTo(page, 'smith', yawToward(PLACED.smith.at, feet));
  await padUntil(page, [0, -1, 0, 0], { frames: 40 });
  const still = await walked(page);
  expect(near(still.feet[0], feet[0], 0.001) && near(still.feet[2], feet[2], 0.001)).toBe(true);
  await topScreen(page).getByRole('button', { name: 'Not today' }).click();
  await expect.poll(() => paused(page)).toBe(false);
  await turnedTo(page, 'smith', PLACED.smith.yaw);
  await expect(hud(page, 0, 1, 0)).toBeVisible();
  expect(errors).toEqual([]);
});
