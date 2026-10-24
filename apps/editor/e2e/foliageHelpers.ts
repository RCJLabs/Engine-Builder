/**
 * What M5.6's specs share (D68): the starter kit added; a glade's 129-vertex terrain with Rock
 * painted at a spot of its own; Trees and Grass made new in the terrain's form; trees planted in a
 * stroke and cleared across part of it; grass filled from the Grass layer; all of it read back
 * through window.__ebViewport's foliage() and plantsNear(), and the files from OPFS.
 */
import { expect, type Page } from '@playwright/test';
import { press, showInspector } from './componentHelpers.ts';
import { stored } from './kitHelpers.ts';
import { showAssets } from './ludus.ts';
import { camera, scenePanel, showScene } from './spaceHelpers.ts';
import { lowerSheet } from './templateHelpers.ts';
import {
  chooseBrush,
  expectLastStep,
  openTerrainTools,
  paintAt,
  setSlider,
  stroke,
  terrainTools,
} from './terrainHelpers.ts';

export const FOLDER = 'grove-works';
export const TREES = 'glade-trees';
export const GRASS = 'glade-grass';

export interface FoliageSummary {
  readonly foliage: string;
  readonly model: string | null;
  readonly plants: number;
  readonly drawn: number;
  readonly capped: boolean;
  readonly chunks: readonly { at: [number, number]; plants: number; level: number; distance: number }[];
}

type Hooked = {
  __ebViewport?: {
    foliage(): FoliageSummary[];
    plantsNear(foliage: string, x: number, z: number, radius: number): number;
  };
};

/** The view's foliage, by type. */
export const foliage = (page: Page): Promise<Record<string, FoliageSummary>> =>
  page.evaluate(() =>
    Object.fromEntries(((window as unknown as Hooked).__ebViewport?.foliage() ?? []).map((f) => [f.foliage, f])),
  );

export const near = (page: Page, id: string, x: number, z: number, radius: number) =>
  page.evaluate(
    ([id, x, z, radius]) => (window as unknown as Hooked).__ebViewport?.plantsNear(id, x, z, radius) ?? null,
    [id, x, z, radius] as const,
  );

export const glade = (page: Page) =>
  stored(page, FOLDER, 'spaces/glade.json') as Promise<{ terrain?: { foliage?: string[] } } | null>;

/** Rock's spot, painted before any foliage, so Grass's fill leaves it bare. */
export const ROCK = [0, -4] as const;
/** The trees' row, along z = 8, and the clearing across its middle. */
const ROW = { from: [-16, 8], to: [16, 8] } as const;
const CLEARING = { from: [0, 0], to: [0, 16] } as const;

/** The starter kit added in the Assets panel: its pine and its grass among the models. */
export async function addKit(page: Page, touch: boolean): Promise<void> {
  const panel = await showAssets(page);
  await press(panel.getByRole('button', { name: 'Add starter kit' }), touch);
  await expect
    .poll(() => stored(page, FOLDER, 'records/model/kit-grass.json'))
    .toMatchObject({ name: 'Grass', file: 'starter-kit/grass.glb' });
}

/** Rock painted at its spot with a brush 3 m across, at full strength. */
export async function paintRock(page: Page, touch: boolean): Promise<void> {
  await chooseBrush(page, 'Paint', touch);
  await terrainTools(page).getByLabel('Layer').selectOption({ label: 'Rock' });
  await setSlider(page, 'Radius', 3);
  await setSlider(page, 'Strength', 1);
  const [x, z] = ROCK;
  await stroke(page, [x, z - 0.5], [x, z + 0.5], touch, 4);
  await expect.poll(async () => (await paintAt(page, x, z))?.[1]).toBeGreaterThan(250);
}

