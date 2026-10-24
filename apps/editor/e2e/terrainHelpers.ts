/**
 * What M5.3's specs share (D65): the terrain tools, a terrain added to a space, strokes along the
 * ground by mouse or by one finger through CDP at points the view's hook finds
 * (window.__ebViewport.groundAt), each brush's effect read back through the hook, the chunks' levels
 * and seams it reports from the meshes' buffers, and the terrain's files read from OPFS.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { press, showInspector } from './componentHelpers.ts';
import { stored } from './kitHelpers.ts';
import { add, scenePanel } from './spaceHelpers.ts';

export const FOLDER = 'fell-works';

type Point = { x: number; y: number };
type Summary = {
  size: number;
  chunks: { cx: number; cz: number; lod: number; distance: number }[];
  seams: { mixed: number; gap: number };
  drawn: number;
};
type Hooked = {
  __ebViewport?: {
    terrain(): Summary | null;
    groundAt(x: number, z: number): Point | null;
    heightAt(x: number, z: number): number | null;
    paintAt(x: number, z: number): number[] | null;
    waterAt(id: string): number | null;
  };
};

export const fell = (page: Page) =>
  stored(page, FOLDER, 'spaces/fell.json') as Promise<{ terrain?: unknown; objects: { id: string }[] } | null>;

export const terrainTools = (page: Page): Locator => scenePanel(page).getByRole('group', { name: 'Terrain tools' });

export async function openTerrainTools(page: Page, touch: boolean): Promise<Locator> {
  const tools = terrainTools(page);
  if (!(await tools.isVisible()))
    await press(scenePanel(page).getByRole('button', { name: 'Terrain', exact: true }), touch);
  await expect(tools).toBeVisible();
  return tools;
}

export const summary = (page: Page) =>
  page.evaluate(() => (window as unknown as Hooked).__ebViewport?.terrain() ?? null);
export const heightAt = (page: Page, x: number, z: number) =>
  page.evaluate(([x, z]) => (window as unknown as Hooked).__ebViewport?.heightAt(x, z) ?? null, [x, z] as const);
export const paintAt = (page: Page, x: number, z: number) =>
  page.evaluate(([x, z]) => (window as unknown as Hooked).__ebViewport?.paintAt(x, z) ?? null, [x, z] as const);

/** A terrain of `size` added from the tools: its brushes then shown, and its chunks drawn. */
export async function addTerrain(page: Page, size: number, touch: boolean): Promise<void> {
  const tools = await openTerrainTools(page, touch);
  await tools.getByLabel('Size').selectOption(String(size));
  await press(tools.getByRole('button', { name: 'Add terrain' }), touch);
  await expect(tools.getByRole('button', { name: 'Raise', exact: true })).toBeVisible();
  await expect.poll(async () => (await summary(page))?.size).toBe(size);
}

