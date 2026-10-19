/**
 * The gate's e2e, the hut's logic: the game started in the Logic panel, its module written in the
 * script editor and the first module the template made deleted; the evening written in the scene
 * editor; and the sheet that opens the storm, the evening and the talks, its rows on the time
 * kit's day and the game's own visit. Each compared with the fixture as it lands.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { addEffect, choose, fixtureText, landed } from './hutHelpers.ts';
import { showLogic } from './kitHelpers.ts';

/** Replaces the whole text in a CodeMirror, as pasting does. */
async function replaceText(page: Page, region: Locator, text: string): Promise<void> {
  await region.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
}

const script = (page: Page, id: string) => page.getByRole('region', { name: `Script ${id}.ts` });

export async function makeGame(page: Page): Promise<void> {
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'Start a game' }).click();
  await expect(script(page, 'game').locator('.cm-content')).toContainText('export const modules = [main];');
  await panel.getByRole('button', { name: 'New script' }).click();
  await panel.getByLabel('Name of the new script').fill('Hut');
  await panel.getByRole('button', { name: 'Create' }).click();
  await replaceText(page, script(page, 'hut'), fixtureText('scripts/hut.ts'));
  await landed(page, 'scripts/hut.ts');
  await panel.getByRole('button', { name: /^game\.ts/ }).click();
  await replaceText(page, script(page, 'game'), fixtureText('scripts/game.ts'));
  await landed(page, 'scripts/game.ts');
  await panel.getByRole('button', { name: /^main\.ts/ }).click();
  await script(page, 'main').getByRole('button', { name: 'Delete', exact: true }).click();
  await script(page, 'main').getByRole('button', { name: 'Delete main.ts' }).click();
  await expect(panel.getByRole('button', { name: /^main\.ts/ })).toHaveCount(0);
  await expect(panel.getByText(/^The game: .*hut, starting in hut/)).toBeVisible();
}

export async function makeScene(page: Page): Promise<void> {
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'New scene' }).click();
  await panel.getByLabel('Name of the new scene').fill('Evening');
  await panel.getByRole('button', { name: 'Create' }).click();
  const scene = page.getByRole('region', { name: 'Scene evening.ink' });
  await expect(scene.locator('.cm-content')).toContainText('# name: Evening');
  await replaceText(page, scene, fixtureText('scenes/evening.ink'));
  await landed(page, 'scenes/evening.ink');
  // It compiles, so its map is drawn; nothing opens it until the sheet does (W123).
  await expect(scene.getByRole('region', { name: 'Map of the talk' })).toBeVisible();
  await expect(scene.getByRole('list', { name: 'Problems in this scene' }).getByRole('listitem')).toHaveText([
    /^W123: /,
  ]);
}

/** A row added to the sheet: its id, the event it waits on, and what it opens. */
async function addRow(sheet: Locator, n: number, id: string, event: string): Promise<Locator> {
  await sheet.getByRole('button', { name: 'Add a row' }).click();
  const row = sheet.getByRole('group', { name: new RegExp(`^Row ${n}: `) });
  await row.getByLabel('Row id', { exact: true }).fill(id);
  await row.getByRole('group', { name: 'When' }).getByLabel('Event', { exact: true }).selectOption({ label: event });
  return row;
}

async function opens(row: Locator, label: string, field: RegExp, dialog: string, option: string): Promise<void> {
  const effect = await addEffect(row, 'Do', label);
  await choose(effect, field, dialog, option);
}

export async function makeSheet(page: Page): Promise<void> {
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'New sheet' }).click();
  await panel.getByLabel('Name of the new sheet').fill('Season');
  await panel.getByRole('button', { name: 'Create' }).click();
  const sheet = page.getByRole('region', { name: 'Trigger sheet season' });
  await sheet
    .getByRole('textbox', { name: /^Name( \(optional\))?$/ })
    .first()
    .fill('The season');
  const storm = await addRow(sheet, 1, 'storm', 'A day starts');
  await storm.getByLabel(/^If/).fill('time.day == 3');
  await opens(storm, 'Open an event', /^Event/, 'Choose an event', 'A storm (storm)');
  const evening = await addRow(sheet, 2, 'evening', 'A day starts');
  await evening.getByLabel(/^If/).fill('time.day == 5');
  await opens(evening, 'Open a talk', /^Talk/, 'Choose a talk', 'An evening at the hut (evening)');
  for (const [n, who, name] of [
    [3, 'greta', 'Greta (greta)'],
    [4, 'anselm', 'Anselm (anselm)'],
  ] as const) {
    const row = await addRow(sheet, n, who, 'Someone is visited');
    await row.getByRole('group', { name: 'When' }).getByLabel(/^Who/).selectOption(who);
    await opens(row, 'Open a talk', /^Talk/, 'Choose a talk', name);
  }
  await landed(page, 'records/sheet/season.json');
}