/** New foliage from Trees and from Grass in the terrain's form: the kit's pine and grass, listed in that order. */
export async function newFoliage(page: Page, touch: boolean): Promise<void> {
  await press(terrainTools(page).getByRole('button', { name: 'Terrain settings' }), touch);
  const form = await showInspector(page, touch);
  await expect(form.getByRole('heading', { name: 'Foliage' })).toBeVisible();
  await form.getByLabel('New foliage from').selectOption('trees');
  await expect.poll(async () => (await glade(page))?.terrain?.foliage).toEqual([TREES]);
  await form.getByLabel('New foliage from').selectOption('grass');
  await expect.poll(async () => (await glade(page))?.terrain?.foliage).toEqual([TREES, GRASS]);
  expect(await stored(page, FOLDER, `records/foliage/${TREES}.json`)).toMatchObject({
    name: 'Glade, trees',
    model: 'kit-pine',
    density: 2,
  });
  expect(await stored(page, FOLDER, `records/foliage/${GRASS}.json`)).toMatchObject({
    name: 'Glade, grass',
    model: 'kit-grass',
    density: 150,
  });
  await expect(form.getByRole('button', { name: 'Open Glade, trees' })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Remove Glade, grass' })).toBeVisible();
}

/**
 * The Scene panel in sight again with its terrain row: the sheet lowered on a phone upright. A
 * phone shows the panel again from More, which starts its view afresh, so only when it is put away.
 */
export async function seeScene(page: Page, touch: boolean): Promise<void> {
  if (touch) await lowerSheet(page);
  if (!(await view(page).isVisible())) await showScene(page);
  await openTerrainTools(page, touch);
}

const treesNearRow = (page: Page) => near(page, TREES, 0, 8, 30);

/**
 * Trees planted along the row with a wide brush, from far enough off (`zoomOut`) to see all of it,
 * then cleared across its middle: fewer trees, more than none, and an undo puts every one back.
 * Returns how many the row holds.
 */
export async function plantAndClear(page: Page, touch: boolean, zoomOut: () => Promise<void>): Promise<number> {
  await seeScene(page, touch);
  await zoomOut();
  await chooseBrush(page, 'Plant', touch);
  await terrainTools(page).getByLabel('Foliage').selectOption({ label: 'Glade, trees' });
  await setSlider(page, 'Radius', 10);
  await setSlider(page, 'Strength', 1);
  await stroke(page, ROW.from, ROW.to, touch, 16);
  await expectLastStep(page, 'Plant Glade, trees');
  await expect.poll(() => treesNearRow(page)).toBeGreaterThan(10);
  const planted = (await treesNearRow(page)) as number;

  await chooseBrush(page, 'Clear', touch);
  await setSlider(page, 'Radius', 5);
  await stroke(page, CLEARING.from, CLEARING.to, touch, 8);
  await expectLastStep(page, 'Clear Glade, trees');
  await expect.poll(() => treesNearRow(page)).toBeLessThan(planted);
  expect(await treesNearRow(page)).toBeGreaterThan(0);

  await press(page.getByRole('button', { name: 'Undo: Clear Glade, trees' }), touch);
  await expect.poll(() => treesNearRow(page)).toBe(planted);
  return planted;
}

/** Grass filled where the Grass layer is: grass on open ground, none at the Rock. */
export async function fillGrass(page: Page, touch: boolean): Promise<void> {
  await chooseBrush(page, 'Plant', touch);
  await terrainTools(page).getByLabel('Foliage').selectOption({ label: 'Glade, grass' });
  await terrainTools(page).getByLabel('Fill').selectOption({ label: 'Where Grass is' });
  await expectLastStep(page, 'Fill Glade, grass from Grass');
  await expect.poll(() => near(page, GRASS, 20, 20, 3)).toBeGreaterThan(10);
  expect(await near(page, GRASS, ROCK[0], ROCK[1], 0.75)).toBe(0);
}

/** Each type's chunk nearest the camera that has plants, and its level. */
const nearestLevel = (f: FoliageSummary | undefined) =>
  [...(f?.chunks ?? [])].filter((c) => c.plants > 0).sort((a, b) => a.distance - b.distance)[0]?.level;

/**
 * Near the trees, their nearest chunk drawn at its model's first level. Zoomed out until the
 * camera is past the grass's 60 m from every chunk: no grass drawn, but every plant still
 * scattered, and every tree still drawn (out to its 400 m).
 */
export async function nearAndFar(page: Page, zoomOut: () => Promise<void>): Promise<void> {
  await expect.poll(async () => nearestLevel((await foliage(page))[TREES])).toBe(0);
  const scattered = (await foliage(page))[GRASS]?.plants ?? 0;
  expect(scattered).toBeGreaterThan(10_000);
  await expect.poll(async () => (await foliage(page))[GRASS]?.drawn).toBeGreaterThan(0);
  for (let i = 0; i < 20 && (await camera(page)).distance < 150; i++) await zoomOut();
  expect((await camera(page)).distance).toBeGreaterThanOrEqual(150);
  await expect
    .poll(async () => {
      const now = await foliage(page);
      return {
        grassDrawn: now[GRASS]?.drawn,
        grassScattered: now[GRASS]?.plants,
        grassLevels: [...new Set(now[GRASS]?.chunks.map((c) => c.level))],
        treesDrawn: now[TREES]?.drawn === now[TREES]?.plants,
      };
    })
    .toEqual({ grassDrawn: 0, grassScattered: scattered, grassLevels: [-1], treesDrawn: true });
}

/** What a reload must give back: the terrain's list, the density file's bytes hashed, both records, and the plants. */
export async function keptState(page: Page) {
  const hash = await page.evaluate(async (folder) => {
    let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('projects');
    dir = await (await dir.getDirectoryHandle(folder)).getDirectoryHandle('spaces');
    const bytes = await (await (await dir.getFileHandle('glade.foliage.png')).getFile()).arrayBuffer();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
  }, FOLDER);
  const plants = Object.values(await foliage(page)).map((f) => ({
    foliage: f.foliage,
    model: f.model,
    plants: f.plants,
    capped: f.capped,
    chunks: f.chunks.map((c) => c.plants),
  }));
  return {
    listed: (await glade(page))?.terrain?.foliage,
    hash,
    records: await Promise.all([TREES, GRASS].map((id) => stored(page, FOLDER, `records/foliage/${id}.json`))),
    plants,
    row: await treesNearRow(page),
  };
}

export const view = (page: Page) => scenePanel(page).locator('.scene-view');
