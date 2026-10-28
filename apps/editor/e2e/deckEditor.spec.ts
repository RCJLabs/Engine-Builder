/**
 * M7.2's editor gate (D84, docs/specs/tilemaps.md#the-gate): a deck built from the starter tileset in
 * the Scene panel alone, by mouse and keys at 1280 and by touch at 390. From a new project: the
 * starter sprites added; a 2D space; Add → Tilemap… of the deck's tileset, 11 by 5; floor painted by a
 * drag along a row; a wall and a door set on two cells' sides; Space-Wrecked's example ship imported
 * as text, its tiles and edges; the rules shown; a walker placed by Add → Record…; and, with a game
 * started and a Space screen, played, the stage drawing the ship's tiles. Untested for feel.
 */
import { expect, type Page, test } from '@playwright/test';
import { hands } from './campHelpers.ts';
import { watchErrors } from './checks.ts';
import { press } from './componentHelpers.ts';
import { tilemap as stageTilemap } from './deckHelpers.ts';
import { choose } from './hutHelpers.ts';
import { expectFits, game, newGame, showPlay } from './hutScreens.ts';
import { showPanel } from './keepEditorHelpers.ts';
import { createProject, kitsBox, newRecord, stored } from './kitHelpers.ts';
import { showAssets, showProject } from './ludus.ts';
import { showScene } from './spaceHelpers.ts';

const FOLDER = 'deck-build';
type Box = { x: number; y: number; w: number; h: number };

/** Space-Wrecked's example ship, as its battle map prints it (tests/golden/example-ship.map.txt). */
const SHIP = [
  '      +=+=+=+=+=+=+',
  '      Ih h ./. . .I',
  '  +=+=+     +     +=+=+',
  '  I# ./. . .|. # ./. cI',
  '  +   +-+/+-+     +   +',
  '  I# ./. . ./. . .|. .I',
  '  +/+-+/+-+/+/+/+=+   +',
  '  I# ./H ./a a/cI%I. cI',
  '  +   +=+=+o+=+=+ +=+=+',
  '  I# .I',
  '  +=+=+',
];

interface MapSeen {
  readonly id: string;
  readonly size: readonly [number, number];
  readonly layers: readonly { id: string; rows: readonly string[] }[];
  readonly edges?: readonly string[];
}

async function chosenMap(page: Page): Promise<MapSeen | undefined> {
  // biome-ignore lint/suspicious/noExplicitAny: the view's own hook, read as it is
  return page.evaluate(() => (window as any).__ebView2d?.tilemap());
}

async function frames(page: Page): Promise<number> {
  // biome-ignore lint/suspicious/noExplicitAny: the view's own hook, read as it is
  return page.evaluate(() => (window as any).__ebView2d?.frames() ?? 0);
}

/** The tilemap's box on the page, once drawn, the view scrolled into sight first: the Tiles row stands above it. */
async function mapBox(page: Page): Promise<Box> {
  await page.getByRole('application', { name: /^Hold: / }).scrollIntoViewIfNeeded();
  let box: Box | undefined;
  await expect
    .poll(async () => {
      box = await page.evaluate(
        // biome-ignore lint/suspicious/noExplicitAny: the view's own hook, read as it is
        () => (window as any).__ebView2d?.drawn().find((d: { path: string }) => d.path === 'tilemap')?.page,
      );
      return box !== undefined;
    })
    .toBe(true);
  return box as Box;
}

