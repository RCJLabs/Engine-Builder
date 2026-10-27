/**
 * M6.4's gate (D76, docs/specs/combat.md#the-gate), what its specs share: the camp brought into the
 * editor and played, what window.__ebWalk says of the fights, and a fight steered by any input:
 * turned to the nearest bandit standing (the engaged first, as a player would), walked up to them and
 * struck, until the test has what it waits for.
 */
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { game, newGame, showPlay } from './hutScreens.ts';
import { fixtureZip } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';
import { type Agent, nav } from './squareHelpers.ts';
import { dragMouse, drawing, holdFor, type Walked, walked } from './walkHelpers.ts';

export const CAMP = join(import.meta.dirname, '../../../tools/cli/test/fixtures/camp');
export const BANDITS = ['crow', 'rook', 'wren'] as const;

/** What the walk says of its fights: src/walk/fight.ts's WalkFight. */
export interface FightSeen {
  readonly weapon: string;
  readonly swing: 'windup' | 'strike' | 'recover' | null;
  readonly aimed: string | null;
  readonly engaged: readonly string[];
  readonly npcs: readonly { readonly actor: string; readonly swing: string | null; readonly down: boolean }[];
  readonly arrows: readonly { readonly by: string }[];
  readonly sent: readonly {
    readonly action: { readonly type: string; readonly by?: string; readonly on?: string; readonly weapon?: string };
    readonly sent: string;
    readonly engaged?: boolean;
  }[];
  readonly bodies: readonly { readonly actor: string; readonly label: string }[];
}

export async function fought(page: Page): Promise<FightSeen> {
  const seen = await page.evaluate(
    () => (window as unknown as { __ebWalk?: { fight(): unknown } }).__ebWalk?.fight() ?? null,
  );
  if (!seen) throw new Error('Nothing fights in the space walked');
  return seen as FightSeen;
}

/** The hits the sim took, by whom. */
export const hitsBy = (seen: FightSeen, by: string) =>
  seen.sent.filter((s) => s.sent === 'accepted' && s.action.type === 'fighting/hit' && s.action.by === by);

export const fallenOf = (seen: FightSeen): string[] =>
  seen.npcs
    .filter((n) => n.down)
    .map((n) => n.actor)
    .sort();

/**
 * The refused hits a fall doesn't explain. A hit sent before the stage heard of a fall, its striker's
 * or its target's, is refused, rightly: it comes after the last hit taken on one of the two that
 * fell, the one that felled them. So is an NPC's hit sent while the stage's view, a round trip old,
 * still had it in the fight the sim had taken it out of (M6.8's CI saw Wren's arrow land so). Any
 * other refusal is the stage sending what the sim won't take.
 */
export function unexplainedRefusals(seen: FightSeen) {
  const hits = seen.sent.filter((s) => s.action.type === 'fighting/hit');
  const lastTaken = new Map<string, number>();
  hits.forEach((s, i) => {
    if (s.sent === 'accepted' && s.action.on) lastTaken.set(s.action.on, i);
  });
  const fell = new Set(fallenOf(seen));
  const afterFall = (actor: string | undefined, i: number) =>
    actor !== undefined && fell.has(actor) && i > (lastTaken.get(actor) ?? Number.POSITIVE_INFINITY);
  return hits.filter(
    (s, i) => s.sent === 'refused' && s.engaged !== true && !afterFall(s.action.by, i) && !afterFall(s.action.on, i),
  );
}

/** The HUD's first line, as "Health 80 · Arrows 10 · Coin 0". */
export async function hudOf(page: Page): Promise<string> {
  const text = await game(page)
    .getByRole('heading', { name: /^Health / })
    .textContent();
  return text?.trim() ?? '';
}

/** The camp brought into the editor from a zip of it: the fixture's own, unless one is given. */
export async function importCamp(page: Page, touch = false, zip = fixtureZip(CAMP, 'camp')): Promise<void> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    how(page.getByRole('button', { name: 'Import zip' })),
  ]);
  await chooser.setFiles(zip);
  await expect(openProject(page).getByRole('heading', { name: 'The camp' })).toBeVisible();
}

/** Its scripts let run, and a new game of it in Play: the camp drawn, its navmesh open. */
export async function playCamp(page: Page, touch = false): Promise<Locator> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  const panel = await showPlay(page);
  await how(panel.getByRole('button', { name: 'Run its scripts' }));
  const play = panel.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled();
  await how(play);
  await newGame(page, how);
  await expect(game(page).getByRole('heading', { name: 'Health 80 · Arrows 10 · Coin 0' })).toBeVisible();
  const box = await drawing(page, 'camp', 'The camp');
  await expect
    .poll(
      () =>
        nav(page).then(
          (n) => n.navmesh.polygons,
          () => 0,
        ),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  return box;
}

