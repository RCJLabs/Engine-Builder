/**
 * M6.6's gate by keys and the mouse (D78, docs/specs/markers.md#the-gate): the glen played in the
 * Play panel, its tracked quest followed by the compass and the markers, read through
 * window.__ebWalk.markers(). Find your feet, which starts with the game: the rope ahead, read from its
 * count, and the gate. The rope taken starts the supplies, which are tracked: the lamp, through the
 * bothy's door. Find your feet tracked again from the journal: the gate, its text on the compass once
 * faced. The Map screen's pins on plain ground, no map baked. The setting hiding it all. Then the
 * supplies followed through the bothy: the lamp itself, the way out, and the shed's door.
 */
import { expect, type Locator, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { holdUntilIn, offered, openGlen } from './glenHelpers.ts';
import { compass, compassText, markersSetting, openScreen, pins, pointsAt, shown, track } from './markerHelpers.ts';
import { drawing, faceTowards, holdUntilPast, near, settled, walked } from './walkHelpers.ts';

const click = (button: Locator) => button.click();
const ROPE = ['rope', null, [0, 0.5, 6.5]];
const GATE = ['gate', null, [3, 0.5, -2.5]];
const LAMP_DOOR = ['lamp', 'bothy-door', [-6, 0.5, -3.9]];

test('the glen’s markers by keys and the mouse: the compass, Track, the Map screen and the setting', async ({
  page,
}) => {
  test.setTimeout(400_000);
  const errors = watchErrors(page);
  const glen = await openGlen(page);
  await glen.focus();
  await settled(page);

  await test.step('Find your feet: the rope ahead and the gate to the right, on the compass and over the world', async () => {
    await pointsAt(page, [ROPE, GATE]);
    const [rope, gate] = await shown(page);
    if (!rope || !gate) throw new Error('No rope or no gate');
    expect(near(rope.bearing, 0, 1) && near(rope.distance, 1.5, 0.05)).toBe(true);
    expect(gate.bearing).toBeGreaterThan(10);
    expect(rope.screen).not.toBeNull();
    await expect(compass(page)).toBeVisible();
    await expect(compass(page).locator('.walk-pip')).toHaveCount(2);
    await expect(compassText(page)).toHaveText('Pick up the rope by the path');
    await expect(page.locator('[data-eb-walk] .walk-marker').first()).toBeVisible();
  });

  await test.step('the rope taken: the supplies start and are tracked, the lamp shown at the bothy’s door', async () => {
    await offered(page, 'rope');
    await page.keyboard.press('KeyE');
    await pointsAt(page, [LAMP_DOOR]);
    const [lamp] = await shown(page);
    expect(lamp?.text).toBe("Take the bothy's lamp");
    expect(lamp?.bearing).toBeLessThan(-10);
    await expect(compass(page).locator('.walk-pip')).toHaveCount(1);
    await expect(compassText(page)).toBeHidden();
  });

  await test.step('Find your feet tracked from the journal: the gate, its text once faced', async () => {
    await track(page, 'Find your feet', click);
    await pointsAt(page, [GATE]);
    await glen.focus();
    await faceTowards(page, glen, 3, -2.5);
    await expect.poll(async () => Math.abs((await shown(page))[0]?.bearing ?? 99)).toBeLessThan(3);
    await expect(compassText(page)).toHaveText('Look over the gate');
  });

  await test.step('the Map screen: the player where the walk stood, the gate’s pin, its objective said on a click', async () => {
    const here = await walked(page);
    const map = await openScreen(page, 'Map', click);
    await expect(map.locator('.eb-space-map-plain')).toBeVisible();
    const [player, gate, ...rest] = await pins(map);
    expect(rest).toEqual([]);
    expect(player?.kind).toBe('player');
    expect(near(player?.at[0] ?? 99, here.feet[0], 0.01) && near(player?.at[1] ?? 99, here.feet[2], 0.01)).toBe(true);
    expect(gate).toEqual({ kind: 'target', objective: 'gate', at: [3, -2.5] });
    await expect(map.getByText('Tap a marker for its objective.')).toBeVisible();
    await map.getByRole('button', { name: 'Look over the gate' }).click();
    await expect(map.locator('figcaption')).toHaveText('Look over the gate');
    await map.getByRole('button', { name: 'Close' }).click();
    await expect(map).toHaveCount(0);
  });

  await test.step('Quest markers off in the settings: no compass, no markers; on again, back', async () => {
    await markersSetting(page, false, click);
    await expect.poll(() => shown(page)).toEqual([]);
    await expect(compass(page)).toBeHidden();
    await expect(page.locator('[data-eb-walk] .walk-marker')).toHaveCount(0);
    await markersSetting(page, true, click);
    await pointsAt(page, [GATE]);
    await expect(compass(page)).toBeVisible();
  });

  await test.step('the supplies tracked again: through the bothy’s door, the lamp itself inside', async () => {
    await track(page, 'Supplies', click);
    await pointsAt(page, [LAMP_DOOR]);
    await glen.focus();
    await faceTowards(page, glen, (await walked(page)).feet[0], -20);
    await holdUntilPast(page, ['KeyA'], 'x', { atMost: -5.95 });
    await holdUntilPast(page, ['KeyW'], 'z', { atMost: -2.7 });
    await offered(page, 'bothy-door');
    await page.keyboard.press('KeyE');
    await drawing(page, 'bothy', 'The bothy');
    await expect
      .poll(async () => (await shown(page)).map((m) => [m.objective, m.door ?? null]))
      .toEqual([['lamp', null]]);
    const [lamp] = await shown(page);
    expect(lamp?.screen).not.toBeNull();
  });

  await test.step('the lamp taken: the shed, by the bothy’s way out, then by the shed’s door', async () => {
    const bothy = page.locator('[data-eb-walk]');
    await bothy.focus();
    await holdUntilPast(page, ['KeyW'], 'z', { atMost: 0.5 });
    await offered(page, 'lamp');
    await page.keyboard.press('KeyE');
    await pointsAt(page, [['shed', 'way-out', [0, 0.5, 2.45]]]);
    await faceTowards(page, bothy, 0, 10);
    await holdUntilPast(page, ['KeyW'], 'z', { atLeast: 1.2 });
    await offered(page, 'way-out');
    await page.keyboard.press('KeyE');
    await drawing(page, 'glen', 'The glen');
    await pointsAt(page, [['shed', 'shed-door', [6, 0.5, -3.6]]]);
  });

  await test.step('into the shed: both quests done, and nothing left to point at', async () => {
    const view = page.locator('[data-eb-walk]');
    await view.focus();
    await faceTowards(page, view, 6, -3.6);
    await holdUntilIn(page, ['KeyW'], 'shed');
    await drawing(page, 'shed', 'The shed');
    await expect.poll(() => shown(page)).toEqual([]);
    await expect(compass(page)).toBeHidden();
  });
  expect(errors).toEqual([]);
});
