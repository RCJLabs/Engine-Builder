/**
 * M6.7's gate in the editor (D79, docs/specs/radiant.md#the-gate), at 1280 and 390 wide: the hollows
 * come in with no tags anywhere and no Supplies, so the bounty's den can never be filled (W127). The
 * barrow and the mine tagged caves in the space's form, and W127 gone; the barrow's crate tagged as an
 * object, the mine's through the cache prefab; Supplies made with forms, its object slot giving E088
 * until it is given In; and in Play the board read, the compass on the barrow's door and the journal
 * naming the crate the editor tagged.
 */
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { press, showInspector, showOutliner } from './componentHelpers.ts';
import { offered, promptButton } from './glenHelpers.ts';
import { HOLLOWS, importZip, marksAt, playHollows } from './hollowsHelpers.ts';
import { fixtureZip, newRecord, stored } from './kitHelpers.ts';
import { entry, openScreen } from './markerHelpers.ts';
import { outlinerRow, showScene, viewStarted } from './spaceHelpers.ts';
import { settled } from './walkHelpers.ts';

const FOLDER = 'hollows';
const NO_DEN = 'No space carries the tags "cave", so this slot can never be filled';
const NO_IN = 'An object is found in a space: give In';

type Tagged = { id?: string; tags?: string[]; objects?: Tagged[]; overrides?: Record<string, Tagged> };

/** Every tag out of a space or prefab, and any override left with nothing in it. */
function untag(file: Tagged): void {
  delete file.tags;
  for (const object of file.objects ?? []) {
    untag(object);
    for (const [path, override] of Object.entries(object.overrides ?? {})) {
      delete override.tags;
      if (Object.keys(override).length === 0) delete object.overrides?.[path];
    }
    if (object.overrides && Object.keys(object.overrides).length === 0) delete object.overrides;
  }
}

/** The hollows as a zip with no tags and no Supplies. */
function hollowsBare(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hollows-'));
  cpSync(HOLLOWS, dir, { recursive: true });
  for (const folder of ['spaces', 'prefabs'])
    for (const name of readdirSync(join(dir, folder)).filter((n) => n.endsWith('.json'))) {
      const path = join(dir, folder, name);
      const file = JSON.parse(readFileSync(path, 'utf8')) as Tagged;
      untag(file);
      writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
    }
  rmSync(join(dir, 'records/quest/supplies.json'));
  return fixtureZip(dir, FOLDER);
}

const fixture = (path: string): unknown => JSON.parse(readFileSync(join(HOLLOWS, path), 'utf8'));

async function showProblems(page: Page, touch: boolean): Promise<Locator> {
  await press(page.getByRole('tab', { name: /^Problems/ }), touch);
  const panel = page.locator('[data-panel="problems"]');
  await expect(panel.getByRole('heading', { name: 'Problems' })).toBeVisible();
  return panel;
}

/** A space or prefab opened from the Scene panel's list, back to the list first if another is open. */
async function openFile(page: Page, name: RegExp, touch: boolean): Promise<void> {
  const panel = await showScene(page);
  const back = panel.getByRole('button', { name: 'Back to the list' });
  if (await back.isVisible()) await press(back, touch);
  await press(panel.getByRole('button', { name }), touch);
  await viewStarted(page);
}

/** A tag typed into the inspector's Tags field and added, then seen as a chip. */
async function addTag(form: Locator, of: string, tag: string, touch: boolean): Promise<void> {
  const field = form.getByRole('group', { name: 'Tags', exact: true });
  await field.getByLabel('New tag', { exact: true }).fill(tag);
  await press(field.getByRole('button', { name: 'Add tag' }), touch);
  await expect(field.getByRole('list', { name: `Tags of ${of}` }).getByRole('listitem')).toContainText([tag]);
}

/** An object chosen by its outliner row, its form in the inspector under its name and id. */
async function chosen(page: Page, name: string, id: string, touch: boolean): Promise<Locator> {
  await press(outlinerRow(await showOutliner(page, touch), name), touch);
  const form = await showInspector(page, touch);
  await expect(form.getByRole('heading', { name: `${name} (${id})`, exact: true })).toBeVisible();
  return form;
}

const spaceTags = async (page: Page, path: string) => ((await stored(page, FOLDER, path)) as Tagged | null)?.tags;

async function tagCaves(page: Page, touch: boolean): Promise<void> {
  await test.step('W127: no cave for the bounty’s den, before any tags', async () => {
    const problems = await showProblems(page, touch);
    await expect(problems.getByText(NO_DEN)).toBeVisible();
  });

  await test.step('the barrow and the mine tagged caves in the space’s form, and W127 gone', async () => {
    for (const [name, id] of [
      ['The barrow', 'barrow'],
      ['The mine', 'mine'],
    ] as const) {
      await openFile(page, new RegExp(`^${name} \\(${id}\\)`), touch);
      const form = await showInspector(page, touch);
      await expect(form.getByText(`None: a quest can’t find ${name} by what it is.`)).toBeVisible();
      await addTag(form, name, 'cave', touch);
      await expect.poll(() => spaceTags(page, `spaces/${id}.json`)).toEqual(['cave']);
    }
    const problems = await showProblems(page, touch);
    await expect(problems.getByText(NO_DEN)).toHaveCount(0);
  });

  await test.step('the barrow’s crate tagged as an object, the mine’s chest through the cache prefab', async () => {
    await openFile(page, /^The barrow \(barrow\)/, touch);
    await addTag(await chosen(page, 'Crate', 'cache', touch), 'Crate', 'cache', touch);
    await expect
      .poll(async () => {
        const barrow = (await stored(page, FOLDER, 'spaces/barrow.json')) as Tagged | null;
        return barrow?.objects?.filter((o) => o.tags !== undefined).map((o) => [o.id, o.tags]);
      })
      .toEqual([['cache', ['cache']]]);
    await openFile(page, /^Cache \(cache\)/, touch);
    await addTag(await chosen(page, 'Old chest', 'chest', touch), 'Old chest', 'cache', touch);
    await expect.poll(() => stored(page, FOLDER, 'prefabs/cache.json')).toEqual(fixture('prefabs/cache.json'));
  });
}

