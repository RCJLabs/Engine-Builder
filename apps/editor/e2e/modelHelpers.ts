/**
 * What M5.5's gate shares by mouse and keys and by touch (D67): the three models made in Node as
 * other tools write them (the hills in Draco, the crate in Meshopt, a sign whose texture is a
 * KTX2), imported in one pick; a material from a preset on the crate's slot; a LOD level and a
 * sphere fitted to the crate; each placed in a space; read back through window.__ebViewport.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { crateModel, glbOf, gridModel, signModel } from '../../../packages/models/test/shapes.ts';
import { press, showInspector } from './componentHelpers.ts';
import { newRecord, stored, storedText } from './kitHelpers.ts';
import { openRecord, showAssets } from './ludus.ts';
import { camera, scenePanel } from './spaceHelpers.ts';

export const FOLDER = 'model-works';

export interface ModelSummary {
  readonly object: string;
  readonly model: string;
  readonly level: number;
  readonly levels: number;
  readonly triangles: number;
  readonly collider: { readonly shape: string } | null;
  readonly materials: Readonly<Record<string, string>>;
  readonly textures: number;
  readonly wire: boolean;
}

/** The view's models, by the model each draws. */
export const models = (page: Page): Promise<Record<string, ModelSummary>> =>
  page.evaluate(() => {
    const hook = (window as { __ebViewport?: { models?: () => ModelSummary[] } }).__ebViewport;
    return Object.fromEntries((hook?.models?.() ?? []).map((m) => [m.model, m]));
  });

export const record = (page: Page, id: string) => stored(page, FOLDER, `records/model/${id}.json`);

/**
 * What a reload must find written: the yard's four placements, the pine's record and its file. A
 * reload while the starter kit's save still runs would lose it, which is the editor's to say, not
 * the view's (M5.8: on CI the pine was missing after the reload, which no run here repeats).
 */
export async function expectStored(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const yard = (await stored(page, FOLDER, 'spaces/yard.json')) as { objects?: { record?: string }[] } | null;
        return (yard?.objects ?? []).flatMap((o) => (o.record ? [o.record] : [])).sort();
      },
      { timeout: 20_000 },
    )
    .toEqual(['model:crate', 'model:hills', 'model:kit-pine', 'model:sign']);
  expect(await record(page, 'kit-pine')).toMatchObject({ file: 'starter-kit/pine.glb' });
  expect(await storedText(page, FOLDER, 'assets/starter-kit/pine.glb')).not.toBeNull();
}

/** The three files, as the gate imports them. */
export async function modelFiles() {
  const file = async (name: string, bytes: Promise<Uint8Array>) => ({
    name,
    mimeType: 'model/gltf-binary',
    buffer: Buffer.from(await bytes),
  });
  return Promise.all([
    file('hills.glb', glbOf(gridModel(), 'draco')),
    file('crate.glb', glbOf(crateModel(), 'meshopt')),
    file('sign.glb', glbOf(signModel())),
  ]);
}

/** The three imported with one provenance: each packed, each with a record. */
export async function importModels(page: Page, touch: boolean): Promise<void> {
  const panel = await showAssets(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    press(panel.getByRole('button', { name: 'Import files' }), touch),
  ]);
  await chooser.setFiles(await modelFiles());
  const form = panel.getByRole('region', { name: /^Import / });
  await expect(form).toContainText('assets/models/hills.glb');
  await expect(form.getByLabel('Make a model record for each, with a box collider')).toBeChecked();
  await form.getByLabel('Licence').selectOption('CC0-1.0');
  await form.getByLabel('Where it came from').fill('Made in Node for the gate');
  await press(form.getByRole('button', { name: 'Import 3 files' }), touch);
  await expect(form).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(() => record(page, 'sign')).toMatchObject({ file: 'models/sign.glb' });
  // The hills have 2,048 triangles, so they start with LOD; the crate's 24 don't.
  expect(await record(page, 'hills')).toMatchObject({ lod: [{ ratio: 0.5 }, { ratio: 0.25 }, { ratio: 0.1 }] });
  expect(await record(page, 'crate')).not.toHaveProperty('lod');
}

/** A material from the Wood preset, named Bark. */
export async function makeBark(page: Page): Promise<void> {
  const bark = await newRecord(page, 'material', 'Material', 'Bark');
  await bark.getByLabel('Start from').selectOption('wood');
  await expect
    .poll(() => stored(page, FOLDER, 'records/material/bark.json'))
    .toEqual({ name: 'Bark', color: '#8a5a35', roughness: 0.8, metalness: 0 });
}

/** The crate's wood drawn as Bark, a LOD level made, and a sphere fitted to it. */
export async function shapeCrate(page: Page, touch: boolean): Promise<Locator> {
  await openRecord(page, 'Model', 'crate');
  const crate = (await showInspector(page, touch)).getByRole('region', { name: 'Model crate' });
  await crate.getByLabel('Slot wood').selectOption('bark');
  await press(crate.getByRole('button', { name: 'Add to LOD levels' }), touch);
  await crate.getByLabel('Keeps', { exact: true }).last().fill('0.5');
  await crate.getByLabel('From, in metres', { exact: true }).last().fill('20');
  await press(crate.getByRole('button', { name: 'Sphere', exact: true }), touch);
  await expect
    .poll(() => record(page, 'crate'))
    .toMatchObject({
      materials: [{ slot: 'wood', material: 'bark' }],
      lod: [{ ratio: 0.5, from: 20 }],
      collider: { shape: 'sphere' },
    });
  return crate;
}

