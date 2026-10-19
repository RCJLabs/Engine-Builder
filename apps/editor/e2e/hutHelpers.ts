/**
 * What the gate's e2e (Phase 3, D50) shares between its parts: the hut fixture it builds to, each
 * stored file compared with the fixture's as it lands, a list's next item, an effect added, and a
 * record made under a short name its id comes from, then given its full one.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { newRecord, stored, storedText } from './kitHelpers.ts';
import { REPO } from './ludus.ts';

export const HUT = join(REPO, 'tools/cli/test/fixtures/hut');
/** The project's folder in the editor's library, from the name it is created with. */
export const FOLDER = 'the-hut';

export const fixture = (path: string): unknown => JSON.parse(readFileSync(join(HUT, path), 'utf8'));
export const fixtureText = (path: string): string => readFileSync(join(HUT, path), 'utf8');

/** Waits until the stored file is the fixture's: as JSON, or for a script or a scene, as text. */
export async function landed(page: Page, path: string): Promise<void> {
  if (path.endsWith('.json')) await expect.poll(() => stored(page, FOLDER, path)).toEqual(fixture(path));
  else await expect.poll(() => storedText(page, FOLDER, path)).toBe(fixtureText(path));
}

/** An item added to a list in `scope`, as its group. */
export async function addTo(scope: Locator, list: string, n: number): Promise<Locator> {
  await scope.getByRole('button', { name: `Add to ${list}`, exact: true }).click();
  const item = scope.getByRole('group', { name: `${list}, item ${n}`, exact: true });
  await expect(item).toBeVisible();
  return item;
}

/** An effect added to the effects field `list` in `scope`, as its list item. */
export async function addEffect(scope: Locator, list: string, label: string): Promise<Locator> {
  const field = scope.getByRole('group', { name: new RegExp(`^${list}( \\(optional\\))?$`) }).first();
  const items = field.getByRole('listitem');
  const n = await items.count();
  await scope.getByLabel(`Effect to add to ${list}`, { exact: true }).selectOption({ label });
  await scope.getByRole('button', { name: `Add effect to ${list}`, exact: true }).click();
  await expect(items).toHaveCount(n + 1);
  return items.nth(n);
}

/** Picks a record in a ref field of `scope`: the field's button, then the option in its dialog. */
export async function choose(scope: Locator, field: RegExp, dialog: string, option: string): Promise<void> {
  await scope.getByRole('button', { name: field }).click();
  await scope.page().getByRole('dialog', { name: dialog }).getByRole('option', { name: option }).click();
}

/** A record made in Records under `short`, its id, then given its full name when it has one. */
export async function made(page: Page, type: string, title: string, short: string, name?: string): Promise<Locator> {
  const form = await newRecord(page, type, title, short);
  if (name !== undefined)
    await form
      .getByRole('textbox', { name: /^Name( \(optional\))?$/ })
      .first()
      .fill(name);
  return form;
}
