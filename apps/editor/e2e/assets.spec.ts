/** M2.7's Assets panel on a desktop: import with provenance, the asset inspector, renames that carry the records, stand-ins. */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { importLudus, openRecord, PNG, SPICULUS, showAssets, stored } from './ludus.ts';

test.use({ viewport: { width: 1280, height: 800 } });

const undo = (page: Page, label: string) => page.getByRole('button', { name: `Undo: ${label}` }).click();
const inspector = (page: Page, path: string): Locator => page.getByRole('region', { name: `Asset ${path}` });
const tile = (panel: Locator, name: string) => panel.getByRole('button', { name: new RegExp(`^${name} `) });

/** Files through the Import button's picker. */
async function importFiles(page: Page, panel: Locator, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    panel.getByRole('button', { name: 'Import files' }).click(),
  ]);
  await chooser.setFiles(files);
  const form = panel.getByRole('region', { name: /^Import / });
  await expect(form).toBeVisible();
  return form;
}

const log = async (page: Page) =>
  ((await stored(page, 'assets/assets.json')) as { files?: Record<string, unknown> } | null)?.files;

test('imports files with one provenance, refusing until the licence asks for nothing more', async ({ page }) => {
  const errors = watchErrors(page);
  await importLudus(page);
  const panel = await showAssets(page);
  await expect(tile(panel, 'spiculus.svg')).toBeVisible();
  const form = await importFiles(page, panel, [
    { name: 'hero.png', mimeType: 'image/png', buffer: PNG },
    { name: 'theme.ogg', mimeType: 'audio/ogg', buffer: Buffer.from('OggS fake') },
  ]);
  await expect(form).toContainText('assets/images/hero.png');
  await expect(form).toContainText('assets/audio/theme.ogg');
  await form.getByRole('button', { name: 'Import 2 files' }).click();
  await expect(form.getByRole('alert')).toHaveText('Fill in what the boxes above ask for first.');
  await expect(form.getByLabel('Licence')).toHaveAccessibleDescription(/Choose a licence/);
  await form.getByLabel('Licence').selectOption('CC-BY-4.0');
  await expect(form.getByLabel(/^Made by/)).toHaveAccessibleDescription(/asks for credit: say who made it/);
  await form.getByLabel(/^Made by/).fill('Kenney');
  await form.getByLabel('Where it came from').fill('https://kenney.nl');
  await expectNoAxeIssues(page);
  await form.getByRole('button', { name: 'Import 2 files' }).click();
  await expect(form).toHaveCount(0);
  await expect(tile(panel, 'hero.png')).toBeVisible();
  await expect
    .poll(() => log(page))
    .toMatchObject({
      'audio/theme.ogg': { licence: 'CC-BY-4.0', author: 'Kenney', source: 'https://kenney.nl' },
      'images/hero.png': { licence: 'CC-BY-4.0', author: 'Kenney', source: 'https://kenney.nl' },
    });
  await undo(page, 'Import 2 files');
  await expect(tile(panel, 'hero.png')).toHaveCount(0);
  await expect.poll(async () => Object.keys((await log(page)) ?? {})).toEqual(['portraits/spiculus.svg']);
  expect(errors).toEqual([]);
});