/** A point on the page inside cell (c, r) of an 11 by 5 map, `fx` and `fy` across it from its top-left. */
const cellPoint = (box: Box, c: number, r: number, fx = 0.5, fy = 0.5): [number, number] => [
  box.x + ((c + fx) * box.w) / 11,
  box.y + ((r + fy) * box.h) / 5,
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
  test.describe(`a tilemap in the editor, ${viewport.width} wide`, () => {
    test.use({ viewport, ...(touch ? { hasTouch: true, isMobile: true } : {}), actionTimeout: 20_000 });

    test('a deck painted, walled, imported from Space-Wrecked’s text, a walker placed, and played', async ({
      page,
    }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      await createProject(page, 'Deck build');
      const assets = await showAssets(page);
      await press(assets.getByRole('button', { name: 'Add starter sprites' }), touch);
      await expect.poll(() => stored(page, FOLDER, 'records/tileset/deck.json')).toMatchObject({ name: 'Deck' });

      const panel = await showScene(page);
      await press(panel.getByRole('button', { name: 'New 2D space' }), touch);
      await panel.getByLabel('Name of the new 2D space').fill('Hold');
      await press(panel.getByRole('button', { name: 'Create' }), touch);
      await expect
        .poll(() => stored(page, FOLDER, 'spaces/hold.json'))
        .toEqual({ name: 'Hold', view: '2d', objects: [] });
      await expect.poll(() => frames(page)).toBeGreaterThan(0);

      await test.step('Add → Tilemap… of the deck’s tileset, 11 by 5, centred and chosen', async () => {
        await press(panel.getByRole('button', { name: 'Add', exact: true }), touch);
        await press(panel.getByRole('button', { name: 'Tilemap…' }), touch);
        await press(
          page.getByRole('dialog', { name: 'A tilemap’s tileset' }).getByRole('option', { name: /^Deck/ }),
          touch,
        );
        await panel.getByLabel('Columns').fill('11');
        await panel.getByLabel('Rows').fill('5');
        await press(panel.getByRole('button', { name: 'Add tilemap' }), touch);
        await expect
          .poll(() => chosenMap(page))
          .toMatchObject({ id: 'tilemap', size: [11, 5], layers: [{ id: 'floor', rows: [] }] });
        // Each of the deck's seven tiles a button drawn with its frame, from the sheet the view decoded.
        await expect(panel.locator('.tile-button canvas')).toHaveCount(7);
        await expect(panel.locator('[data-tile="hull"] canvas')).toHaveAttribute('data-frame', '32');
        // Centred on the view's middle, 160 by 90 in a new space: its corner 88 and 40 less.
        await expect
          .poll(
            async () =>
              ((await stored(page, FOLDER, 'spaces/hold.json')) as { objects: { at: number[] }[] } | null)?.objects[0]
                ?.at,
          )
          .toEqual([72, 50, 0]);
        await expectFits(page);
      });

      await test.step('floor painted by a drag along a row, one step of undo', async () => {
        await press(panel.getByRole('button', { name: /^floor/ }), touch);
        await expect(panel.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'true');
        const box = await mapBox(page);
        await stroke(page, cellPoint(box, 1, 1), cellPoint(box, 5, 1), touch);
        await expect.poll(async () => (await chosenMap(page))?.layers[0]?.rows).toEqual(['', ' .....']);
        if (!touch) {
          await page.keyboard.press('Control+z');
          await expect.poll(async () => (await chosenMap(page))?.layers[0]?.rows).toEqual([]);
          await page.keyboard.press('Control+Shift+Z');
          await expect.poll(async () => (await chosenMap(page))?.layers[0]?.rows).toEqual(['', ' .....']);
        }
      });

      await test.step('a wall and a door set on two cells’ east sides', async () => {
        await press(panel.getByRole('button', { name: 'Edges' }), touch);
        await panel.getByLabel('Edge', { exact: true }).selectOption('wall');
        const box = await mapBox(page);
        const at = cellPoint(box, 2, 1, 0.94);
        await stroke(page, at, at, touch);
        await panel.getByLabel('Edge', { exact: true }).selectOption('door');
        const door = cellPoint(box, 4, 1, 0.94);
        await stroke(page, door, door, touch);
        // Tile row 1 of the edges: a tile's west edge at column 2c, so (2, 1)'s east is at 6 and (4, 1)'s at 10.
        await expect.poll(async () => (await chosenMap(page))?.edges?.[3]?.slice(6, 11)).toBe('|   /');
      });

      await test.step('Space-Wrecked’s example ship imported as text, its tiles and its edges', async () => {
        await press(panel.getByRole('button', { name: 'Import ASCII…' }), touch);
        await panel.getByLabel(/^Paste a map/).fill(['', ...SHIP, ''].join('\n'));
        await press(panel.getByRole('button', { name: 'Import', exact: true }), touch);
        await expect
          .poll(async () => (await chosenMap(page))?.layers[0]?.rows)
          .toEqual(['   hh....', ' #.....#..c', ' #.........', ' #.H.aac%.c', ' #.']);
        const map = await chosenMap(page);
        expect(map?.size).toEqual([11, 5]);
        expect(map?.edges?.[0]).toBe('      +=+=+=+=+=+=+    ');
        expect(map?.edges?.[8]?.[11]).toBe('o');
      });

      await test.step('the rules shown over the map', async () => {
        const before = await frames(page);
        await press(panel.getByRole('button', { name: 'Show rules' }), touch);
        await expect(panel.getByRole('button', { name: 'Show rules' })).toHaveAttribute('aria-pressed', 'true');
        await expect.poll(() => frames(page)).toBeGreaterThan(before);
        await expectFits(page);
      });

      await test.step('a walker made with forms and placed by Add → Record…, on the deck', async () => {
        await press(panel.getByRole('button', { name: 'Edges' }), touch);
        await showProject(page);
        await kitsBox(page).getByLabel('Stats', { exact: true }).check();
        const ines = await newRecord(page, 'actor', 'Actor', 'Ines');
        await choose(ines, /^Sprite/, 'Choose a sprite', 'Figure (keeper) (figure-keeper)');
        await expect
          .poll(() => stored(page, FOLDER, 'records/actor/ines.json'))
          .toMatchObject({ sprite: 'figure-keeper' });
        const scene = await showPanel(page, 'Scene', touch);
        await press(scene.getByRole('button', { name: 'Add', exact: true }), touch);
        await press(scene.getByRole('button', { name: 'Record…' }), touch);
        await press(page.getByRole('dialog', { name: 'Place a record' }).getByRole('option', { name: /Ines/ }), touch);
        await expect
          .poll(async () =>
            (
              (await stored(page, FOLDER, 'spaces/hold.json')) as { objects: { id: string; record?: string }[] } | null
            )?.objects.find((o) => o.record === 'actor:ines'),
          )
          .toBeDefined();
      });

      await test.step('played: a game started, a Space screen, the ship’s tiles drawn by the stage', async () => {
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
        await expect(game(page).getByRole('application', { name: 'Hold' })).toBeVisible();
        await expect.poll(async () => (await stageTilemap(page))?.size).toEqual([11, 5]);
        const drawn = await stageTilemap(page);
        // The engine room's machinery down column 1, joined as its mask says.
        expect([1, 2, 3, 4].map((r) => drawn?.frames[0]?.[r]?.[1])).toEqual([20, 21, 21, 17]);
      });

      expect(errors).toEqual([]);
    });
  });
}
