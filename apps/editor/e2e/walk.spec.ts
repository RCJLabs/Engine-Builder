/**
 * M5.8's gate on desktop (D70, docs/specs/movement.md#the-gate): the trail played in the Play panel
 * and walked by keys and the mouse, then by a stand-in pad, everything read through window.__ebWalk
 * and the HUD. The walk's numbers are the stage's: 2.5 m/s, 5 running, the camera 4 m back and
 * pulled in short of what is solid, the capsule 0.35 m across. Untested for feel.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { game, topScreen } from './hutScreens.ts';
import { fakePad } from './inputHelpers.ts';
import { jumpHolding, watchHeight } from './jumpHelpers.ts';
import {
  across,
  dragMouse,
  drawing,
  faceTowards,
  holdFor,
  holdUntil,
  holdUntilPast,
  near,
  openTrail,
  settled,
  type Walked,
  walked,
} from './walkHelpers.ts';

test('the trail walked by keys and the mouse, to the cairn and into the bothy', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  const box = await openTrail(page);
  const start = await settled(page);
  expect(start.view).toBe('third');
  expect(near(start.feet[0], 0, 0.01) && near(start.feet[2], 20, 0.01)).toBe(true);
  expect(start.camera.distance).toBe(4);
  await box.focus();

  await test.step('the third-person camera pulls in against the wall behind', async () => {
    await holdUntilPast(page, ['KeyA'], 'x', { atMost: -6.4 });
    await dragMouse(page, box, 360, 0);
    const facing = await settled(page);
    expect(near(facing.yaw, -90, 0.5)).toBe(true);
    expect(facing.camera.distance).toBeLessThan(1.5);
    expect(facing.camera.distance).toBeGreaterThanOrEqual(0.6);
    await dragMouse(page, box, -360, 0);
    const back = await settled(page);
    expect(near(back.yaw, 0, 0.5)).toBe(true);
    expect(back.camera.distance).toBe(4);
    // A drag only turns: the page never asked for the pointer, and the space keeps the keys.
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
    await expect(box).toBeFocused();
  });

  await test.step('walks at 2.5 m/s and stops at the boulder’s face', async () => {
    await holdUntilPast(page, ['KeyD'], 'x', { atLeast: -4.05 });
    let fastest = 0;
    const stopped = await holdUntil(page, ['KeyW'], (w) => {
      fastest = Math.max(fastest, across(w));
      return w.feet[2] < 14 && across(w) < 0.05;
    });
    expect(near(fastest, 2.5, 0.1)).toBe(true);
    // The boulder's near face is at z 12.6; the capsule stops its radius short.
    expect(near(stopped.feet[2], 12.95, 0.1)).toBe(true);
  });

  await test.step('is stopped by the step, 0.8 m tall, and jumps onto it', async () => {
    await holdUntilPast(page, ['KeyS'], 'z', { atLeast: 15.5 });
    await holdUntilPast(page, ['KeyD'], 'x', { atLeast: 4 });
    const below = await holdUntil(page, ['KeyW'], (w) => w.feet[2] < 14.5 && across(w) < 0.05);
    expect(near(below.feet[2], 13.35, 0.1)).toBe(true);
    // Forward held through the jump: in the air, the walk goes only where it is pushed. Let go as it
    // lands, in the page's time, which may run slower than real time.
    const { rose } = await jumpHolding(page, ['KeyW']);
    expect(rose[1]).toBeGreaterThan(below.feet[1]);
    const on = await settled(page);
    expect(on.feet[2]).toBeLessThan(13);
    expect(near(on.feet[1], 2.02, 0.1)).toBe(true);
  });

  await test.step('can’t climb the bank, steeper than 40°', async () => {
    // Until it has gained no ground for 1.5 s past x 11: the bank rises from x 12.
    let farthest = Number.NEGATIVE_INFINITY;
    let since = Date.now();
    const pushed = await holdUntil(page, ['KeyD'], (w) => {
      if (w.feet[0] > farthest + 0.05) [farthest, since] = [w.feet[0], Date.now()];
      return farthest > 11 && Date.now() - since > 1500;
    });
    expect(farthest).toBeLessThan(12.6);
    expect(pushed.feet[1]).toBeLessThan(2.6);
  });

  await test.step('pushes the loose crate, which moves', async () => {
    await holdUntilPast(page, ['KeyW'], 'z', { atMost: 8 });
    await holdUntilPast(page, ['KeyA'], 'x', { atMost: -3.5 });
    const crate = (w: Walked) => w.moving.find((m) => m.path === 'loose-crate')?.at ?? [0, 0, 0];
    const before = crate(await settled(page));
    // Faced at its middle, so the push is square, wherever the strafe stopped.
    await faceTowards(page, box, before[0], before[2]);
    // Pushed half a metre within the time: it would stay put if it didn't move.
    await holdUntil(page, ['KeyW'], (w) => Math.hypot(crate(w)[0] - before[0], crate(w)[2] - before[2]) > 0.5);
    await settled(page);
    await faceTowards(page, box, (await walked(page)).feet[0], -1000);
  });

  await test.step('runs at 5 m/s up the path to the cairn, its trigger sent once and its flag on the HUD', async () => {
    await holdUntilPast(page, ['KeyD'], 'x', { atLeast: 0 });
    // Faced at the stones' middle, wherever the strafe stopped: they are a box a metre across.
    await faceTowards(page, box, 0, -10);
    let fastest = 0;
    const reached = await holdUntil(page, ['ShiftLeft', 'KeyW'], (w) => {
      fastest = Math.max(fastest, across(w));
      return w.zones.includes('cairn/zone');
    });
    expect(near(fastest, 5, 0.2)).toBe(true);
    expect(reached.sent.map((s) => s.object)).toEqual(['cairn/zone']);
    await expect(game(page).getByText('The cairn is reached.')).toBeVisible();
    // Still in the zone, against the stones: nothing more is sent.
    await holdFor(page, ['KeyW'], 1500);
    const stayed = await walked(page);
    // The stones' near face is at z -9.5; the capsule stops its radius short.
    expect(near(stayed.feet[2], -9.15, 0.15), JSON.stringify(stayed)).toBe(true);
    expect(stayed.zones).toEqual(['cairn/zone']);
    expect(stayed.sent).toEqual([{ object: 'cairn/zone', sent: 'accepted' }]);
  });

  await test.step('opens the bothy and looks around it in first person', async () => {
    await topScreen(page).getByRole('button', { name: 'Into the bothy' }).click();
    const room = await drawing(page, 'bothy', 'Bothy');
    const inside = await settled(page);
    expect(inside.view).toBe('first');
    expect(near(inside.feet[1], 0, 0.05)).toBe(true);
    expect(inside.camera.distance).toBe(0);
    await dragMouse(page, room, -200, -400);
    const looked = await walked(page);
    expect(near(looked.yaw, 50, 0.5)).toBe(true);
    // 100° up, held at 85.
    expect(looked.pitch).toBe(85);
    await dragMouse(page, room, 200, 340);
    const level = await walked(page);
    expect(near(level.yaw, 0, 0.5) && near(level.pitch, 0, 0.5), JSON.stringify(level)).toBe(true);
    await room.focus();
    const north = await holdUntil(page, ['KeyW'], (w) => w.feet[2] < -2 && across(w) < 0.05);
    // The north wall's inner face is at z -3.
    expect(near(north.feet[2], -2.65, 0.1), JSON.stringify(north)).toBe(true);
  });

  await test.step('a tap of Space, down and up within a frame, still jumps', async () => {
    const before = await settled(page);
    const top = await watchHeight(page);
    // Down and up in one task of the page's: no frame can come between them.
    await page.getByRole('application', { name: 'Bothy' }).evaluate((box) => {
      for (const type of ['keydown', 'keyup'])
        box.dispatchEvent(new KeyboardEvent(type, { code: 'Space', bubbles: true }));
    });
    await expect.poll(async () => (await top()) - before.feet[1], { intervals: [50] }).toBeGreaterThan(0.3);
    await settled(page);
  });
  expect(errors).toEqual([]);
});

test('the trail walked by a pad: both sticks and A', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await fakePad(page);
  await openTrail(page);
  await settled(page);
  const pad = (axes: number[], a = false) =>
    page.evaluate(
      ([axes, a]) => {
        const held = (
          window as unknown as { __pad: { axes: number[]; buttons: { pressed: boolean; value: number }[] } }
        ).__pad;
        held.axes = axes as number[];
        held.buttons[0] = { ...held.buttons[0], pressed: a as boolean, value: a ? 1 : 0 };
      },
      [axes, a] as const,
    );

  await test.step('paused, the walk holds still whatever the pad does', async () => {
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __ebWalk?: { paused: boolean } }).__ebWalk?.paused))
      .toBe(true);
    const before = await walked(page);
    await pad([0, -1, 0.5, 0]);
    await page.waitForTimeout(1000);
    const held = await walked(page);
    expect(held.feet).toEqual(before.feet);
    expect(held.yaw).toBe(before.yaw);
    await pad([0, 0, 0, 0]);
    await page.getByRole('button', { name: 'Resume' }).click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __ebWalk?: { paused: boolean } }).__ebWalk?.paused))
      .toBe(false);
  });

  await test.step('the left stick pushed all the way runs up the path to the cairn', async () => {
    await pad([0, -1, 0, 0]);
    let fastest = 0;
    await expect
      .poll(
        async () => {
          const w = await walked(page);
          fastest = Math.max(fastest, across(w));
          return w.zones.includes('cairn/zone');
        },
        { timeout: 60_000, intervals: [50] },
      )
      .toBe(true);
    await pad([0, 0, 0, 0]);
    expect(near(fastest, 5, 0.2)).toBe(true);
    await expect(game(page).getByText('The cairn is reached.')).toBeVisible();
    expect((await walked(page)).sent).toEqual([{ object: 'cairn/zone', sent: 'accepted' }]);
  });

  await test.step('the right stick turns and A jumps', async () => {
    const before = await settled(page);
    await pad([0, 0, 1, 0]);
    await expect.poll(async () => (await walked(page)).yaw, { timeout: 10_000 }).toBeLessThan(before.yaw - 45);
    await pad([0, 0, 0, 0]);
    await pad([0, 0, 0, 0], true);
    await expect.poll(async () => (await walked(page)).velocity[1], { timeout: 10_000 }).toBeGreaterThan(1);
    await pad([0, 0, 0, 0]);
    const landed = await settled(page);
    expect(near(landed.feet[1], before.feet[1], 0.1)).toBe(true);
    // A pressed the walk's jump, not a button of the screen's: the trailhead is still up.
    await expect(topScreen(page).getByRole('button', { name: 'Into the bothy' })).toBeVisible();
  });
  expect(errors).toEqual([]);
});
