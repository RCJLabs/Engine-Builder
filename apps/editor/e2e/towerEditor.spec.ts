/**
 * M7.3's editor gate (D85, docs/specs/rooms.md#the-gate): a tower built from the starter rooms in the
 * Scene panel alone, by mouse and keys at 1280 and by touch at 390. From a new project: the starter sprites
 * added; a 2D space; Add → Building…, two slots of 48 by 32 and three floors, with the ladder; a crypt
 * placed by a press, one step of undo; a hall spanning a floor by a drag along it; two stairs set; a floor
 * added and taken off again, then refused while a stair climbs to the top; a walker placed by Add →
 * Record…; and, with a game started and a Space screen, played, the stage drawing the rooms. Untested for
 * feel.
 */
import { expect, type Page, test } from '@playwright/test';
import { hands } from './campHelpers.ts';
import { watchErrors } from './checks.ts';
import { press } from './componentHelpers.ts';
import { choose } from './hutHelpers.ts';
import { expectFits, game, newGame, showPlay } from './hutScreens.ts';
import { showPanel } from './keepEditorHelpers.ts';
import { createProject, kitsBox, newRecord, stored } from './kitHelpers.ts';
import { showAssets, showProject } from './ludus.ts';
import { showScene } from './spaceHelpers.ts';
import { building as stageBuilding } from './towerHelpers.ts';

const FOLDER = 'tower-build';
type Box = { x: number; y: number; w: number; h: number };

interface BuildingSeen {
  readonly id: string;
  readonly slot: readonly [number, number];
  readonly slots: number;
  readonly floors: number;
  readonly rooms: readonly { id: string; room: string; floor: number; slot: number; span?: number }[];
  readonly stairs: readonly { floor: number; x: number }[];
  readonly stair?: string;
}

async function chosenBuilding(page: Page): Promise<BuildingSeen | undefined> {
  // biome-ignore lint/suspicious/noExplicitAny: the view's own hook, read as it is
  return page.evaluate(() => (window as any).__ebView2d?.building());
}

async function frames(page: Page): Promise<number> {
  // biome-ignore lint/suspicious/noExplicitAny: the view's own hook, read as it is
  return page.evaluate(() => (window as any).__ebView2d?.frames() ?? 0);
}

/** The building's box on the page, once drawn, the view scrolled into sight first: the Rooms row stands above it. */
async function buildingBox(page: Page): Promise<Box> {
  await page.getByRole('application', { name: /^Keep: / }).scrollIntoViewIfNeeded();
  let box: Box | undefined;
  await expect
    .poll(async () => {
      box = await page.evaluate(
        // biome-ignore lint/suspicious/noExplicitAny: the view's own hook, read as it is
        () => (window as any).__ebView2d?.drawn().find((d: { path: string }) => d.path === 'building')?.page,
      );
      return box !== undefined;
    })
    .toBe(true);
  return box as Box;
}

/** A point on the page `x` art pixels from the building's left and `up` above floor `floor`'s foot, of 96 by `floors` × 32. */
const placePoint = (box: Box, floors: number, floor: number, x: number, up = 10): [number, number] => [
  box.x + ((x + 0.5) * box.w) / 96,
  box.y + box.h - ((floor * 32 + up) * box.h) / (floors * 32),
];

/** A press at `from`, dragged to `to`, let go: the mouse's, or a finger's. */
async function stroke(page: Page, from: [number, number], to: [number, number], touch: boolean): Promise<void> {
  if (!touch) {
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(...to, { steps: 12 });
    await page.mouse.up();
    return;
  }
  const fingers = await hands(page);
  try {
    await fingers.press(1, ...from);
    await fingers.slide(1, to[0] - from[0], to[1] - from[1]);
    await fingers.lift(1);
  } finally {
    await fingers.close();
  }
}

