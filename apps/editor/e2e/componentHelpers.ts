/**
 * What M5.2's specs share (D64): the lodge built from an empty project, by mouse or by touch. A
 * keeper type and Greta, made with forms; a kind of the project's own, Hold, made in the type
 * designer; a lamp prefab, a box with a light and a hold; and a yard that places the lamp and
 * Greta. Each step lands as the files say, read back from OPFS.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { stored } from './kitHelpers.ts';
import { showRecords } from './ludus.ts';
import { add, newSpaceFile, objectAt, outlinerRow, scenePanel, showScene } from './spaceHelpers.ts';
import { lowerSheet } from './templateHelpers.ts';

export const FOLDER = 'lodge-works';

export type Obj = {
  id: string;
  prefab?: string;
  record?: string;
  shape?: string;
  components?: Record<string, Record<string, unknown>>;
  overrides?: Record<string, unknown>;
};
export type SpaceFile = { name: string; objects: Obj[] };

export const yard = (page: Page) => stored(page, FOLDER, 'spaces/yard.json') as Promise<SpaceFile | null>;
export const lamp = (page: Page) => stored(page, FOLDER, 'prefabs/lamp.json') as Promise<SpaceFile | null>;
export const object = async (page: Page, id: string) => (await yard(page))?.objects.find((o) => o.id === id);

export const press = (target: Locator, touch: boolean) => (touch ? target.tap() : target.click());

export const inspector = (page: Page): Locator => page.locator('[data-panel="inspector"]');

/** The inspector: docked on desktop, the sheet's tab on a phone upright, a tab of its own sideways. */
export async function showInspector(page: Page, touch: boolean): Promise<Locator> {
  const handle = page.locator('.sheet-handle');
  if ((await handle.isVisible()) && (await handle.getAttribute('aria-expanded')) === 'false') await handle.tap();
  const tab = page.getByRole('tab', { name: 'Inspector', exact: true });
  if ((await tab.isVisible()) && (await tab.getAttribute('aria-selected')) !== 'true') await press(tab, touch);
  return inspector(page);
}

/** The outliner: docked on desktop, the sheet's other tab on a phone upright, a tab of its own sideways. */
export async function showOutliner(page: Page, touch: boolean): Promise<Locator> {
  const handle = page.locator('.sheet-handle');
  if ((await handle.isVisible()) && (await handle.getAttribute('aria-expanded')) === 'false') await handle.tap();
  const tab = page.getByRole('tab', { name: 'Outliner' });
  if (await tab.isVisible()) await press(tab, touch);
  const outliner = page.locator('[data-panel="outliner"]');
  await expect(outliner.getByRole('heading', { name: 'Outliner' })).toBeVisible();
  return outliner;
}

/** An object chosen by its outliner row, its form shown. */
export async function choose(page: Page, name: string, touch: boolean): Promise<Locator> {
  await press(outlinerRow(await showOutliner(page, touch), name), touch);
  const form = await showInspector(page, touch);
  await expect(form.getByRole('heading', { name, exact: true })).toBeVisible();
  return form;
}

/** Adds a field from the form at the end of a designer's fields. */
async function addField(
  design: Locator,
  name: string,
  kind: string,
  touch: boolean,
  more?: (form: Locator) => Promise<unknown>,
) {
  await press(design.getByRole('button', { name: 'Add a field' }).last(), touch);
  const form = design.getByRole('form', { name: 'New field' });
  await form.getByLabel('Name of the new field').fill(name);
  await form.getByLabel('Kind', { exact: true }).selectOption({ label: kind });
  if (more) await more(form);
  await press(form.getByRole('button', { name: 'Add field' }), touch);
  await expect(form).toHaveCount(0);
}