export async function chooseBrush(page: Page, name: string, touch: boolean): Promise<void> {
  const button = terrainTools(page).getByRole('button', { name, exact: true });
  await press(button, touch);
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

/** A slider in the tools set by its label, as a hand dragging it would leave it. */
export async function setSlider(page: Page, label: string, value: number): Promise<void> {
  await terrainTools(page).getByLabel(label).fill(String(value));
  const shown = terrainTools(page).locator('.terrain-slider').filter({ hasText: label }).locator('output');
  await expect(shown).toHaveText(new RegExp(`^${value}( m)?$`));
}

/** Where the ground at (x, z) is on the page, once the view has it in sight. */
async function groundAt(page: Page, x: number, z: number): Promise<Point> {
  const at = () =>
    page.evaluate(([x, z]) => (window as unknown as Hooked).__ebViewport?.groundAt(x, z) ?? null, [x, z] as const);
  await expect.poll(at, { message: `the ground at (${x}, ${z}) in sight` }).not.toBeNull();
  return (await at()) as Point;
}

/**
 * A stroke over the ground from one point to another, in metres: by the mouse, or by one finger.
 * The page points are found before it starts, as a hand aims at what it sees.
 */
export async function stroke(
  page: Page,
  from: readonly [number, number],
  to: readonly [number, number],
  touch: boolean,
  steps = 12,
): Promise<void> {
  await scenePanel(page).locator('.scene-view').scrollIntoViewIfNeeded();
  const points: Point[] = [];
  for (let k = 0; k <= steps; k++) {
    points.push(
      await groundAt(page, from[0] + ((to[0] - from[0]) * k) / steps, from[1] + ((to[1] - from[1]) * k) / steps),
    );
  }
  const [first, ...rest] = points as [Point, ...Point[]];
  if (!touch) {
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    for (const p of rest) await page.mouse.move(p.x, p.y);
    await page.mouse.up();
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
  for (const p of rest) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Two fingers closing from `from` pixels apart to `to`: a pinch that takes the camera that many times further off. */
export async function pinchIn(page: Page, from: number, to: number): Promise<void> {
  const box = await scenePanel(page).locator('.scene-view').boundingBox();
  if (!box) throw new Error('No view to pinch');
  const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
  const at = (gap: number) => [
    { x: cx - gap / 2, y: cy, id: 1 },
    { x: cx + gap / 2, y: cy, id: 2 },
  ];
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(from) });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(from + ((to - from) * i) / 10) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** The last step of undo, by its label. */
export async function expectLastStep(page: Page, label: string): Promise<void> {
  await expect(page.getByRole('button', { name: `Undo: ${label}` })).toBeAttached();
}

/**
 * Each brush in turn near the space's origin, where the camera starts: Raise a ridge, Lower a
 * trench beside it, Smooth the ridge's middle, Flatten from the ridge across the trench. Each
 * stroke is one step of undo, and each moves the ground as it says.
 */
export async function sculpt(page: Page, touch: boolean): Promise<void> {
  await chooseBrush(page, 'Raise', touch);
  await setSlider(page, 'Strength', 1);
  await stroke(page, [-3, -2], [3, -2], touch);
  await expect.poll(() => heightAt(page, 0, -2)).toBeGreaterThan(0.5);
  await expectLastStep(page, 'Raise the terrain');

  await chooseBrush(page, 'Lower', touch);
  await stroke(page, [-3, 2], [3, 2], touch);
  await expect.poll(() => heightAt(page, 0, 2)).toBeLessThan(-0.5);
  await expectLastStep(page, 'Lower the terrain');

  const ridge = (await heightAt(page, 0, -2)) as number;
  await chooseBrush(page, 'Smooth', touch);
  await stroke(page, [-1, -2], [1, -2], touch, 6);
  await expect.poll(() => heightAt(page, 0, -2)).toBeLessThan(ridge - 0.01);
  await expectLastStep(page, 'Smooth the terrain');

  const trench = (await heightAt(page, 0, 2)) as number;
  await chooseBrush(page, 'Flatten', touch);
  await stroke(page, [0, -2], [0, 2], touch);
  await expect.poll(() => heightAt(page, 0, 2)).toBeGreaterThan(trench + 0.1);
  await expectLastStep(page, 'Flatten the terrain');
}

/** Each layer painted at its own spot with a small brush: Rock in a line, then Grass, Sand and Snow. */
export const SPOTS = { Rock: [-1, 3], Grass: [-2.5, 0], Sand: [0, 0], Snow: [2.5, 0] } as const;

export async function paint(page: Page, touch: boolean): Promise<void> {
  await chooseBrush(page, 'Paint', touch);
  await setSlider(page, 'Radius', 1);
  await setSlider(page, 'Strength', 1);
  const layers = ['Grass', 'Rock', 'Sand', 'Snow'] as const;
  // Grass is everywhere at first: its spot is painted Rock first, so painting it Grass again shows.
  await terrainTools(page).getByLabel('Layer').selectOption({ label: 'Rock' });
  await stroke(page, [-2, 3], [0, 3], touch, 6);
  await stroke(page, [-2.5, -0.5], [-2.5, 0.5], touch, 2);
  await expect.poll(async () => (await paintAt(page, ...SPOTS.Grass))?.[1]).toBeGreaterThan(200);
  for (const name of ['Grass', 'Sand', 'Snow'] as const) {
    await terrainTools(page).getByLabel('Layer').selectOption({ label: name });
    const [x, z] = SPOTS[name];
    await stroke(page, [x, z - 0.5], [x, z + 0.5], touch, 2);
    await expectLastStep(page, `Paint ${name}`);
  }
  for (const name of layers) {
    const k = layers.indexOf(name);
    const [x, z] = SPOTS[name];
    await expect.poll(async () => (await paintAt(page, x, z))?.[k], { message: name }).toBeGreaterThan(200);
  }
}

/** A plane added and given water in the inspector. */
export async function addWater(page: Page, touch: boolean): Promise<void> {
  await chooseBrush(page, 'Camera', touch);
  await add(page, 'Plane');
  const form = await showInspector(page, touch);
  await form.getByLabel('Add a component').selectOption({ label: 'Water' });
  await expect
    .poll(async () => (await fell(page))?.objects)
    .toMatchObject([{ id: 'plane', components: { water: {} } }]);
  // Drawn see-through: its clarity left out, 0.6, its opacity the rest.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Hooked).__ebViewport?.waterAt('plane') ?? null))
    .toBeCloseTo(0.4, 5);
}

/** The view draws the grid as it is now: after an undo, the chunks it reached drawn again. */
export async function expectDrawn(page: Page): Promise<void> {
  await expect.poll(async () => (await summary(page))?.drawn ?? 1).toBeLessThan(1e-4);
}

/**
 * Finer chunks near the camera than far, with no crack where two levels meet: zoomed out over the
 * sculpted ground until its seams join chunks of different levels, read from the meshes' buffers.
 */
export async function expectLevels(page: Page): Promise<void> {
  await expect
    .poll(async () => {
      const s = await summary(page);
      if (!s) return 'no terrain';
      const sorted = [...s.chunks].sort((a, b) => a.distance - b.distance);
      const rising = sorted.every((c, k) => k === 0 || c.lod >= (sorted[k - 1] as { lod: number }).lod);
      const finer = (sorted[0]?.lod ?? 0) < (sorted.at(-1)?.lod ?? 0);
      return { rising, finer, mixed: s.seams.mixed > 0 };
    })
    .toEqual({ rising: true, finer: true, mixed: true });
  expect((await summary(page))?.seams.gap).toBeLessThan(1e-4);
  await expectDrawn(page);
}

/** What a reload must give back: the space's file, both PNGs' bytes hashed, and the hook's readings at each spot. */
export async function keptState(page: Page) {
  const hashes = await page.evaluate(async (folder) => {
    const out: Record<string, string> = {};
    let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('projects');
    dir = await (await dir.getDirectoryHandle(folder)).getDirectoryHandle('spaces');
    for (const name of ['fell.heights.png', 'fell.paint.png']) {
      const bytes = await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer();
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      out[name] = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return out;
  }, FOLDER);
  const heights = await Promise.all(
    [
      [0, -2],
      [0, 2],
      [0, 0],
    ].map(([x, z]) => heightAt(page, x as number, z as number)),
  );
  const paints = await Promise.all(Object.values(SPOTS).map(([x, z]) => paintAt(page, x, z)));
  return { file: await fell(page), hashes, heights, paints };
}
