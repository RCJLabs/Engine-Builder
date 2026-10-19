/**
 * M3.11 on desktop (the gate): the dialogue kit on, a scene made in the Logic panel and written in
 * the inspector's CodeMirror; ink the engine doesn't read shown at its line, and the Problems
 * panel's way to it; a speaker the scene names that isn't there (E005) at the scene's line until
 * the speaker is made; the talk the scene makes on its map, a box opening the scene at its line;
 * the scene among the talks in Records; a row opening its talk; and the export checked clean by
 * `eb validate`, its talk the same as `eb build` makes of the scene.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { sceneTemplate } from '../src/scenes/templates.ts';
import { expectNoAxeIssues, expectNothingOffscreen, watchErrors } from './checks.ts';
import { createProject, kitsBox, newRecord, pick, showLogic, stored, storedText } from './kitHelpers.ts';
import { openProject, REPO, scratch, showProject, showRecords } from './ludus.ts';

test.use({ viewport: { width: 1280, height: 900 } });

const sceneRegion = (page: Page, id: string) => page.getByRole('region', { name: `Scene ${id}.ink` });
const code = (region: Locator) => region.locator('.cm-content');

/** Replaces a scene's whole text as typed, in one go: what pasting does. */
async function replaceText(page: Page, region: Locator, text: string): Promise<void> {
  await code(region).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(text);
}

const SCENE = [
  '# name: First dusk',
  'EXTERNAL flag_on(flag)',
  'The last of the queue goes through the gate as the sun touches the hill.',
  '"First day. How many did you send up?" # speaker: hild',
  '{ flag_on("asked"):',
  '  "You asked me once whether it matters." # speaker: hild',
  '}',
  '* ["Does it matter where they go?"]',
  '  # fx: set-flag(flag: asked, to: true)',
  '  "It matters to them." # speaker: hild',
  '* [Say nothing.]',
  '- She goes off toward the bridge, whistling.',
  '-> END',
  '',
].join('\n');

/** A row opening the scene's talk as a flag changes: what keeps W123 away. */
async function rowOpening(page: Page): Promise<void> {
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'New sheet' }).click();
  await panel.getByLabel('Name of the new sheet').fill('Dusk');
  await panel.getByRole('button', { name: 'Create' }).click();
  const sheet = page.getByRole('region', { name: 'Trigger sheet dusk' });
  await sheet.getByRole('button', { name: 'Add a row' }).click();
  const row = sheet.getByRole('group', { name: 'Row 1: row-1' });
  await row
    .getByRole('group', { name: 'When' })
    .getByLabel('Event', { exact: true })
    .selectOption({ label: 'A flag changes' });
  const opens = row.getByRole('group', { name: 'Do' });
  await opens.getByLabel('Effect to add to Do', { exact: true }).selectOption({ label: 'Open a talk' });
  await opens.getByRole('button', { name: 'Add effect to Do', exact: true }).click();
  // The scene's talk is offered as any talk is, by the name its # name tag gives.
  await pick(page, opens, /^Talk Not chosen/, 'Choose a talk', 'First dusk (first-dusk)');
  await expect
    .poll(() => stored(page, 'gate', 'records/sheet/dusk.json'))
    .toMatchObject({ rows: [{ do: [{ effect: 'open-talk', talk: 'first-dusk' }] }] });
}

