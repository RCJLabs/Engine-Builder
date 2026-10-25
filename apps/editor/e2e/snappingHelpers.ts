/**
 * M5.10's snapping gate (D72, docs/specs/streaming.md#snapping), what its specs share: a project
 * with the starter kit, its hut space read back from storage, what window.__ebViewport says of the
 * boxes and the latches, and a move handle dragged by mouse or finger towards a point in the world,
 * the drag's latches read before it lets go.
 */
import { expect, type Page } from '@playwright/test';
import { stored } from './kitHelpers.ts';
import { showAssets } from './ludus.ts';
import { placeModel } from './modelHelpers.ts';
import { grip, scenePanel } from './spaceHelpers.ts';
import { lowerSheet } from './templateHelpers.ts';

export const FOLDER = 'hut-works';

type Vec3 = readonly [number, number, number];
export interface Latched {
  readonly axis: 0 | 1 | 2;
  readonly to: string;
  readonly kind: 'touching' | 'flush';
}
interface Hooked {
  __ebViewport?: {
    screenOf(point: Vec3): { x: number; y: number } | null;
    latched(): Latched[];
    boxes(): { id: string; box: { min: Vec3; max: Vec3 } }[];
  };
}

type Placement = { id: string; record?: string; at?: number[]; turn?: number[] };
export const hut = (page: Page) =>
  stored(page, FOLDER, 'spaces/hut.json') as Promise<{ name: string; objects: Placement[] } | null>;
/** Where an object of the hut stands, as its file says: [0, 0, 0] when it leaves `at` out. */
export async function at(page: Page, id: string): Promise<number[] | undefined> {
  const found = (await hut(page))?.objects.find((o) => o.id === id);
  return found ? (found.at ?? [0, 0, 0]) : undefined;
}

/** The starter kit added in the Assets panel. */
export async function addKitTo(page: Page, touch: boolean): Promise<void> {
  const panel = await showAssets(page);
  const add = panel.getByRole('button', { name: 'Add starter kit' });
  await (touch ? add.tap() : add.click());
  await expect.poll(() => stored(page, FOLDER, 'records/model/kit-wall.json')).toMatchObject({ name: 'Wall' });
}

export const boxes = (page: Page) => page.evaluate(() => (window as unknown as Hooked).__ebViewport?.boxes() ?? []);

/**
 * On a phone, the sheet lowered, so the whole view is under the finger. The camera stays where the
 * space opened it, the hut in sight: Frame on one 2 m piece comes so close that an axis can point
 * nearly at the camera, and a finger's 400 px moved a roof less than a metre.
 */
async function inView(page: Page, touch: boolean): Promise<void> {
  if (!touch) return;
  await lowerSheet(page);
  await scenePanel(page)
    .locator('.scene-view')
    .evaluate((view) => view.scrollIntoView({ block: 'nearest' }));
  // A finger is off the glass a while after a tap before it presses again: Chrome drops a press that
  // comes straight after one (spaceHelpers.ts's dragTouch says the same of a tap after a drag).
  await page.waitForTimeout(250);
}

/** What the view says mid-drag: what it has latched onto, and where the chosen object's box is drawn. */
export interface Midway {
  readonly latched: readonly Latched[];
  readonly box: { readonly min: Vec3; readonly max: Vec3 } | undefined;
}

/**
 * A move handle (`move-x`, `move-y` or `move-z`) dragged by mouse or one finger, 2 px at a time,
 * towards its axis's plus (`way` 1) or minus (-1) end, until the view says `done`, as a person
 * drags a piece until it latches: from here, how far a pixel moves it changes with perspective.
 * Says what it had latched onto as it let go.
 */
export async function dragUntil(
  page: Page,
  handle: string,
  object: string,
  way: 1 | -1,
  done: (now: Midway) => boolean,
  touch: boolean,
): Promise<Latched[]> {
  await inView(page, touch);
  const g = await grip(page, handle);
  const midway = () =>
    page.evaluate((id) => {
      const hook = (window as unknown as Hooked).__ebViewport;
      return { latched: hook?.latched() ?? [], box: hook?.boxes().find((b) => b.id === id)?.box };
    }, object);
  const cdp = touch ? await page.context().newCDPSession(page) : null;
  const to = async (x: number, y: number, phase: 'start' | 'move') => {
    if (!cdp) {
      await page.mouse.move(x, y);
      if (phase === 'start') await page.mouse.down();
      return;
    }
    await cdp.send('Input.dispatchTouchEvent', {
      type: phase === 'start' ? 'touchStart' : 'touchMove',
      touchPoints: [{ x, y }],
    });
  };
  await to(g.x, g.y, 'start');
  let now: Midway = { latched: [], box: undefined };
  for (let px = 2; px <= 400; px += 2) {
    await to(g.x + g.along[0] * px * way, g.y + g.along[1] * px * way, 'move');
    now = await midway();
    if (done(now)) break;
  }
  if (!done(now)) throw new Error(`The drag of ${handle} never got there: ${JSON.stringify(now)}`);
  if (cdp) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    // A tap straight after a drag's end is dropped by Chrome (spaceHelpers.ts's dragTouch).
    await page.waitForTimeout(250);
  } else await page.mouse.up();
  return [...now.latched];
}

const HANDLES = ['move-x', 'move-y', 'move-z'] as const;
/** Where a box puts its object along an axis: its middle across, its bottom up. */
const placeOn = (box: Midway['box'], axis: 0 | 1 | 2) =>
  box ? (axis === 1 ? box.min[1] : (box.min[axis] + box.max[axis]) / 2) : Number.NaN;

