/**
 * M6.4's gate on desktop (D76, docs/specs/combat.md#the-gate): the camp fought in the Play panel by
 * keys and the mouse, and by a stand-in pad. The bow taken, F looses arrows, one taken for each; the
 * sword taken again and F held, the hero turned to each bandit in turn by the mouse until all three
 * lie, and each body searched by E. Standing still, the hero falls, and Back to the camp loads where
 * they came in. On the pad, the right trigger strikes, the sticks turn and walk, and X searches. Read
 * through the HUD and window.__ebWalk. The wind-ups, the 30° soft aim and the camp's numbers are
 * first guesses, untested for feel.
 */
import { expect, type Page, test } from '@playwright/test';
import {
  BANDITS,
  fallenOf,
  fightUntil,
  fought,
  hitsBy,
  hudOf,
  keySteer,
  look,
  openCamp,
  type Steer,
  searchAll,
  unexplainedRefusals,
  yawTo,
} from './campHelpers.ts';
import { watchErrors } from './checks.ts';
import { game, shellScreens } from './hutScreens.ts';
import { fakePad, padPress } from './inputHelpers.ts';
import { holdFor, settled, walked } from './walkHelpers.ts';

const allDown = (seen: { fight: Parameters<typeof fallenOf>[0] }) => fallenOf(seen.fight).length === BANDITS.length;

test('the camp by keys and the mouse: the bow, the fight and the bodies', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = watchErrors(page);
  const camp = await openCamp(page);
  await camp.focus();
  await settled(page);
  const keys = keySteer(page, camp);

  await test.step('the bow taken, F looses at the nearest, an arrow taken for each', async () => {
    await game(page).getByRole('button', { name: 'Take the bow' }).click();
    await expect.poll(async () => (await fought(page)).weapon).toBe('bow');
    await camp.focus();
    for (let shot = 0; shot < 8; shot++) {
      const seen = await look(page);
      if (hitsBy(seen.fight, 'hero').length > 0) break;
      const nearest = [...seen.agents].sort(
        (a, b) => Math.abs(a.at[2] - seen.me.feet[2]) - Math.abs(b.at[2] - seen.me.feet[2]),
      )[0];
      if (nearest) await keys.turn(yawTo(seen.me.feet, nearest.at) - seen.me.yaw);
      await page.keyboard.press('KeyF');
      await expect.poll(async () => (await fought(page)).swing, { timeout: 5000 }).toBeNull();
    }
    const seen = await fought(page);
    expect(hitsBy(seen, 'hero')[0]?.action.weapon).toBe('bow');
    const loosed = seen.sent.filter((s) => s.action.type === 'fighting/loosed' && s.sent === 'accepted').length;
    expect(loosed).toBeGreaterThan(0);
    await expect.poll(() => hudOf(page)).toMatch(new RegExp(`Arrows ${10 - loosed} `));
  });

  await test.step('the sword again and F held: each bandit turned to and struck until all three lie', async () => {
    await game(page).getByRole('button', { name: 'Take the sword' }).click();
    await expect.poll(async () => (await fought(page)).weapon).toBe('sword');
    await camp.focus();
    await page.keyboard.down('KeyF');
    try {
      await fightUntil(page, keys, allDown);
    } finally {
      await page.keyboard.up('KeyF');
    }
    const seen = await fought(page);
    // Rook and Crow struck the hero, two at a time; Wren's arrows found them too.
    expect(hitsBy(seen, 'rook').length + hitsBy(seen, 'crow').length + hitsBy(seen, 'wren').length).toBeGreaterThan(0);
    // A blow sent before the stage heard its striker or its target fall is refused, rightly: none other is.
    expect(unexplainedRefusals(seen)).toEqual([]);
    await expect(game(page).getByText(/^Down 3 of 3 · Rook 0 · Crow 0 · Wren 0$/)).toBeVisible();
    console.info(`the camp by keys: ${hitsBy(seen, 'hero').length} hits by the hero, the HUD at ${await hudOf(page)}`);
  });

  await test.step('each body searched by E: Rook’s purse and coin to the hero', async () => {
    await searchAll(page, keys);
    await expect.poll(() => hudOf(page)).toMatch(/ · Coin 5$/);
    expect((await fought(page)).bodies.map((b) => b.label)).toEqual(['Nothing left', 'Nothing left', 'Nothing left']);
  });
  expect(errors).toEqual([]);
});