test('a scene written in the editor, its problems at their lines, its talk on the map and opened by a row, the export clean', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await createProject(page, 'Gate');
  await kitsBox(page).getByLabel('Dialogue', { exact: true }).check();
  await expect.poll(() => stored(page, 'gate', 'project.json')).toMatchObject({ kits: ['dialogue'] });
  const panel = await showLogic(page);
  await panel.getByRole('button', { name: 'New flag' }).click();
  await panel.getByLabel('Name of the new flag').fill('Asked');
  await panel.getByRole('button', { name: 'Create' }).click();
  await expect.poll(() => stored(page, 'gate', 'records/flag/asked.json')).toEqual({ name: 'Asked' });

  // A new scene compiles as it stands, its map drawn from the talk it makes.
  await panel.getByRole('button', { name: 'New scene' }).click();
  await panel.getByLabel('Name of the new scene').fill('First dusk');
  await panel.getByRole('button', { name: 'Create' }).click();
  const scene = sceneRegion(page, 'first-dusk');
  await expect(code(scene)).toContainText('# name: First dusk');
  await expect.poll(() => storedText(page, 'gate', 'scenes/first-dusk.ink')).toBe(sceneTemplate('First dusk'));
  const map = scene.getByRole('region', { name: 'Map of the talk' });
  await expect(map.getByRole('button', { name: /^start\b/ }).first()).toContainText('The first line of the scene.');
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  // Ink the engine doesn't read, at its line, with no map until it compiles; the Problems panel goes there.
  await replaceText(page, scene, 'Hello.\nVAR met = false\n-> END\n');
  const unread = scene.getByText('E046: ink’s variables aren’t read: keep state in the game, as facts and effects');
  await expect(unread).toBeVisible();
  await expect(scene.getByText('The map shows the talk this scene makes once it has no errors.')).toBeVisible();
  await expect(panel.getByRole('button', { name: /^first-dusk\.ink 1 problem/ })).toBeVisible();
  await page.getByRole('tab', { name: /^Problems \(\d+\)$/ }).click();
  await page.getByRole('button', { name: /variables aren’t read/ }).click();
  await expect(code(scene)).toBeFocused();
  await expect(scene.locator('.cm-activeLine')).toContainText('VAR met = false');

  // The scene written: a speaker it names that isn't there, at the scene's line, until it is.
  await replaceText(page, scene, SCENE);
  const nobody = scene.getByText('E005: No record speaker:hild');
  await expect(nobody.first()).toBeVisible();
  await scene.getByRole('button', { name: 'Line 4', exact: true }).first().click();
  await expect(scene.locator('.cm-activeLine')).toContainText('How many did you send up?');
  await newRecord(page, 'speaker', 'Speaker', 'Hild');
  await showLogic(page);
  await panel.getByRole('button', { name: /^first-dusk\.ink/ }).click();
  await expect(nobody).toHaveCount(0);
  // Nothing opens its talk yet.
  await expect(scene.getByText(/^W123: /)).toBeVisible();

  // The map: the block a branch of the line before it, the choices on a line of their own, and a box opening its line.
  await expect(map.getByRole('button', { name: /^start-2\b/ })).toContainText('If flag.on(asked) → start-3');
  await expect(map.getByRole('button', { name: /^start-2\b/ })).toContainText('Hild');
  await map.getByRole('button', { name: /^start-5\b/ }).click();
  await expect(code(scene)).toBeFocused();
  await expect(scene.locator('.cm-activeLine')).toContainText('"It matters to them."');
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  // In Records, among the talks, by its name, opening the scene.
  await showRecords(page);
  await page.getByLabel('Type', { exact: true }).selectOption('talk');
  const table = page.getByRole('table');
  await expect(table.getByRole('checkbox', { name: 'Select first-dusk' })).toHaveCount(0);
  await table.getByRole('button', { name: /First dusk first-dusk\.ink/ }).click();
  await expect(sceneRegion(page, 'first-dusk')).toBeVisible();

  await rowOpening(page);
  await panel.getByRole('button', { name: /^first-dusk\.ink/ }).click();
  await expect(scene.getByText('No problems.')).toBeVisible();

  await showProject(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    openProject(page).getByRole('button', { name: 'Export zip' }).click(),
  ]);
  const exported = join(scratch, 'gate.zip');
  await download.saveAs(exported);
  expect(execFileSync('node', ['tools/cli/src/cli.ts', 'validate', exported], { cwd: REPO, encoding: 'utf8' })).toMatch(
    /^4 records: no problems, hash [0-9a-f]{16}\.\n$/,
  );
  const pack = join(scratch, 'gate.pack.json');
  execFileSync('node', ['tools/cli/src/cli.ts', 'build', exported, '--out', pack], { cwd: REPO });
  const talk = JSON.parse(readFileSync(pack, 'utf8')).records.talk['first-dusk'];
  expect(talk.lines.map((line: { id: string }) => line.id)).toEqual([
    'start',
    'start-2',
    'start-3',
    'start-4',
    'start-5',
    'start-6',
  ]);
  expect(errors).toEqual([]);
});