/** Add → Model…, and the model named. */
export async function placeModel(page: Page, name: RegExp, touch: boolean): Promise<void> {
  await press(scenePanel(page).getByRole('button', { name: 'Add', exact: true }), touch);
  await press(scenePanel(page).getByRole('button', { name: 'Model…' }), touch);
  await press(page.getByRole('dialog', { name: 'Place a model' }).getByRole('option', { name }).first(), touch);
}

/** What the gate reads back of the three, wherever the camera is. */
export async function expectDrawn(page: Page): Promise<void> {
  await expect
    .poll(async () => Object.keys(await models(page)).sort(), { timeout: 20_000 })
    .toEqual(expect.arrayContaining(['crate', 'hills', 'sign']));
  const drawn = await models(page);
  expect(drawn.hills).toMatchObject({ levels: 4, collider: { shape: 'box' }, materials: { turf: '#95cb7c' } });
  expect(drawn.crate).toMatchObject({ levels: 2, collider: { shape: 'sphere' }, materials: { wood: '#8a5a35' } });
  expect(drawn.sign).toMatchObject({ levels: 1, triangles: 2, textures: 1 });
}

/**
 * Two fingers on the part of the view the page shows, spreading (`apart`, zooming in) or closing
 * (zooming out). On a phone the view can run past the screen's edge, so its middle may not be seen.
 */
export async function pinch(page: Page, apart: boolean): Promise<void> {
  const view = scenePanel(page).locator('.scene-view');
  await view.scrollIntoViewIfNeeded();
  const box = await view.boundingBox();
  const height = page.viewportSize()?.height ?? 0;
  if (!box) throw new Error('No view to pinch');
  const top = Math.max(box.y, 0);
  const bottom = Math.min(box.y + box.height, height);
  const [cx, cy] = [box.x + box.width / 2, (top + bottom) / 2];
  const cdp = await page.context().newCDPSession(page);
  const at = (gap: number) => [
    { x: cx - gap, y: cy, id: 1 },
    { x: cx + gap, y: cy, id: 2 },
  ];
  const gaps = Array.from({ length: 9 }, (_, i) => (apart ? 20 + i * 8 : 84 - i * 8));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(gaps[0] as number) });
  for (const gap of gaps.slice(1))
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(gap) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  // A finger lifted straight after a gesture loses the next tap (spaceHelpers.ts's dragTouch).
  await page.waitForTimeout(250);
}

/** Two of the page's frames gone by: the view draws on the next one after a change, and its LOD levels are picked as it draws. */
const drawn = (page: Page) =>
  page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

/** The camera a step nearer or farther, drawn: + or − on the view's keys, a pinch by touch. */
async function zoom(page: Page, nearer: boolean, touch: boolean): Promise<void> {
  if (touch) await pinch(page, nearer);
  else {
    await scenePanel(page).locator('.scene-view').focus();
    await page.keyboard.press(nearer ? 'Equal' : 'Minus');
  }
  await drawn(page);
}

/**
 * The hills drawn whole near and cut far: framed and brought in under 15 m of their origin, where
 * every triangle is drawn, then taken back past 60 m, where the last level, a tenth of them, is.
 * Returns the triangles read each way.
 */
export async function nearAndFar(page: Page, touch: boolean): Promise<{ near: number; far: number }> {
  await press(scenePanel(page).getByRole('button', { name: 'Frame' }), touch);
  await drawn(page);
  for (let i = 0; i < 10 && (await models(page)).hills?.level !== 0; i++) await zoom(page, true, touch);
  await expect.poll(async () => (await models(page)).hills?.level).toBe(0);
  const near = (await models(page)).hills?.triangles ?? 0;
  for (let i = 0; i < 30 && (await camera(page)).distance < 90; i++) await zoom(page, false, touch);
  await expect.poll(async () => (await models(page)).hills?.level).toBe(3);
  return { near, far: (await models(page)).hills?.triangles ?? 0 };
}

/** The starter kit added in the Assets panel, and its pine placed. */
export async function addKit(page: Page, touch: boolean): Promise<void> {
  const panel = await showAssets(page);
  await press(panel.getByRole('button', { name: 'Add starter kit' }), touch);
  await expect.poll(() => record(page, 'kit-pine')).toMatchObject({ name: 'Pine', file: 'starter-kit/pine.glb' });
}

/** The collider's wire drawn on the model chosen, and on no other. */
export async function expectWireOn(page: Page, chosen: string): Promise<void> {
  await expect
    .poll(async () =>
      Object.values(await models(page))
        .filter((m) => m.wire)
        .map((m) => m.model),
    )
    .toEqual([chosen]);
}