test('shows an asset in the inspector, its provenance a form whose boxes are steps', async ({ page }) => {
  const errors = watchErrors(page);
  await importLudus(page);
  const panel = await showAssets(page);
  await tile(panel, 'spiculus.svg').click();
  const shown = inspector(page, 'portraits/spiculus.svg');
  await expect(shown.getByRole('img', { name: 'spiculus.svg, as it is' })).toBeVisible();
  await expect(shown).toContainText('Image, ');
  await expect(shown.getByLabel('Licence')).toHaveValue('own');
  await expect(shown.getByRole('button', { name: 'Gladiator Spiculus' })).toBeVisible();
  await shown.getByLabel('Where it came from').fill('Drawn by Evan');
  await expect
    .poll(async () => (await log(page))?.['portraits/spiculus.svg'])
    .toMatchObject({ source: 'Drawn by Evan' });
  // Typing joins into one step, as in a record's form: one undo takes it all back.
  await shown.getByLabel('Where it came from').pressSequentially(', in ink');
  await expect(shown.getByLabel('Where it came from')).toHaveValue('Drawn by Evan, in ink');
  await undo(page, 'Edit Where it came from of portraits/spiculus.svg');
  await expect(shown.getByLabel('Where it came from')).toHaveValue('Drawn by Evan');
  await shown.getByRole('button', { name: /^Add/ }).click();
  await shown.getByLabel(/Hand edits, item 1/).fill('Cropped to the face');
  await expect
    .poll(async () => (await log(page))?.['portraits/spiculus.svg'])
    .toMatchObject({ edits: ['Cropped to the face'] });
  await shown.getByLabel('Licence').selectOption('CC-BY-4.0');
  await expect(shown.getByLabel(/^Made by/)).toHaveAccessibleDescription(/asks for credit/);
  await undo(page, 'Edit Licence of portraits/spiculus.svg');
  await expect(shown.getByLabel('Licence')).toHaveValue('own');
  expect(await smallTargets(page, '[data-panel="inspector"]')).toEqual([]);
  expect(await smallTargets(page, '[data-panel="assets"]')).toEqual([]);
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);
  expect(errors).toEqual([]);
});

test('renames an asset with the records that name it, and undo takes it all back', async ({ page }) => {
  const errors = watchErrors(page);
  await importLudus(page);
  const panel = await showAssets(page);
  await tile(panel, 'spiculus.svg').click();
  const shown = inspector(page, 'portraits/spiculus.svg');
  await shown.getByRole('button', { name: 'Rename or move' }).click();
  const box = shown.getByLabel('New path for spiculus.svg, inside assets/');
  await box.fill('portraits/spiculus.png');
  await expect(shown).toContainText('Keep its extension, .svg');
  await box.fill('heroes / spiculus.svg');
  await expect(shown).toContainText('Moves to assets/heroes/spiculus.svg');
  await shown.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(inspector(page, 'heroes/spiculus.svg')).toBeVisible();
  await expect.poll(() => stored(page, SPICULUS)).toMatchObject({ portrait: 'heroes/spiculus.svg' });
  await expect.poll(async () => Object.keys((await log(page)) ?? {})).toEqual(['heroes/spiculus.svg']);
  await undo(page, 'Move portraits/spiculus.svg to heroes/spiculus.svg');
  await expect.poll(() => stored(page, SPICULUS)).toMatchObject({ portrait: 'portraits/spiculus.svg' });
  await expect(tile(panel, 'spiculus.svg')).toContainText('portraits');
  expect(errors).toEqual([]);
});

test('makes a stand-in, a record names it, and real art over it keeps the record', async ({ page }) => {
  const errors = watchErrors(page);
  await importLudus(page);
  const panel = await showAssets(page);
  await panel.getByRole('button', { name: 'New stand-in' }).click();
  await panel.getByLabel('What it stands in for').fill('Flamma portrait');
  await panel.getByRole('button', { name: 'Make stand-in' }).click();
  const shown = inspector(page, 'stand-ins/flamma-portrait.svg');
  await expect(shown).toContainText('A stand-in: replace it with real art');
  await expect(tile(panel, 'flamma-portrait.svg')).toContainText('Stand-in');
  await panel.getByRole('button', { name: 'New stand-in' }).click();
  await panel.getByLabel('What it stands in for').fill('Flamma portrait');
  await panel.getByRole('button', { name: 'Make stand-in' }).click();
  await expect(inspector(page, 'stand-ins/flamma-portrait-2.svg')).toBeVisible();
  await undo(page, 'New stand-in stand-ins/flamma-portrait-2.svg');

  const flamma = await openRecord(page, 'Gladiator', 'flamma');
  await flamma.getByRole('button', { name: /^Portrait/ }).click();
  await page
    .getByRole('dialog', { name: 'Choose an image' })
    .getByRole('option', { name: /flamma-portrait/ })
    .click();
  await expect
    .poll(() => stored(page, 'records/gladiator/flamma.json'))
    .toMatchObject({
      portrait: 'stand-ins/flamma-portrait.svg',
    });
  await flamma.getByRole('button', { name: 'Open stand-ins/flamma-portrait.svg' }).click();
  await expect(shown).toBeVisible();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    shown.getByRole('button', { name: 'Replace' }).click(),
  ]);
  await chooser.setFiles({ name: 'flamma.png', mimeType: 'image/png', buffer: PNG });
  const replacing = shown.getByRole('region', { name: 'Replace with flamma.png' });
  await expect(replacing).toContainText('It goes to assets/stand-ins/flamma-portrait.png');
  await replacing.getByLabel('Licence').selectOption('own');
  await replacing.getByLabel('Where it came from').fill('Painted by Evan');
  await replacing.getByRole('button', { name: 'Replace' }).click();
  const real = inspector(page, 'stand-ins/flamma-portrait.png');
  await expect(real).toBeVisible();
  await expect(real).not.toContainText('A stand-in');
  await expect
    .poll(() => stored(page, 'records/gladiator/flamma.json'))
    .toMatchObject({
      portrait: 'stand-ins/flamma-portrait.png',
    });
  expect(errors).toEqual([]);
});