/** A keeper type with a greeting, from the command palette, and Greta, made in Records. */
export async function makeKeeper(page: Page, touch: boolean): Promise<void> {
  await press(page.getByRole('button', { name: 'Commands' }), touch);
  await page.getByRole('combobox', { name: 'Command' }).fill('new record type');
  await page.keyboard.press('Enter');
  const naming = page.getByRole('form', { name: 'New type' });
  await naming.getByLabel('Name of the new type').fill('Keeper');
  await press(naming.getByRole('button', { name: 'Create type' }), touch);
  const design = page.getByRole('region', { name: 'Type Keeper' });
  await expect(design).toBeVisible();
  await addField(design, 'greeting', 'Text', touch);
  await expect
    .poll(() => stored(page, FOLDER, 'types/keeper.json'))
    .toEqual({
      title: 'Keeper',
      nameField: 'name',
      fields: { name: { kind: 'text', min: 1 }, greeting: { kind: 'text' } },
    });

  if (touch) await lowerSheet(page);
  await showRecords(page);
  await press(page.getByRole('button', { name: 'New keeper', exact: true }), touch);
  await page.getByLabel('Name of the new keeper').fill('Greta');
  await press(page.getByRole('button', { name: 'Create' }), touch);
  const form = page.getByRole('region', { name: 'Keeper greta' });
  await expect(form).toBeVisible();
  await form.getByRole('textbox', { name: 'Greeting' }).fill('Boots off at the door.');
  await expect
    .poll(() => stored(page, FOLDER, 'records/keeper/greta.json'))
    .toEqual({ name: 'Greta', greeting: 'Boots off at the door.' });
}

/** Hold, a kind of the project's own with a grip of three, from the Scene panel's list, in the type designer. */
export async function makeHold(page: Page, touch: boolean): Promise<void> {
  if (touch) await lowerSheet(page);
  const panel = await showScene(page);
  await press(panel.getByRole('button', { name: 'New component kind' }), touch);
  await panel.getByLabel('Name of the new component kind').fill('Hold');
  await press(panel.getByRole('button', { name: 'Create' }), touch);
  const design = page.getByRole('region', { name: 'Component kind Hold' });
  await expect(design).toBeVisible();
  await addField(design, 'grip', 'Choice', touch, (form) =>
    form.getByLabel('Choices, one a line').fill('jug\ncrimp\nsloper'),
  );
  await expect
    .poll(() => stored(page, FOLDER, 'components/hold.json'))
    .toEqual({ title: 'Hold', fields: { grip: { kind: 'enum', values: ['jug', 'crimp', 'sloper'] } } });
  if (touch) await lowerSheet(page);
  await expect(panel.getByRole('button', { name: 'Hold (hold)' })).toBeVisible();
}

/** The lamp: a box with a light of intensity 3 and a crimp, each added and set with its form. */
export async function makeLamp(page: Page, touch: boolean): Promise<void> {
  await newSpaceFile(page, 'prefab', 'Lamp');
  await add(page, 'Box');
  const form = await showInspector(page, touch);
  await form.getByLabel('Add a component').selectOption({ label: 'Light' });
  const light = form.getByRole('group', { name: 'Light' });
  await light.getByRole('textbox', { name: 'Intensity' }).fill('3');
  await form.getByLabel('Add a component').selectOption({ label: 'Hold' });
  await form.getByRole('group', { name: 'Hold' }).getByRole('combobox', { name: 'Grip' }).selectOption('crimp');
  await expect
    .poll(() => lamp(page))
    .toEqual({
      name: 'Lamp',
      objects: [{ id: 'box', shape: 'box', components: { light: { intensity: 3 }, hold: { grip: 'crimp' } } }],
    });
}

/** The yard: the lamp placed, then Greta, from Add's Record…. */
export async function makeYard(page: Page, touch: boolean): Promise<void> {
  if (touch) await lowerSheet(page);
  await press(scenePanel(page).getByRole('button', { name: 'Back to the list' }), touch);
  await newSpaceFile(page, 'space', 'Yard');
  await add(page, 'Lamp');
  if (touch) await lowerSheet(page);
  await press(scenePanel(page).getByRole('button', { name: 'Add', exact: true }), touch);
  await press(scenePanel(page).getByRole('button', { name: 'Record…' }), touch);
  await press(page.getByRole('dialog', { name: 'Place a record' }).getByRole('option', { name: /Greta/ }), touch);
  await expect
    .poll(async () => (await yard(page))?.objects)
    .toEqual([
      { id: 'lamp', prefab: 'lamp' },
      { id: 'greta', record: 'keeper:greta', at: [1.5, 0, 0] },
    ]);
}

