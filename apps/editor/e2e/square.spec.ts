/**
 * M6.2's gate on desktop (D74, docs/specs/navigation.md#the-gate): the square played in the Play
 * panel by keys and the mouse. Its navmesh opens with every NPC standing where placed; Tam's talk
 * sends the carter to the well, round stall 3 and not through it, and their arrival sets the flag
 * the HUD shows; the market's zone sends the twelve villagers across the square, none ever within
 * two radii less 0.1 m of another; and a save while they walk back loads with each where it stood.
 * Everything read through window.__ebWalk and the HUD. The walking speed is a first guess, untested
 * for feel.
 */
import { expect, type Page, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { acted, offered } from './glenHelpers.ts';
import { game, shellScreens, topScreen } from './hutScreens.ts';
import { pauseDialog } from './playShellHelpers.ts';
import {
  type Agent,
  across,
  agentOf,
  CARTER_AT,
  closest,
  heard,
  type NavSeen,
  nav,
  openSquare,
  VILLAGERS,
} from './squareHelpers.ts';
import { drawing, faceTowards, holdUntilPast, near, settled, walked } from './walkHelpers.ts';

/** Stall 3's counter, across the ground: spaces/square.json's stall-3 and prefabs/stall.json. */
const STALL_3 = { x: 0, z: -3, half: [1.5, 0.75] } as const;
const WELL: readonly number[] = [0, 0, 9];
/** Two figures' radii (src/spaces/figureLook.ts), less 0.1 m. */
const APART = 0.5;

const offStall = (a: Agent) =>
  Math.hypot(
    Math.max(Math.abs(a.at[0] - STALL_3.x) - STALL_3.half[0], 0),
    Math.max(Math.abs(a.at[2] - STALL_3.z) - STALL_3.half[1], 0),
  );

/** Where each NPC last arrived, as the sim took it. */
function lastArrived(seen: NavSeen): Map<string, string> {
  const last = new Map<string, string>();
  for (const said of seen.sent) {
    if (said.sent === 'accepted') for (const [actor, at] of Object.entries(said.arrived)) last.set(actor, at);
  }
  return last;
}

/** A villager's other mark: the sheet's next goal. */
const otherWay = (at: string | undefined) =>
  at?.replace(/-(north|south)$/, (_, way) => (way === 'north' ? '-south' : '-north'));

/** The navigation read every 100 ms until `done`, each reading handed to `seen`. */
async function watch(page: Page, done: (n: NavSeen) => boolean, seen: (n: NavSeen) => void, timeout: number) {
  const until = Date.now() + timeout;
  for (;;) {
    const now = await nav(page);
    seen(now);
    if (done(now)) return now;
    if (Date.now() > until)
      throw new Error(`Not done in ${timeout} ms: ${JSON.stringify({ ...now, sent: now.sent.slice(-3) })}`);
    await page.waitForTimeout(100);
  }
}

test('the square by keys and the mouse: Tam sent to the well, the villagers across it, and a save while they walk', async ({
  page,
}) => {
  test.setTimeout(400_000);
  const errors = watchErrors(page);
  const square = await openSquare(page);
  await square.focus();
  const start = await settled(page);
  expect(near(start.feet[0], 0, 0.01) && near(start.feet[2], -14, 0.01)).toBe(true);

  await test.step('the navmesh open, every NPC standing where it was placed', async () => {
    const seen = await nav(page);
    expect(seen.navmesh).toEqual({ tiles: 1, polygons: 135 });
    expect(seen.agents.map((a) => a.actor).sort()).toEqual(['carter', ...VILLAGERS].sort());
    expect(seen.agents.every((a) => a.state === 'standing' && a.goal === undefined)).toBe(true);
    expect(across(agentOf(seen, 'carter')?.at ?? [9, 9, 9], CARTER_AT)).toBeLessThan(0.3);
  });

  await test.step('Tam’s talk sends the carter to the well', async () => {
    await faceTowards(page, square, CARTER_AT[0], CARTER_AT[2]);
    await holdUntilPast(page, ['KeyW'], 'x', { atLeast: 1.5 });
    await settled(page);
    await faceTowards(page, square, CARTER_AT[0], CARTER_AT[2]);
    await offered(page, 'carter');
    await page.keyboard.press('KeyE');
    await expect(topScreen(page).getByText('The well wants a barrel taken to it. Shall I go?')).toBeVisible();
    await topScreen(page).getByRole('button', { name: 'Take the cart to the well' }).click();
    await expect(topScreen(page).getByText('Round the stalls, then. Mind the cobbles.')).toBeVisible();
    await topScreen(page).getByRole('button', { name: 'Go on' }).click();
    await expect
      .poll(async () => {
        const carter = agentOf(await nav(page), 'carter');
        return [carter?.state, carter?.goal];
      })
      .toEqual(['walking', 'well']);
  });

  await test.step('Tam walks round stall 3 to the well, and their arrival sets the flag the HUD shows', async () => {
    let nearest = Infinity;
    const end = await watch(
      page,
      (n) => heard(n).has('carter well'),
      (n) => {
        const carter = agentOf(n, 'carter');
        if (carter) nearest = Math.min(nearest, offStall(carter));
      },
      90_000,
    );
    expect(nearest, 'Tam came this close to stall 3').toBeGreaterThan(0.25);
    const carter = agentOf(end, 'carter');
    expect(carter?.state).toBe('standing');
    // Within ARRIVED_M (0.5 m) of the navmesh's edge nearest the well's middle: its 1 m rim, the bake's
    // three 0.15 m cells for the 0.35 m radius and a cell of rasterising (1.57 m measured headless).
    expect(across(carter?.at ?? [9, 9, 9], WELL)).toBeLessThan(1 + 0.45 + 0.15 + 0.5);
    await expect(game(page).getByText('The barrel is at the well.')).toBeVisible();
  });

  await test.step('the market’s zone sends the twelve across the square, none ever meeting another', async () => {
    await faceTowards(page, square, 0, -11);
    await holdUntilPast(page, ['KeyW'], 'z', { atLeast: -11.2 });
    await expect.poll(async () => (await walked(page)).sent).toContainEqual({ object: 'market', sent: 'accepted' });
    await expect
      .poll(async () => {
        const seen = await nav(page);
        return VILLAGERS.filter((v) => agentOf(seen, v)?.state === 'walking').length;
      })
      .toBe(12);
    let least = Infinity;
    const crossed = await watch(
      page,
      (n) => VILLAGERS.every((v, i) => heard(n).has(`${v} ${v}-${i < 6 ? 'south' : 'north'}`)),
      (n) => {
        least = Math.min(least, closest(n));
      },
      150_000,
    );
    expect(least, 'the closest two NPCs came').toBeGreaterThan(APART);
    // The sheet sends each on, the other way from where it last arrived (the quickest are back already),
    // as soon as the stage hears the sim's next goal.
    await expect
      .poll(async () => {
        const seen = await nav(page);
        return VILLAGERS.filter((v) => agentOf(seen, v)?.goal !== otherWay(lastArrived(seen).get(v)));
      })
      .toEqual([]);
    expect(crossed.agents).toHaveLength(13);
  });

  await test.step('saved while they walk back; a load stands each where it was', async () => {
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect.poll(async () => (await nav(page)).sent.at(-1)?.sent).toBe('accepted');
    await expect.poll(async () => (await acted(page)).stood.at(-1)?.sent).toBe('accepted');
    const stood = await nav(page);
    expect(VILLAGERS.every((v) => agentOf(stood, v)?.state === 'walking')).toBe(true);
    await pauseDialog(page).getByRole('button', { name: 'Quit to title' }).click();
    await shellScreens(page)
      .getByRole('button', { name: /^Continue/ })
      .click();
    await drawing(page, 'square', 'The square');
    await expect
      .poll(
        () =>
          nav(page).then(
            (n) => n.agents.length,
            () => 0,
          ),
        { timeout: 30_000 },
      )
      .toBe(13);
    const loaded = await nav(page);
    expect((await acted(page)).began).toEqual({ from: 'at' });
    // Tam stands where they arrived; the villagers go on from where they stood, at most a second on.
    expect(across(agentOf(loaded, 'carter')?.at ?? [9, 9, 9], agentOf(stood, 'carter')?.at ?? [])).toBeLessThan(0.05);
    for (const v of VILLAGERS) {
      const [was, now] = [agentOf(stood, v), agentOf(loaded, v)];
      expect(now?.goal, v).toBe(was?.goal);
      expect(across(now?.at ?? [99, 99, 99], was?.at ?? []), v).toBeLessThan(1.5);
    }
    await expect(game(page).getByText('The barrel is at the well.')).toBeVisible();
  });
  expect(errors).toEqual([]);
});