test('the camp by keys: a hero who stands still falls, and Back to the camp loads where they came in', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  const camp = await openCamp(page);
  await camp.focus();
  await settled(page);
  // In among them: the bandits see the hero and come.
  await holdFor(page, ['KeyW'], 2500);

  await test.step('with the pointer locked a click strikes', async () => {
    await camp.click();
    const locked = await page.evaluate(() => document.pointerLockElement?.tagName ?? null);
    test.skip(locked === null, 'This browser gives no pointer lock');
    await page.mouse.down();
    await expect.poll(async () => (await fought(page)).swing).not.toBeNull();
    await page.mouse.up();
    // Escape would pause the game as well: let the pointer go as a page would.
    await page.evaluate(() => document.exitPointerLock());
  });

  await test.step('the bandits strike until the hero falls, and the game stops', async () => {
    const struck = async () => {
      const seen = await fought(page);
      return hitsBy(seen, 'rook').length + hitsBy(seen, 'crow').length + hitsBy(seen, 'wren').length;
    };
    await expect.poll(struck, { timeout: 60_000 }).toBeGreaterThan(0);
    // The walk goes with the game: the Fallen screen is all there is.
    await expect(shellScreens(page).getByRole('heading', { name: 'You have fallen' })).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByRole('application', { name: 'The camp' })).toBeHidden();
    // Not over: the game says nothing under the Fallen screen.
    await expect(game(page).getByText('Nothing to do: the game is over.')).toHaveCount(0);
    await expect(shellScreens(page).getByText('The checkpoint is where you last came into a place.')).toBeVisible();
  });

  await test.step('Back to the camp: the hero whole again where they came in, the bandits too', async () => {
    await shellScreens(page).getByRole('button', { name: 'Back to The camp' }).click();
    await expect(game(page).getByRole('heading', { name: 'Health 80 · Arrows 10 · Coin 0' })).toBeVisible();
    await expect(game(page).getByText(/^Down 0 of 3 · Rook 6 · Crow 9 · Wren 10$/)).toBeVisible();
    await expect.poll(async () => (await walked(page)).feet[2]).toBeGreaterThan(9);
  });
  expect(errors).toEqual([]);
});

/** The pad's right stick pushed until the walk's yaw is `degrees` on from now, within 4°. */
async function padTurn(page: Page, degrees: number): Promise<void> {
  await page.evaluate(
    (by) =>
      new Promise<void>((resolve) => {
        const pad = (window as unknown as { __pad: { axes: number[] } }).__pad;
        const yaw = () =>
          (window as unknown as { __ebWalk: { character(): { yaw: number } } }).__ebWalk.character().yaw;
        const want = yaw() + by;
        const started = performance.now();
        const tick = () => {
          const off = ((((want - yaw()) % 360) + 540) % 360) - 180;
          if (Math.abs(off) < 4 || performance.now() - started > 3000) {
            pad.axes = [0, 0, 0, 0];
            return resolve();
          }
          // Pushed right turns right, which takes yaw away: the push against the turn wanted.
          const push = Math.max(0.35, Math.min(1, Math.abs(off) / 40));
          pad.axes = [0, 0, off > 0 ? -push : push, 0];
          requestAnimationFrame(tick);
        };
        tick();
      }),
    degrees,
  );
}

test('the camp by a pad: the right trigger strikes, the sticks steer, X searches', async ({ page }) => {
  test.setTimeout(400_000);
  await fakePad(page);
  const errors = watchErrors(page);
  const camp = await openCamp(page);
  await camp.focus();
  await settled(page);
  const setPad = (change: string) =>
    page.evaluate((js) => {
      const pad = (window as unknown as { __pad: { axes: number[]; buttons: { pressed: boolean; value: number }[] } })
        .__pad;
      if (js === 'rt') pad.buttons[7] = { ...pad.buttons[7], pressed: true, value: 1 } as (typeof pad.buttons)[number];
      if (js === 'rt-off')
        pad.buttons[7] = { ...pad.buttons[7], pressed: false, value: 0 } as (typeof pad.buttons)[number];
      // Pushed all the way the stick runs (past 0.9), short of it it walks.
      if (js === 'run') pad.axes = [0, -1, 0, 0];
      if (js === 'walk') pad.axes = [0, -0.8, 0, 0];
      if (js === 'still') pad.axes = [0, 0, 0, 0];
    }, change);
  const pad: Steer = {
    turn: (degrees) => padTurn(page, degrees),
    walk: async (ms, run) => {
      await setPad(run ? 'run' : 'walk');
      await page.waitForTimeout(ms);
      await setPad('still');
    },
    attack: async () => {},
    use: () => padPress(page, 2),
  };

  await test.step('the right trigger held: each bandit struck until all three lie', async () => {
    await setPad('rt');
    try {
      await fightUntil(page, pad, allDown);
    } finally {
      await setPad('rt-off');
    }
    expect(hitsBy(await fought(page), 'hero').length).toBeGreaterThanOrEqual(BANDITS.length);
    console.info(`the camp by a pad: the HUD at ${await hudOf(page)}`);
  });

  await test.step('each body searched by X', async () => {
    await searchAll(page, pad);
    await expect.poll(() => hudOf(page)).toMatch(/ · Coin 5$/);
  });
  expect(errors).toEqual([]);
});