/** Supplies with forms: a stage, its two slots, E088 on the object slot until it has In, then the stage's words. */
async function makeSupplies(page: Page, touch: boolean): Promise<void> {
  const quest = await newRecord(page, 'quest', 'Quest', 'Supplies');
  await quest.getByLabel('Repeats (optional)', { exact: true }).check();
  // A quest is checked for its slots once it has a stage: a record its type refuses is checked no further.
  await press(quest.getByRole('button', { name: 'Add to Stages', exact: true }), touch);
  const stage = quest.getByRole('group', { name: 'Stages, item 1', exact: true });
  await stage.getByLabel('Id', { exact: true }).fill('fetch');

  await test.step('the cave: a space slot by its tags, the nearest', async () => {
    await press(quest.getByRole('button', { name: 'Add to Slots', exact: true }), touch);
    const cave = quest.getByRole('group', { name: 'Slots, item 1', exact: true });
    await cave.getByLabel('Id', { exact: true }).fill('cave');
    await cave.getByLabel('Type', { exact: true }).fill('space');
    await press(cave.getByRole('button', { name: 'Add to Tags', exact: true }), touch);
    await cave.getByRole('textbox', { name: 'Tags, item 1', exact: true }).fill('cave');
    await cave.getByLabel(/^Pick/).selectOption('nearest');
  });

  await test.step('the cache: an object slot, E088 until In names the cave', async () => {
    await press(quest.getByRole('button', { name: 'Add to Slots', exact: true }), touch);
    const cache = quest.getByRole('group', { name: 'Slots, item 2', exact: true });
    await cache.getByLabel('Id', { exact: true }).fill('cache');
    await cache.getByLabel('Type', { exact: true }).fill('object');
    await press(cache.getByRole('button', { name: 'Add to Tags', exact: true }), touch);
    await cache.getByRole('textbox', { name: 'Tags, item 1', exact: true }).fill('cache');
    await cache.getByRole('textbox', { name: 'Tags, item 1', exact: true }).press('Tab');
    await expect(cache.getByText(NO_IN)).toBeVisible();
    const inField = cache.getByLabel(/^In/);
    await expect(inField.locator('option')).toHaveText(['None', 'barrow', 'green', 'hall', 'mine', '@cave']);
    await inField.selectOption('@cave');
    await expect(cache.getByText(NO_IN)).toHaveCount(0);
  });

  await test.step('its stage: the log, and the objective counted by the use of @cache in @cave', async () => {
    await stage.getByLabel(/^Log/).fill('The board asks for the supplies left in {cave}.');
    await press(stage.getByRole('button', { name: 'Add to Objectives', exact: true }), touch);
    const objective = stage.getByRole('group', { name: 'Objectives, item 1', exact: true });
    await objective.getByLabel('Id', { exact: true }).fill('cache');
    await objective.getByLabel(/^Text/).fill('Take the supplies from the {cache} in {cave}');
    await press(objective.getByRole('button', { name: 'Add Count', exact: true }), touch);
    const count = objective.getByRole('group', { name: 'Count (optional)', exact: true });
    await count.getByLabel('Event', { exact: true }).fill('world/used');
    for (const [key, value] of [
      ['space', '@cave'],
      ['object', '@cache'],
    ]) {
      await count.getByLabel('New key for With').fill(key as string);
      await press(count.getByRole('button', { name: 'Add to With' }), touch);
      await count.getByLabel(`With: ${key}`, { exact: true }).fill(value as string);
    }
    const times = count.getByRole('textbox', { name: /^Times/ });
    await times.fill('1');
    await times.press('Tab');
    await expect
      .poll(() => stored(page, FOLDER, 'records/quest/supplies.json'))
      .toEqual(fixture('records/quest/supplies.json'));
    await expect(page.getByRole('tab', { name: /^Problems/ })).toHaveText('Problems');
  });
}

for (const [width, height, touch] of [
  [1280, 800, false],
  [390, 844, true],
] as const) {
  test.describe(`the hollows tagged and Supplies made in the editor, ${width} wide`, () => {
    test.use({ viewport: { width, height }, ...(touch ? { hasTouch: true, isMobile: true } : {}) });

    test('the caves and their caches tagged, Supplies’ slots made with forms, and played', async ({ page }) => {
      test.setTimeout(400_000);
      const errors = watchErrors(page);
      await importZip(page, hollowsBare(), 'The hollows', touch);
      await tagCaves(page, touch);
      await makeSupplies(page, touch);

      await test.step('in Play, the board read: the compass on the barrow’s door, the crate in the journal', async () => {
        const green = await playHollows(page, touch);
        if (!touch) await green.focus();
        await settled(page);
        await offered(page, 'board');
        if (touch) await promptButton(green).tap();
        else await page.keyboard.press('KeyE');
        await marksAt(page, [['cache', 'barrow-door']]);
        const journal = await openScreen(page, 'Journal', (button) => press(button, touch));
        await expect(entry(journal, 'Supplies')).toContainText('Take the supplies from the Crate in The barrow');
      });
      expect(errors).toEqual([]);
    });
  });
}
