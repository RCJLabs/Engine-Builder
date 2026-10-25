/**
 * M6.2's gate (D74, docs/specs/navigation.md#the-gate), what its specs share: the square brought into
 * the editor and played, what window.__ebWalk says of its navigation, the closest any two NPCs
 * stand, and a tap on a point of the space where it is drawn.
 */
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { game, newGame, showPlay } from './hutScreens.ts';
import { fixtureZip } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';
import { drawing } from './walkHelpers.ts';

export const SQUARE = join(import.meta.dirname, '../../../tools/cli/test/fixtures/square');
export const VILLAGERS = ['ash', 'bea', 'cal', 'dot', 'eli', 'fen', 'gil', 'hal', 'ivy', 'jo', 'kit', 'lin'] as const;
/** Where spaces/square.json places Tam, the carter. */
export const CARTER_AT = [3, 0, -13] as const;
/** Open cobbles before the well, seen past stall 3 from the gate: where a tap sends the player. */
export const BY_WELL = [3.5, 0, 7] as const;

type Vec3 = readonly [number, number, number];

/** An NPC as the crowd walks it: src/walk/crowdWalk.ts's WalkingNpc. */
export interface Agent {
  readonly actor: string;
  readonly path: string;
  readonly at: Vec3;
  readonly velocity: Vec3;
  readonly yaw?: number;
  readonly goal?: string;
  readonly target?: Vec3;
  readonly state: 'walking' | 'standing' | 'away';
}

/** What the walk says of its navigation: src/walk/navStage.ts's WalkNav. */
export interface NavSeen {
  readonly navmesh: { readonly tiles: number; readonly polygons: number };
  readonly agents: readonly Agent[];
  readonly tap: { readonly target: Vec3; readonly corners: readonly Vec3[]; readonly next: number } | null;
  readonly sent: readonly { readonly arrived: Readonly<Record<string, string>>; readonly sent: string }[];
}

export async function nav(page: Page): Promise<NavSeen> {
  const seen = await page.evaluate(
    () => (window as unknown as { __ebWalk?: { nav(): unknown } }).__ebWalk?.nav() ?? null,
  );
  if (!seen) throw new Error('No navmesh is being walked');
  return seen as NavSeen;
}

export const agentOf = (seen: NavSeen, actor: string): Agent | undefined => seen.agents.find((a) => a.actor === actor);
export const across = (a: Vec3, b: readonly number[]): number =>
  Math.hypot(a[0] - (b[0] as number), a[2] - (b[2] as number));

/** Each arrival the sim took, as "actor goal". */
export const heard = (seen: NavSeen): Set<string> =>
  new Set(
    seen.sent
      .filter((s) => s.sent === 'accepted')
      .flatMap((s) => Object.entries(s.arrived).map(([actor, goal]) => `${actor} ${goal}`)),
  );

/** The closest two NPCs built stand now, across the ground. */
export function closest(seen: NavSeen): number {
  const built = seen.agents.filter((a) => a.state !== 'away');
  let least = Infinity;
  for (const [i, a] of built.entries()) for (const b of built.slice(i + 1)) least = Math.min(least, across(a.at, b.at));
  return least;
}

/** The square imported, its scripts let run, and a new game of it in Play: the square drawn. */
export async function openSquare(page: Page, touch = false): Promise<Locator> {
  const how = (button: Locator) => (touch ? button.tap() : button.click());
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    how(page.getByRole('button', { name: 'Import zip' })),
  ]);
  await chooser.setFiles(fixtureZip(SQUARE, 'square'));
  await expect(openProject(page).getByRole('heading', { name: 'The square' })).toBeVisible();
  const panel = await showPlay(page);
  await how(panel.getByRole('button', { name: 'Run its scripts' }));
  const play = panel.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled();
  await how(play);
  await newGame(page, how);
  await expect(game(page).getByText('Tam waits at the gate with a barrel for the well.')).toBeVisible();
  const box = await drawing(page, 'square', 'The square');
  // nav.js loads beside walk.js: the navmesh is open once its hook says so.
  await expect
    .poll(
      () =>
        nav(page).then(
          (n) => n.navmesh.polygons,
          () => 0,
        ),
      { timeout: 30_000 },
    )
    .toBe(135);
  return box;
}

/**
 * A finger's tap where a point of the space is drawn: down and up at once, inside TAP_MS and TAP_PX.
 * It has to land on the view itself, not a button over it, where a finger can reach on the screen.
 */
export async function tapAt(page: Page, view: Locator, point: Vec3): Promise<void> {
  await view.scrollIntoViewIfNeeded();
  const at = await view.evaluate((box, p) => {
    const hook = (window as unknown as { __ebWalk?: { screenOf(p: Vec3): readonly [number, number] | null } }).__ebWalk;
    const drawn = hook?.screenOf(p);
    if (!drawn) return null;
    const rect = box.getBoundingClientRect();
    const [x, y] = [rect.left + drawn[0], rect.top + drawn[1]];
    const hit = document.elementFromPoint(x, y);
    return hit && box.contains(hit) && !hit.closest('button') ? { x, y } : null;
  }, point);
  if (!at) throw new Error(`${JSON.stringify(point)} isn’t drawn where a finger can reach it`);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y, id: 3 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