test('replaces an asset in place, and its preview and tile show the new file at once', async ({ page }) => {
  const errors = watchErrors(page);
  await importLudus(page);
  const panel = await showAssets(page);
  await tile(panel, 'spiculus.svg').click();
  const shown = inspector(page, 'portraits/spiculus.svg');
  await expect(shown).toContainText(/Image, .* px/);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    shown.getByRole('button', { name: 'Replace' }).click(),
  ]);
  const square = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>';
  await chooser.setFiles({ name: 'spiculus-new.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(square) });
  const replacing = shown.getByRole('region', { name: 'Replace with spiculus-new.svg' });
  await expect(replacing).toContainText('It keeps the path');
  await expect(replacing.getByLabel('Licence')).toHaveValue('own');
  await replacing.getByRole('button', { name: 'Replace' }).click();
  await expect(shown).toContainText('64 × 64 px');
  await expect
    .poll(() =>
      panel
        .locator('img.asset-thumb')
        .first()
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(64);
  expect(errors).toEqual([]);
});

test('deletes an asset, saying which records will show a problem, and undo brings it back', async ({ page }) => {
  const errors = watchErrors(page);
  await importLudus(page);
  const panel = await showAssets(page);
  await tile(panel, 'spiculus.svg').click();
  const shown = inspector(page, 'portraits/spiculus.svg');
  await shown.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(shown).toContainText('1 record uses it, and will show a problem until it names another file.');
  await shown.getByRole('button', { name: 'Delete spiculus.svg' }).click();
  await expect(tile(panel, 'spiculus.svg')).toHaveCount(0);
  await expect(page.getByText('Choose a record, a type, an asset, a script or a scene to edit it here.')).toBeVisible();
  await expect.poll(() => log(page)).toEqual({});
  const spiculus = await openRecord(page, 'Gladiator', 'spiculus');
  await expect(spiculus.getByRole('button', { name: /^Portrait/ })).toHaveAccessibleDescription(
    'No file assets/portraits/spiculus.svg',
  );
  await undo(page, 'Delete portraits/spiculus.svg');
  await expect(spiculus.getByRole('button', { name: /^Portrait/ })).not.toHaveAccessibleDescription(
    'No file assets/portraits/spiculus.svg',
  );
  await showAssets(page);
  await expect(tile(panel, 'spiculus.svg')).toBeVisible();
  expect(errors).toEqual([]);
});

test('logs files added by hand, and removes entries for files that are gone', async ({ page }) => {
  const errors = watchErrors(page);
  const own = { licence: 'own', source: 'Drawn for the ludus fixture, in this repo', date: '2026-10-17' };
  await importLudus(page, {
    'assets/ui/button.png': 'not really a png',
    'assets/assets.json': JSON.stringify({ files: { 'gone.png': own, 'portraits/spiculus.svg': own } }),
  });
  const panel = await showAssets(page);
  await expect(panel).toContainText('1 file has no provenance, so the project won’t build until it has some.');
  await expect(tile(panel, 'button.png')).toContainText('No provenance');
  await panel.getByRole('button', { name: 'Log their provenance' }).click();
  const form = panel.getByRole('region', { name: 'Provenance for 1 file' });
  await form.getByLabel('Licence').selectOption('CC0-1.0');
  await form.getByLabel('Where it came from').fill('Kenney’s UI pack');
  await form.getByRole('button', { name: 'Log 1 file' }).click();
  await expect(panel).not.toContainText('no provenance');
  await expect(tile(panel, 'button.png')).not.toContainText('No provenance');
  await expect(panel).toContainText('assets/assets.json logs 1 file that isn’t in assets/: gone.png');
  await panel.getByRole('button', { name: 'Remove the entry' }).click();
  await expect(panel).not.toContainText('gone.png');
  await expect
    .poll(async () => Object.keys((await log(page)) ?? {}))
    .toEqual(['portraits/spiculus.svg', 'ui/button.png']);
  expect(errors).toEqual([]);
});

test('takes files dropped on the panel, refusing one too big, and shows a licence off the list as refused', async ({
  page,
}) => {
  const errors = watchErrors(page);
  const sa = { licence: 'CC-BY-SA-4.0', author: 'Someone', source: 'A wiki', date: '2026-10-17' };
  await importLudus(page, { 'assets/assets.json': JSON.stringify({ files: { 'portraits/spiculus.svg': sa } }) });
  const panel = await showAssets(page);
  await expect(tile(panel, 'spiculus.svg')).toContainText('Licence problem');
  const takenOver = await panel.locator('.asset-browser').evaluate((el) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'drop.png', { type: 'image/png' }));
    data.items.add(new File([new Uint8Array(26 * 1024 * 1024)], 'huge.png', { type: 'image/png' }));
    const over = new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true });
    el.dispatchEvent(over);
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
    return over.defaultPrevented;
  });
  expect(takenOver).toBe(true);
  const form = panel.getByRole('region', { name: 'Import 2 files' });
  await expect(form).toContainText('assets/images/drop.png');
  await expect(form).toContainText('Too big: 26 MB, and the most is 25 MB');
  await form.getByLabel('Licence').selectOption('own');
  await form.getByLabel('Where it came from').fill('Drawn for this game');
  await form.getByRole('button', { name: 'Import 1 file' }).click();
  await expect(tile(panel, 'drop.png')).toBeVisible();
  await expect(tile(panel, 'huge.png')).toHaveCount(0);

  await tile(panel, 'spiculus.svg').click();
  const shown = inspector(page, 'portraits/spiculus.svg');
  await expect(shown.getByLabel('Licence')).toHaveValue('CC-BY-SA-4.0');
  await expect(shown.getByLabel('Licence')).toHaveAccessibleDescription(/Refused: ShareAlike \(SA\)/);
  await shown.getByLabel('Licence').selectOption('CC-BY-4.0');
  await expect(tile(panel, 'spiculus.svg')).not.toContainText('Licence problem');
  expect(errors).toEqual([]);
});