/** The camp imported and played. */
export async function openCamp(page: Page, touch = false): Promise<Locator> {
  await importCamp(page, touch);
  return playCamp(page, touch);
}

/** How a test turns, walks, strikes and uses: by keys and the mouse, a pad, or touch. */
export interface Steer {
  /** Turned by `degrees`, more yaw to the left. */
  turn(degrees: number): Promise<void>;
  /** Forward for about `ms`, running when `run`. */
  walk(ms: number, run?: boolean): Promise<void>;
  /** Attack: a press, or nothing while it is held throughout. */
  attack(): Promise<void>;
  use(): Promise<void>;
}

export interface Seen {
  readonly fight: FightSeen;
  readonly agents: readonly Agent[];
  readonly me: Walked;
}

export async function look(page: Page): Promise<Seen> {
  const [fight, seen, me] = await Promise.all([fought(page), nav(page), walked(page)]);
  return { fight, agents: seen.agents, me };
}

/** The yaw that faces a point on the ground, in degrees: 0 looks along −z. */
export const yawTo = (from: readonly number[], to: readonly number[]): number =>
  (Math.atan2(-((to[0] as number) - (from[0] as number)), -((to[2] as number) - (from[2] as number))) * 180) / Math.PI;
const shortest = (degrees: number) => ((((degrees % 360) + 540) % 360) - 180) as number;
const acrossTo = (a: readonly number[], b: readonly number[]) =>
  Math.hypot((a[0] as number) - (b[0] as number), (a[2] as number) - (b[2] as number));

/** Turned to `at` within `slack` degrees and walked up to within `within` metres of it. */
export async function closeOn(steer: Steer, me: Walked, at: readonly number[], within: number, slack = 15) {
  const off = shortest(yawTo(me.feet, at) - me.yaw);
  if (Math.abs(off) > slack) await steer.turn(off);
  const d = acrossTo(me.feet, at);
  // Far off, a longer run before looking again: a player crossing to an archer doesn't stroll.
  if (d > within) await (d > 4 ? steer.walk(400, true) : steer.walk(150));
}

/**
 * The fight steered until `done`: each round turned to the nearest bandit standing, the engaged
 * first, walked up to within reach and struck. The hero falling ends it, as the game does. With
 * `foes`, only those are fought: a space with others in it, as M6.9's hamlet has its villagers.
 */
export async function fightUntil(
  page: Page,
  steer: Steer,
  done: (seen: Seen) => boolean,
  timeout = 120_000,
  foes?: readonly string[],
): Promise<Seen> {
  const started = Date.now();
  for (;;) {
    const seen = await look(page);
    if (done(seen)) return seen;
    if (Date.now() - started > timeout) throw new Error(`The fight went on past ${timeout} ms`);
    const down = new Set(fallenOf(seen.fight));
    const standing = seen.agents.filter(
      (a) => !down.has(a.actor) && a.state !== 'away' && (foes === undefined || foes.includes(a.actor)),
    );
    const engaged = standing.filter((a) => seen.fight.engaged.includes(a.actor));
    const nearest = (engaged.length > 0 ? engaged : standing).sort(
      (a, b) => acrossTo(a.at, seen.me.feet) - acrossTo(b.at, seen.me.feet),
    )[0];
    if (process.env.CAMP_LOG && nearest)
      console.info(
        `${Date.now() - started} ${nearest.actor} d=${acrossTo(nearest.at, seen.me.feet).toFixed(1)} off=${shortest(yawTo(seen.me.feet, nearest.at) - seen.me.yaw).toFixed(0)} swing=${seen.fight.swing} aimed=${seen.fight.aimed} hits=${hitsBy(seen.fight, 'hero').length} engaged=${seen.fight.engaged.join(',')} took=${seen.fight.sent.filter((s) => s.sent === 'accepted' && s.action.on === 'hero').length}`,
      );
    if (nearest) await closeOn(steer, seen.me, nearest.at, 1.8);
    await steer.attack();
  }
}

/**
 * The Container screen a search opens (M6.8): everything in it taken, when there is anything, and it
 * closed, by `press` (a click, or a tap on a phone).
 */
export async function takeAllAndClose(page: Page, press: (button: Locator) => Promise<void>): Promise<void> {
  const close = game(page).getByRole('button', { name: 'Close', exact: true });
  await expect(close).toBeVisible();
  const all = game(page).getByRole('button', { name: 'Take all' });
  if (await all.isEnabled()) await press(all);
  await press(close);
  await expect(close).toBeHidden();
}

