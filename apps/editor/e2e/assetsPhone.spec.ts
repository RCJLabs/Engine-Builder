/**
 * M2.7's Assets panel on phones, portrait and landscape: the grid, the import form and the asset
 * in the inspector's sheet, every control in reach; and the Phase 2 gate's automatic half for
 * M2.7: an image imported on a phone with its provenance, a record made to use it, exported, and
 * read by the CLI to the hash of the same files made in Node, its provenance checked.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { compileProject, memorySource } from '@eb/compiler';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { readFixture } from '../../../packages/compiler/test/fixture.ts';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import {
  importLudus,
  LUDUS,
  openProject,
  openRecord,
  PNG,
  REPO,
  scratch,
  showAssets,
  showProject,
  stored,
} from './ludus.ts';

async function expectFits(page: Page, scope: string): Promise<void> {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, scope)).toEqual([]);
  await expectNoAxeIssues(page);
}

/** Files through the Import button's picker, by touch. */
async function importFiles(page: Page, panel: Locator, names: string[]): Promise<Locator> {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    panel.getByRole('button', { name: 'Import files' }).tap(),
  ]);
  await chooser.setFiles(names.map((name) => ({ name, mimeType: 'image/png', buffer: PNG })));
  const form = panel.getByRole('region', { name: /^Import / });
  await expect(form).toBeVisible();
  return form;
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 740, height: 360 },
]) {
  test.describe(`assets, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('the grid, the import form and an asset in the sheet, every control in reach', async ({ page }) => {
      const errors = watchErrors(page);
      await importLudus(page);
      const panel = await showAssets(page);
      await expectFits(page, '[data-panel="assets"]');
      const form = await importFiles(page, panel, ['a portrait with a long name, final version.png', 'b.png']);
      await form.getByLabel('Licence').selectOption('generated');
      await expect(form.getByLabel('Prompt')).toBeVisible();
      await expectFits(page, '[data-panel="assets"]');
      await form.getByRole('button', { name: 'Cancel' }).tap();
      await panel.getByRole('button', { name: /^spiculus\.svg / }).tap();
      // In the sheet on a phone held upright; beside the panel in landscape, which is tablet width.
      const shown = page.getByRole('region', { name: 'Asset portraits/spiculus.svg' });
      await expect(shown.getByRole('img', { name: 'spiculus.svg, as it is' })).toBeVisible();
      await expectFits(page, '[data-panel="inspector"]');
      await shown.getByRole('button', { name: 'Rename or move' }).tap();
      await expectFits(page, '[data-panel="inspector"]');
      expect(errors).toEqual([]);
    });
  });
}

test.describe('the Phase 2 gate, phone 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('an image imported on a phone, a record using it, exported: the CLI reads the hash of the same files', async ({
    page,
  }) => {
    const errors = watchErrors(page);
    await importLudus(page);
    const panel = await showAssets(page);
    const form = await importFiles(page, panel, ['flamma.png']);
    await form.getByLabel('Licence').selectOption('CC-BY-4.0');
    await form.getByLabel(/^Made by/).fill('Evan');
    await form.getByLabel('Where it came from').fill('Painted for the ludus');
    await form.getByLabel('Date').fill('2026-10-18');
    await form.getByRole('button', { name: 'Import 1 file' }).tap();
    await expect(page.locator('section.sheet[data-open="true"]')).toBeVisible();

    const flamma = await openRecord(page, 'Gladiator', 'flamma');
    await flamma.getByRole('button', { name: /^Portrait/ }).tap();
    await page
      .getByRole('dialog', { name: 'Choose an image' })
      .getByRole('option', { name: 'images/flamma.png' })
      .tap();
    await expect
      .poll(() => stored(page, 'records/gladiator/flamma.json'))
      .toMatchObject({ portrait: 'images/flamma.png' });

    await showProject(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      openProject(page).getByRole('button', { name: 'Export zip' }).tap(),
    ]);
    const exported = join(scratch, 'ludus-assets.zip');
    await download.saveAs(exported);

    // The same files made in Node: the image, its entry beside the fixture's, and the record naming it.
    const files: Record<string, string | Uint8Array> = readFixture(LUDUS);
    files['assets/images/flamma.png'] = PNG;
    const log = JSON.parse(files['assets/assets.json'] as string);
    log.files['images/flamma.png'] = {
      licence: 'CC-BY-4.0',
      author: 'Evan',
      source: 'Painted for the ludus',
      date: '2026-10-18',
    };
    files['assets/assets.json'] = JSON.stringify(log);
    const flammaJson = JSON.parse(files['records/gladiator/flamma.json'] as string);
    files['records/gladiator/flamma.json'] = JSON.stringify({ ...flammaJson, portrait: 'images/flamma.png' });
    const expected = await compileProject(memorySource(files), []);
    expect(expected.diagnostics).toEqual([]);
    const cli = execFileSync('node', ['tools/cli/src/cli.ts', 'validate', exported], { cwd: REPO, encoding: 'utf8' });
    expect(cli).toBe(`8 records: no problems, hash ${expected.pack?.hash}.\n`);
    expect(errors).toEqual([]);
  });
});
