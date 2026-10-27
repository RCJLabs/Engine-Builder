/**
 * M5.9's gate on desktop (D71, docs/specs/worldspaces.md#the-gate): the glen played in the Play panel
 * and walked by keys and the mouse, then by a stand-in pad. A rope and a lamp taken by Interact and
 * gone after a load; the bothy's door each way, an interact; the shed's, a zone in and an interact
 * out; the gate's zone setting the quest's stage; a loading screen before each space; and a save in
 * the bothy that a load puts back where the player stood. Everything read through window.__ebWalk and
 * the HUD. The prompt's reach and cone are first guesses, untested for feel.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { acted, holdUntilIn, offered, openGlen, padUntil, promptButton, watchLoading } from './glenHelpers.ts';
import { game, shellScreens } from './hutScreens.ts';
import { fakePad, padPress } from './inputHelpers.ts';
import { pauseDialog } from './playShellHelpers.ts';
import { dragMouse, drawing, faceTowards, holdFor, holdUntilPast, near, settled, walked } from './walkHelpers.ts';

test('the glen by keys and the mouse: takes, a door each way of each kind, the gate, and a load where it stood', async ({
  page,
}) => {
  test.setTimeout(400_000);
  const errors = watchErrors(page);
  const loadings = await watchLoading(page);
  const glen = await openGlen(page);
  await glen.focus();
  const start = await settled(page);
  expect(near(start.feet[0], 0, 0.01) && near(start.feet[2], 8, 0.01)).toBe(true);
  expect((await acted(page)).began).toEqual({ from: 'start', spawn: 'start' });
  expect(await loadings()).toEqual(['status: The glenLoading…']);

  await test.step('the rope ahead is offered, and E takes it after saying where the player stands', async () => {
    await offered(page, 'rope');
    await expect(promptButton(glen)).toHaveText('TakeE');
    await page.keyboard.press('KeyE');
    await expect.poll(async () => (await acted(page)).used).toEqual([{ object: 'rope', sent: 'accepted' }]);
    const after = await acted(page);
    expect(after.stood.map((s) => s.sent)).toEqual(['accepted']);
    expect(after.taken).toEqual(['rope']);
    expect(after.hidden).toEqual(['rope']);
    await offered(page, null);
    await expect(promptButton(glen)).toBeHidden();
    await expect(game(page).getByText('Rope 1 · Lamp 0')).toBeVisible();
  });

  await test.step('the bothy’s door, an interact: its loading screen, then the bothy in first person', async () => {
    await holdUntilPast(page, ['KeyA'], 'x', { atMost: -5.95 });
    await holdUntilPast(page, ['KeyW'], 'z', { atMost: -2.7 });
    await offered(page, 'bothy-door');
    await expect(promptButton(glen)).toHaveText('OpenE');
    await page.keyboard.press('KeyE');
    await drawing(page, 'bothy', 'The bothy');
    expect(await loadings()).toEqual(['status: The glenLoading…', 'status: The bothyLoading…']);
    expect((await acted(page)).began).toEqual({ from: 'arrive', spawn: 'door' });
    const inside = await settled(page);
    expect(inside.view).toBe('first');
    expect(near(inside.feet[2], 1.2, 0.05)).toBe(true);
  });

  await test.step('the lamp on the table, taken: the quest moves on by itself', async () => {
    await page.locator('[data-eb-walk]').focus();
    await holdUntilPast(page, ['KeyW'], 'z', { atMost: 0.5 });
    await offered(page, 'lamp');
    await page.keyboard.press('KeyE');
    await expect.poll(async () => (await acted(page)).taken).toEqual(['lamp']);
    await expect.poll(async () => (await acted(page)).hidden).toEqual(['lamp']);
    await expect(game(page).getByText('Rope 1 · Lamp 1')).toBeVisible();
    await expect(game(page).getByText('Take them to the shed by the burn.')).toBeVisible();
  });

  await test.step('saved where it stands as the shell pauses; a load puts it back there, the lamp still gone', async () => {
    await holdFor(page, ['KeyD'], 400);
    await dragMouse(page, page.locator('[data-eb-walk]'), -60, 0);
    const here = await settled(page);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect.poll(async () => (await acted(page)).stood.at(-1)?.sent).toBe('accepted');
    const told = (await acted(page)).stood.at(-1);
    if (!told) throw new Error('Nothing said where the player stood');
    for (const i of [0, 2]) expect(near(told.feet[i] as number, here.feet[i] as number, 0.006)).toBe(true);
    await pauseDialog(page).getByRole('button', { name: 'Quit to title' }).click();
    await shellScreens(page)
      .getByRole('button', { name: /^Continue/ })
      .click();
    await drawing(page, 'bothy', 'The bothy');
    const back = await settled(page);
    expect((await acted(page)).began).toEqual({ from: 'at' });
    for (const i of [0, 2]) expect(near(back.feet[i] as number, told.feet[i] as number, 0.02)).toBe(true);
    expect(near(back.yaw, told.yaw, 0.1)).toBe(true);
    expect((await acted(page)).taken).toEqual(['lamp']);
    expect((await acted(page)).hidden).toEqual(['lamp']);
    await expect(game(page).getByText('Rope 1 · Lamp 1')).toBeVisible();
  });

  await test.step('out by the bothy’s way out: the glen at its door, the rope still gone', async () => {
    const bothy = page.locator('[data-eb-walk]');
    await bothy.focus();
    // At the way out itself and on to z 1.8, short of the wall: the strafe before the save goes
    // further on a slow runner, and facing up the room from there, stopped at z 1.2, the way out was
    // past reach (CI, M7.4). From against the east wall this still comes within 1.2 m of it.
    await faceTowards(page, bothy, 0, 2.45);
    await holdUntilPast(page, ['KeyW'], 'z', { atLeast: 1.8 });
    await offered(page, 'way-out');
    await page.keyboard.press('KeyE');
    await drawing(page, 'glen', 'The glen');
    expect((await acted(page)).began).toEqual({ from: 'arrive', spawn: 'bothy-out' });
    const out = await settled(page);
    expect(near(out.feet[0], -6, 0.05) && near(out.feet[2], -2.5, 0.05)).toBe(true);
    expect(near(out.yaw, 180, 0.1)).toBe(true);
    expect((await acted(page)).taken).toEqual(['rope']);
    expect((await acted(page)).hidden).toEqual(['rope']);
  });

  await test.step('the page hidden says where the player stands: a phone may close the tab', async () => {
    const before = (await acted(page)).stood.length;
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    });
    await expect.poll(async () => (await acted(page)).stood.length).toBe(before + 1);
    await expect.poll(async () => (await acted(page)).stood.at(-1)?.sent).toBe('accepted');
  });

  await test.step('the gate’s zone, on the way to the shed, sets the quest’s last stage', async () => {
    const view = page.locator('[data-eb-walk]');
    await view.focus();
    await faceTowards(page, view, -6, -20);
    await holdUntilPast(page, ['KeyD'], 'x', { atLeast: 6 });
    await expect.poll(async () => (await walked(page)).sent).toEqual([{ object: 'gate', sent: 'accepted' }]);
    await expect(game(page).getByText('The supplies are in the shed.')).toBeVisible();
  });

  await test.step('the shed’s door, a zone: the shed in third person, and out by its interact', async () => {
    await holdUntilIn(page, ['KeyW'], 'shed');
    await drawing(page, 'shed', 'The shed');
    expect((await acted(page)).began).toEqual({ from: 'arrive', spawn: 'door' });
    expect((await settled(page)).view).toBe('third');
    const shed = page.locator('[data-eb-walk]');
    await shed.focus();
    await faceTowards(page, shed, 0, 10);
    await offered(page, 'way-out');
    await page.keyboard.press('KeyE');
    await drawing(page, 'glen', 'The glen');
    expect((await acted(page)).began).toEqual({ from: 'arrive', spawn: 'shed-out' });
    expect((await loadings()).filter((l) => l.startsWith('status: The shed'))).toEqual(['status: The shedLoading…']);
  });
  expect(errors).toEqual([]);
});

test('the glen by a pad: X takes the rope and opens the bothy’s door, the prompt naming X', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await fakePad(page);
  const glen = await openGlen(page);
  await settled(page);
  await test.step('a pad moved, the prompt names X; X takes the rope', async () => {
    // The right stick, a few frames: the walk turns a little, and knows the pad is in use.
    await padUntil(page, [0, 0, 0.3, 0], { frames: 3 });
    await offered(page, 'rope');
    await expect(promptButton(glen)).toHaveText('TakeX');
    await padPress(page, 2);
    await expect.poll(async () => (await acted(page)).used).toEqual([{ object: 'rope', sent: 'accepted' }]);
    await expect(game(page).getByText('Rope 1 · Lamp 0')).toBeVisible();
  });

  await test.step('the left stick to the bothy’s door, X opens it', async () => {
    const yaw = (await walked(page)).yaw;
    // Turned a little by the right stick above: face down the glen again by the mouse.
    if (!near(yaw, 0, 0.5)) await faceTowards(page, glen, (await walked(page)).feet[0], -20);
    await padUntil(page, [-1, 0, 0, 0], { x: -5.9 });
    await padUntil(page, [0, -1, 0, 0], { prompt: 'bothy-door' });
    await padPress(page, 2);
    await drawing(page, 'bothy', 'The bothy');
    expect((await acted(page)).began).toEqual({ from: 'arrive', spawn: 'door' });
  });
  expect(errors).toEqual([]);
});