/**
 * An object dragged along an axis towards `target` until it latches `kind` onto one of `to`, from
 * wherever Add put it, which the view's middle decides and so differs by screen: one that starts
 * within a metre of it is first dragged a metre and a half away, so the latch is the drag's doing.
 */
export async function latchAlong(
  page: Page,
  id: string,
  axis: 0 | 1 | 2,
  target: number,
  kind: Latched['kind'],
  to: readonly string[],
  touch: boolean,
): Promise<Latched[]> {
  const handle = HANDLES[axis];
  const box = async () => (await boxes(page)).find((b) => b.id === id)?.box;
  let from = placeOn(await box(), axis);
  if (Math.abs(target - from) < 1) {
    const away = target >= from ? -1 : 1;
    await dragUntil(page, handle, id, away, (now) => Math.abs(placeOn(now.box, axis) - target) >= 1.5, touch);
    await expect.poll(async () => Math.abs(placeOn(await box(), axis) - target) >= 1.5).toBe(true);
    from = placeOn(await box(), axis);
  }
  // Latched there, not on the way: a piece dragged away can leave latched where it stopped.
  const there = (now: Midway) => latchedOnto(axis, to, kind)(now) && Math.abs(placeOn(now.box, axis) - target) < 1e-3;
  return dragUntil(page, handle, id, target > from ? 1 : -1, there, touch);
}

/** Latched onto `to` on `axis`, `kind`. */
export const latchedOnto =
  (axis: 0 | 1 | 2, to: readonly string[], kind: Latched['kind']) =>
  (now: Midway): boolean =>
    now.latched.some((l) => l.axis === axis && to.includes(l.to) && l.kind === kind);

/** Until the hut's file has this object here. */
export async function expectAt(page: Page, id: string, place: number[]): Promise<void> {
  await expect.poll(() => at(page, id)).toEqual(place);
}

/** Add → Model…, the model named: its id, once the view draws it and has its box. */
export async function placeKit(page: Page, name: RegExp, touch: boolean): Promise<string> {
  const before = new Set(((await hut(page))?.objects ?? []).map((o) => o.id));
  await placeModel(page, name, touch);
  await expect.poll(async () => ((await hut(page))?.objects ?? []).filter((o) => !before.has(o.id)).length).toBe(1);
  const id = ((await hut(page))?.objects ?? []).find((o) => !before.has(o.id))?.id as string;
  await expect.poll(async () => (await boxes(page)).some((b) => b.id === id), { timeout: 20_000 }).toBe(true);
  return id;
}

/**
 * The gate's hut, by mouse or finger: a floor; a wall and a doorway each dragged towards the floor's
 * edge until they latch flush, to the millimetre; a roof, another floor, latched flush over it and
 * then touching the walls' tops. Says the ids: the floor, the wall, the doorway and the roof.
 */
export async function buildHut(
  page: Page,
  touch: boolean,
  step: (title: string, body: () => Promise<void>) => Promise<void>,
) {
  const ids = { floor: '', wall: '', door: '', roof: '' };
  /**
   * A piece brought over the floor along x first, wherever Add put it, so it is beside the floor on
   * x; then latched flush on z to `z`, and on x to 0, each read back to the millimetre.
   */
  const onto = async (id: string, z: number) => {
    const x = async () => (await at(page, id))?.[0] ?? 0;
    if (Math.abs(await x()) > 0.6) {
      const was = await x();
      await dragUntil(page, 'move-x', id, was > 0 ? -1 : 1, (now) => Math.abs(placeOn(now.box, 0)) <= 0.6, touch);
      await expect.poll(async () => Math.abs(await x()) <= 0.6).toBe(true);
    }
    expect(await latchAlong(page, id, 2, z, 'flush', [ids.floor], touch)).toEqual([
      { axis: 2, to: ids.floor, kind: 'flush' },
    ]);
    await expect.poll(async () => (await at(page, id))?.[2]).toBe(z);
    expect(await latchAlong(page, id, 0, 0, 'flush', [ids.floor], touch)).toEqual([
      { axis: 0, to: ids.floor, kind: 'flush' },
    ]);
    await expectAt(page, id, [0, 0, z]);
  };
  await step('a floor, and a wall and a doorway latched flush to its edges', async () => {
    ids.floor = await placeKit(page, /^Floor/, touch);
    await expectAt(page, ids.floor, [0, 0, 0]);
    ids.wall = await placeKit(page, /^Wall/, touch);
    // Off the 0.5 m grid: only a latch lands it at ±0.9.
    await onto(ids.wall, 0.9);
    ids.door = await placeKit(page, /^Doorway/, touch);
    await onto(ids.door, -0.9);
  });
  await step('a roof latched flush over the floor, then touching the walls’ tops', async () => {
    ids.roof = await placeKit(page, /^Floor/, touch);
    await onto(ids.roof, 0);
    // Up past the walls' tops flush with its own, until its bottom touches them.
    const up = await dragUntil(page, 'move-y', ids.roof, 1, latchedOnto(1, [ids.wall, ids.door], 'touching'), touch);
    expect(up.map((l) => [l.axis, l.kind])).toEqual([[1, 'touching']]);
    await expectAt(page, ids.roof, [0, 2.5, 0]);
  });
  return ids;
}