/** Each body walked up to and searched: its bag taken from and closed, its label "Nothing left" once it is empty. */
export async function searchAll(
  page: Page,
  steer: Steer,
  press: (button: Locator) => Promise<void> = (button) => button.click(),
  timeout = 60_000,
): Promise<void> {
  const started = Date.now();
  for (;;) {
    const seen = await look(page);
    const left = seen.fight.bodies.filter((b) => b.label === 'Search').map((b) => b.actor);
    if (left.length === 0) return;
    if (Date.now() - started > timeout) throw new Error(`Bodies left unsearched: ${left.join(', ')}`);
    const bodies = seen.agents.filter((a) => left.includes(a.actor));
    const nearest = bodies.sort((a, b) => acrossTo(a.at, seen.me.feet) - acrossTo(b.at, seen.me.feet))[0];
    if (!nearest) continue;
    const prompt = await page.evaluate(
      () =>
        (window as unknown as { __ebWalk?: { prompt(): { label: string } | null } }).__ebWalk?.prompt()?.label ?? null,
    );
    if (prompt === 'Search') {
      await steer.use();
      await takeAllAndClose(page, press);
    } else await closeOn(steer, seen.me, nearest.at, 1.2, 10);
  }
}

/**
 * Fingers on one touch screen, as a phone has them: every touch through one DevTools session that
 * lists each finger still down, so a thumb on the stick stays down while the other taps a button.
 * A finger is lifted by a touchEnd that names it alone: one left out of a touchMove stays down, and
 * its next press would only move it (M6.9 found the look's finger never lifted under a held Attack).
 */
/** How long a tap on the prompt is held: long enough for a body's bag or a talk to open under it (M6.10). */
export const PROMPT_HOLD_MS = 400;

export async function hands(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const down = new Map<number, { x: number; y: number }>();
  const send = (type: 'touchStart' | 'touchMove') =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: [...down].map(([id, at]) => ({ ...at, id })),
    });
  const centre = async (target: Locator) => {
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error('Nothing to touch');
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const self = {
    async press(id: number, x: number, y: number) {
      down.set(id, { x, y });
      await send('touchStart');
    },
    /** To `dx`, `dy` from where it is, in a few moves. */
    async slide(id: number, dx: number, dy: number) {
      const from = down.get(id);
      if (!from) throw new Error(`Finger ${id} isn't down`);
      for (let i = 1; i <= 6; i++) {
        down.set(id, { x: from.x + (dx * i) / 6, y: from.y + (dy * i) / 6 });
        await send('touchMove');
      }
    },
    async lift(id: number) {
      const at = down.get(id);
      if (!at) return;
      down.delete(id);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...at, id }] });
    },
    /** A tap on a button by a finger of its own, held `ms` as a slow thumb holds it. */
    async tap(target: Locator, id = 9, ms = 0) {
      const at = await centre(target);
      await self.press(id, at.x, at.y);
      if (ms > 0) await page.waitForTimeout(ms);
      await self.lift(id);
    },
    close: () => cdp.detach(),
  };
  return self;
}

/** Keys and the mouse: a drag turns, W walks, E uses; Attack is F, held by the caller. */
export function keySteer(page: Page, camp: Locator): Steer {
  return {
    turn: (degrees) => dragMouse(page, camp, Math.round(-degrees / 0.25), 0),
    walk: async (ms, run) => {
      await holdFor(page, run ? ['ShiftLeft', 'KeyW'] : ['KeyW'], ms);
    },
    attack: async () => {},
    use: () => page.keyboard.press('KeyE'),
  };
}

/**
 * Touch, through one set of fingers: a drag on the view's right turns, the stick on its left walks
 * or runs while the other thumb taps Attack, and the prompt is tapped to use.
 */
export function touchSteer(page: Page, camp: Locator, fingers: Awaited<ReturnType<typeof hands>>): Steer {
  const attack = camp.getByRole('button', { name: 'Attack' });
  /**
   * A point on the view a thumb can reach, `across` it and `down` the part shown: sideways, the panel
   * shows only part of it. The look starts higher, clear of the buttons in the corner.
   */
  const onView = async (across: number, down: number) => {
    await camp.scrollIntoViewIfNeeded();
    const area = await camp.boundingBox();
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
    // Past 48 px the stick runs.
    walk: async (ms, run) => {
      const at = await onView(0.25, 0.6);
      await fingers.press(1, at.x, at.y);
      await fingers.slide(1, 0, run ? -56 : -44);
      const until = Date.now() + ms;
      try {
        while (Date.now() < until) await fingers.tap(attack);
      } finally {
        await fingers.lift(1);
      }
    },
    attack: async () => {
      if (await attack.isVisible()) await fingers.tap(attack);
    },
    use: () => fingers.tap(camp.locator('.walk-use'), 9, PROMPT_HOLD_MS),
  };
}
