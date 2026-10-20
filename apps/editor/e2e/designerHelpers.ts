/**
 * M4.5's gate (D55), what its specs share: the hut with its own hut and journal screens set aside,
 * imported and its scripts let run; a blank screen made and opened in the designer; the outline's
 * rows picked by name and its Add; and a screen's file as the editor stores it, key order and all.
 */
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { FOLDER, fixtureText, HUT } from './hutHelpers.ts';
import { showPlay } from './hutScreens.ts';
import { fixtureZip, storedText } from './kitHelpers.ts';
import { openProject, scratch, showProject } from './ludus.ts';

let made = 0;
let byTouch = false;

/** From now on, a press is a tap, as on a phone; or a click again. */
export function touch(on: boolean): void {
  byTouch = on;
}

/** A press as the device makes one: a tap on a phone, a click on desktop. */
export const hit = (target: Locator): Promise<void> => (byTouch ? target.tap() : target.click());

/** A copy of the hut without ui/hut.json and ui/journal.json, the two screens the gate makes again. */
export function designerHutDir(): string {
  const dir = join(scratch, `designer-hut-${Date.now()}-${++made}`);
  cpSync(HUT, dir, { recursive: true });
  for (const id of ['hut', 'journal']) rmSync(join(dir, 'ui', `${id}.json`));
  return dir;
}

/** The hut, its two screens set aside, imported and its scripts let run. */
export async function importDesignerHut(page: Page): Promise<Locator> {
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    hit(page.getByRole('button', { name: 'Import zip' })),
  ]);
  await chooser.setFiles(fixtureZip(designerHutDir(), 'the-hut'));
  await expect(openProject(page).getByRole('heading', { name: 'The hut' })).toBeVisible();
  const panel = await showPlay(page);
  await hit(panel.getByRole('button', { name: 'Run its scripts' }));
  return panel;
}

/** A blank screen made by New screen, open in the designer. */
export async function newBlank(page: Page, id: string): Promise<Locator> {
  const panel = await showPlay(page);
  await hit(panel.getByRole('button', { name: 'New screen' }));
  await panel.getByLabel('Name of the new screen').fill(id);
  await hit(panel.getByRole('button', { name: 'Create' }));
  const region = page.getByRole('region', { name: `Screen ${id}` });
  await hit(region.getByRole('button', { name: 'Design', exact: true }));
  await expect(outline(region)).toBeVisible();
  return region;
}

export const outline = (region: Locator): Locator => region.getByRole('list', { name: 'Outline' });

/** Selects the outline's row whose name starts with `name`: "Main: Stack", "Tab Quests". */
export async function pick(region: Locator, name: string, nth = 0): Promise<void> {
  const row = outline(region)
    .getByRole('button', { name: new RegExp(`^${escaped(name)}`) })
    .nth(nth);
  await hit(row);
  await expect(row).toHaveAttribute('aria-current', 'true');
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The outline's actions on the selected row. */
export const bar = (region: Locator): Locator => region.getByRole('group', { name: 'Change the outline' });

/** Adds a widget of `kind` where Add puts one for the selected row; the new widget is selected. */
export async function add(region: Locator, kind: string): Promise<void> {
  await bar(region).getByLabel('Add', { exact: true }).selectOption({ label: kind });
  await hit(bar(region).getByRole('button', { name: /^Add (into|inside|after)/ }));
  await expect(region.getByRole('heading', { level: 4, name: new RegExp(`${escaped(kind)}$`) })).toBeVisible();
}

/** One of the outline bar's actions on the selected row. */
export async function act(region: Locator, name: string): Promise<void> {
  await hit(bar(region).getByRole('button', { name, exact: true }));
}

/** Ticks a box whose state is the file's: it shows ticked once the edit lands. */
export async function tick(region: Locator, label: string): Promise<void> {
  const box = region.getByLabel(label, { exact: true });
  await hit(box);
  await expect(box).toBeChecked();
}

/** Types into the selected part's field, labelled `label`, and leaves it, as a person does. */
export async function type(region: Locator, label: string | RegExp, text: string): Promise<void> {
  // A number field has a slider beside its box: the box is what is typed in.
  const field = region.getByRole('textbox', { name: label, ...(typeof label === 'string' ? { exact: true } : {}) });
  await field.fill(text);
  await field.blur();
}

/** The screen's file as the editor stores it, parsed and written again: its values in their key order. */
export async function storedScreen(page: Page, id: string): Promise<string> {
  const text = await storedText(page, FOLDER, `ui/${id}.json`);
  return text === null ? '' : JSON.stringify(JSON.parse(text));
}

/** The fixture's screen, its values in their key order. */
export const fixtureScreen = (id: string): string => JSON.stringify(JSON.parse(fixtureText(`ui/${id}.json`)));