for (const { viewport, touch } of [
  { viewport: { width: 1280, height: 800 }, touch: false },
  { viewport: { width: 390, height: 844 }, touch: true },
]) {
  test.describe(`a building in the editor, ${viewport.width} wide`, () => {
    test.use({ viewport, ...(touch ? { hasTouch: true, isMobile: true } : {}), actionTimeout: 20_000 });

    test('a tower raised from the starter rooms, its rooms placed, stairs set, floors changed, and played', async ({
      page,
    }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      await createProject(page, 'Tower build');
      const assets = await showAssets(page);
      await press(assets.getByRole('button', { name: 'Add starter sprites' }), touch);
      await expect.poll(() => stored(page, FOLDER, 'records/room/hall.json')).toMatchObject({ name: 'Hall' });

      const panel = await showScene(page);
      await press(panel.getByRole('button', { name: 'New 2D space' }), touch);
      await panel.getByLabel('Name of the new 2D space').fill('Keep');
      await press(panel.getByRole('button', { name: 'Create' }), touch);
      await expect
        .poll(() => stored(page, FOLDER, 'spaces/keep.json'))
        .toEqual({ name: 'Keep', view: '2d', objects: [] });
      await expect.poll(() => frames(page)).toBeGreaterThan(0);

      await test.step('Add → Building…, two slots of 48 by 32 and three floors, with the ladder, centred and chosen', async () => {
        await press(panel.getByRole('button', { name: 'Add', exact: true }), touch);
        await press(panel.getByRole('button', { name: 'Building…' }), touch);
        await expect(panel.getByLabel('Stairs drawn with')).toHaveValue('ladder');
        await panel.getByLabel('Floors').fill('3');
        await press(panel.getByRole('button', { name: 'Add building' }), touch);
        await expect
          .poll(() => chosenBuilding(page))
          .toEqual({
            id: 'building',
            slot: [48, 32],
            slots: 2,
            floors: 3,
            rooms: [],
            stairs: [],
            stair: 'ladder',
          });
        // Each of the six starter rooms a button drawn with its sprite, from the sheet the view decoded.
        await expect(panel.locator('[data-room] canvas')).toHaveCount(6);
        // Centred on the view's middle, 160 by 90 in a new space: its corner 48 and 48 less.
        await expect
          .poll(
            async () =>
              ((await stored(page, FOLDER, 'spaces/keep.json')) as { objects: { at: number[] }[] }).objects[0]?.at,
          )
          .toEqual([112, 42, 0]);
        await expectFits(page);
      });

      await test.step('a crypt placed by a press on a slot, one step of undo', async () => {
        await press(panel.locator('[data-room="crypt"]'), touch);
        await expect(panel.getByRole('button', { name: 'Place' })).toHaveAttribute('aria-pressed', 'true');
        const box = await buildingBox(page);
        const at = placePoint(box, 3, 0, 20);
        await stroke(page, at, at, touch);
        await expect
          .poll(async () => (await chosenBuilding(page))?.rooms)
          .toEqual([{ id: 'crypt', room: 'crypt', floor: 0, slot: 0 }]);
        if (!touch) {
          await page.keyboard.press('Control+z');
          await expect.poll(async () => (await chosenBuilding(page))?.rooms).toEqual([]);
          await page.keyboard.press('Control+Shift+Z');
          await expect.poll(async () => (await chosenBuilding(page))?.rooms?.length).toBe(1);
        }
      });

      await test.step('a hall spanning floor 1 by a drag along it', async () => {
        await press(panel.locator('[data-room="hall"]'), touch);
        const box = await buildingBox(page);
        await stroke(page, placePoint(box, 3, 1, 10), placePoint(box, 3, 1, 80), touch);
        await expect
          .poll(async () => (await chosenBuilding(page))?.rooms.find((r) => r.id === 'hall'))
          .toEqual({ id: 'hall', room: 'hall', floor: 1, slot: 0, span: 2 });
      });

      await test.step('two stairs set by presses, from the ground and from floor 1', async () => {
        await press(panel.getByRole('button', { name: 'Stairs' }), touch);
        await expect(panel.getByRole('button', { name: 'Stairs' })).toHaveAttribute('aria-pressed', 'true');
        const box = await buildingBox(page);
        for (const [floor, x] of [
          [0, 12],
          [1, 84],
        ] as const) {
          const at = placePoint(box, 3, floor, x);
          await stroke(page, at, at, touch);
        }
        await expect.poll(async () => (await chosenBuilding(page))?.stairs.map((s) => s.floor)).toEqual([0, 1]);
        const [low, high] = (await chosenBuilding(page))?.stairs ?? [];
        expect(Math.abs((low?.x ?? 0) - 12)).toBeLessThanOrEqual(1);
        expect(Math.abs((high?.x ?? 0) - 84)).toBeLessThanOrEqual(1);
      });

      await test.step('a floor added and taken off, then refused while a stair climbs to the top', async () => {
        await press(panel.getByRole('button', { name: 'Add floor' }), touch);
        await expect.poll(async () => (await chosenBuilding(page))?.floors).toBe(4);
        await press(panel.getByRole('button', { name: 'Remove top floor' }), touch);
        await expect.poll(async () => (await chosenBuilding(page))?.floors).toBe(3);
        await press(panel.getByRole('button', { name: 'Remove top floor' }), touch);
        await expect(panel.getByText('A stair climbs to floor 2: take it out first.')).toBeVisible();
        expect((await chosenBuilding(page))?.floors).toBe(3);
        await press(panel.getByRole('button', { name: 'Stairs' }), touch);
        await expectFits(page);
      });

      await test.step('a walker made with forms and placed by Add → Record…, in the hall', async () => {
        await showProject(page);
        await kitsBox(page).getByLabel('Stats', { exact: true }).check();
        const wynn = await newRecord(page, 'actor', 'Actor', 'Wynn');
        await choose(wynn, /^Sprite/, 'Choose a sprite', 'Figure (keeper) (figure-keeper)');
        await expect
          .poll(() => stored(page, FOLDER, 'records/actor/wynn.json'))
          .toMatchObject({ sprite: 'figure-keeper' });
        const scene = await showPanel(page, 'Scene', touch);
        await press(scene.getByRole('button', { name: 'Add', exact: true }), touch);
        await press(scene.getByRole('button', { name: 'Record…' }), touch);
        await press(page.getByRole('dialog', { name: 'Place a record' }).getByRole('option', { name: /Wynn/ }), touch);
        await expect
          .poll(async () =>
            (
              (await stored(page, FOLDER, 'spaces/keep.json')) as { objects: { id: string; record?: string }[] }
            ).objects.find((o) => o.record === 'actor:wynn'),
          )
          .toBeDefined();
      });

      await test.step('played: a game started, a Space screen, the rooms drawn by the stage', async () => {
        const logic = await showPanel(page, 'Logic', touch);
        await press(logic.getByRole('button', { name: 'Start a game' }), touch);
        await expect(logic.getByRole('button', { name: /^game\.ts/ })).toBeVisible();
        const play = await showPlay(page);
        await press(play.getByRole('button', { name: 'New screen' }), touch);
        await play.getByLabel('Template').selectOption({ label: 'Space' });
        await press(play.getByRole('button', { name: 'Create' }), touch);
        await expect(page.getByRole('region', { name: 'Screen space' })).toBeVisible();
        const played = await showPlay(page);
        const start = played.getByRole('button', { name: 'Play', exact: true });
        await expect(start).toBeEnabled();
        await press(start, touch);
        await newGame(page, (button) => press(button, touch));
        await expect(game(page).getByRole('application', { name: 'Keep' })).toBeVisible();
        await expect
          .poll(async () =>
            (await stageBuilding(page))?.pieces.map((p) => p.sprite).filter((s) => s.startsWith('room-')),
          )
          .toEqual(['room-crypt', 'room-hall']);
        // Two ladders, each four of its 8-pixel frames up a floor of 32.
        expect((await stageBuilding(page))?.pieces.filter((p) => p.sprite === 'ladder')).toHaveLength(8);
      });

      expect(errors).toEqual([]);
    });
  });
}