export const LAMP = {
  name: 'Lamp',
  objects: [{ id: 'box', shape: 'box', components: { light: { intensity: 3 }, hold: { grip: 'crimp' } } }],
};

/** Greta's greeting changed where she stands: an override of the placement, her record as it was. */
export async function overrideGreeting(page: Page, touch: boolean): Promise<void> {
  const form = await choose(page, 'greta', touch);
  const here = form.getByRole('region', { name: 'Greta here' });
  await here.getByRole('textbox', { name: 'Greeting' }).fill('Welcome up.');
  await expect.poll(async () => (await object(page, 'greta'))?.overrides).toEqual({ greeting: 'Welcome up.' });
  await expect(here.getByRole('button', { name: 'Revert Greeting' })).toBeVisible();
  expect(await stored(page, FOLDER, 'records/keeper/greta.json')).toEqual({
    name: 'Greta',
    greeting: 'Boots off at the door.',
  });
}

/** Inside the lamp's placement, its box's light turned up and its colour changed, then the colour reverted. */
export async function overrideInside(page: Page, touch: boolean): Promise<void> {
  const form = await choose(page, 'lamp', touch);
  await press(form.getByRole('button', { name: /^box / }), touch);
  await expect(form.getByRole('heading', { name: 'lamp › box' })).toBeVisible();
  await form.getByRole('group', { name: 'Light' }).getByRole('textbox', { name: 'Intensity' }).fill('8');
  await form.getByLabel('Colour', { exact: true }).fill('#ff8800');
  await expect
    .poll(async () => (await object(page, 'lamp'))?.overrides)
    .toEqual({ box: { color: '#ff8800', components: { light: { intensity: 8 } } } });
  await press(form.getByRole('button', { name: 'Revert colour' }), touch);
  await expect
    .poll(async () => (await object(page, 'lamp'))?.overrides)
    .toEqual({ box: { components: { light: { intensity: 8 } } } });
  await expect(form.getByRole('button', { name: 'Revert colour' })).toHaveCount(0);
  await expect(form.getByRole('button', { name: 'Revert Intensity' })).toBeVisible();
  expect(await lamp(page)).toEqual(LAMP);
}

/** What a reload must bring back: Greta's greeting and the box's light as overridden, the colour as the prefab's. */
export async function expectOverridesShown(page: Page, touch: boolean): Promise<void> {
  const greta = await choose(page, 'greta', touch);
  const here = greta.getByRole('region', { name: 'Greta here' });
  await expect(here.getByRole('textbox', { name: 'Greeting' })).toHaveValue('Welcome up.');
  await expect(here.getByRole('button', { name: 'Revert Greeting' })).toBeVisible();
  const form = await choose(page, 'lamp', touch);
  await press(form.getByRole('button', { name: /^box changed here/ }), touch);
  await expect(form.getByRole('group', { name: 'Light' }).getByRole('textbox', { name: 'Intensity' })).toHaveValue('8');
  await expect(form.getByRole('button', { name: 'Revert Intensity' })).toBeVisible();
  await expect(form.getByRole('button', { name: 'Revert colour' })).toHaveCount(0);
}

/** A placed record's label over its marker in the view: beside the marker's spot, and above it. */
export async function expectLabelOver(page: Page, id: string, text: string): Promise<void> {
  const label = scenePanel(page).locator('.scene-label', { hasText: text });
  await expect(label).toBeVisible();
  // The marker is small, and chosen it sits under the gizmo: any point on it will do.
  const spot = await objectAt(page, id, true);
  await expect
    .poll(async () => {
      const box = await label.boundingBox();
      return box !== null && Math.abs(box.x + box.width / 2 - spot.x) < 60 && box.y + box.height < spot.y + 10;
    })
    .toBe(true);
}