test.describe('on a tablet, with no dock', () => {
  test.use({ viewport: { width: 800, height: 1100 } });

  // On desktop the dock takes every drag over too, so only a layout without it shows the panel's own.
  test('takes a drag of files over from the browser, so a drop lands in the panel', async ({ page }) => {
    await importLudus(page);
    const panel = await showAssets(page);
    const takenOver = await panel.locator('.asset-browser').evaluate((el) => {
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'drop.png', { type: 'image/png' }));
      const over = new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true });
      el.dispatchEvent(over);
      return over.defaultPrevented;
    });
    expect(takenOver).toBe(true);
  });
});

test('a read-only tab shows the assets but changes nothing', async ({ page, context }) => {
  await importLudus(page);
  const other = await context.newPage();
  await other.setViewportSize({ width: 1280, height: 800 });
  await other.goto('./');
  await other.getByRole('list', { name: 'Projects in this browser' }).getByRole('button', { name: 'Open' }).click();
  await expect(other.getByRole('region', { name: 'Open project' })).toContainText('open for editing in another tab');
  const panel = await showAssets(other);
  await expect(panel.getByRole('button', { name: 'Import files' })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'New stand-in' })).toHaveCount(0);
  await tile(panel, 'spiculus.svg').click();
  const shown = inspector(other, 'portraits/spiculus.svg');
  for (const name of ['Rename or move', 'Replace', 'Delete']) {
    await expect(shown.getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await expect(shown.getByLabel('Licence')).toBeDisabled();
  await expect(shown.getByLabel('Where it came from')).toHaveAttribute('readonly', '');
});
