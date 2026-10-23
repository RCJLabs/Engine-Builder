/**
 * M4.4's gate (D54), on desktop: the hut, its own screens set aside, made again in the editor from
 * stock screens alone, each by New screen, with a CC-BY image imported with its credit. Exported,
 * its screens and credits are those the templates write in Node, and it plays at /play/ to its end
 * through them: the codex holds rope back until it is bought, the credits name the image's author,
 * and the ending leads back to the title.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { expectFits, game, newGame, press, shellScreens, showJson, showPlay, topScreen } from './hutScreens.ts';
import { fixtureZip } from './kitHelpers.ts';
import { openProject, scratch, showAssets, showProject } from './ludus.ts';
import { HUT_STOCK, openPage, PNG, ROPE_CREDIT, stockHutDir, stockHutGame, stockNextPress } from './stockHut.ts';

test.use({ viewport: { width: 1280, height: 900 }, actionTimeout: 20_000 });

async function importRope(page: Page): Promise<void> {
  const panel = await showAssets(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    panel.getByRole('button', { name: 'Import files' }).click(),
  ]);
  await chooser.setFiles([{ name: 'rope.png', mimeType: 'image/png', buffer: PNG }]);
  const form = panel.getByRole('region', { name: /^Import / });
  await form.getByLabel('Licence').selectOption(ROPE_CREDIT.licence);
  await form.getByLabel(/^Made by/).fill(ROPE_CREDIT.author);
  await form.getByLabel('Where it came from').fill(ROPE_CREDIT.source);
  await form.getByRole('button', { name: 'Import 1 file' }).click();
  await expect(form).toHaveCount(0);
}

async function makeStock(page: Page): Promise<void> {
  const panel = await showPlay(page);
  for (const name of HUT_STOCK) {
    await showPlay(page);
    await panel.getByRole('button', { name: 'New screen' }).click();
    await panel.getByLabel('Template').selectOption({ label: name });
    // The name starts as the template's, so the HUD and the ending find the pages by their ids.
    await expect(panel.getByLabel('Name of the new screen')).toHaveValue(name);
    await panel.getByRole('button', { name: 'Create' }).click();
    const id = name.toLowerCase();
    const screen = page.getByRole('region', { name: `Screen ${id}` });
    await showJson(screen);
    await expect(screen.locator('.cm-content')).toContainText('"title"');
  }
  await showPlay(page);
  await expect(panel.getByRole('list').getByRole('button')).toHaveText([
    ...HUT_STOCK.map((name) => name.toLowerCase())
      .sort()
      .map((id) => new RegExp(`^${id}No problems$`)),
    /^ThemeNo problems$/,
    /^FeedbackNo problems$/,
    /^ShellNo problems$/,
  ]);
}

async function exportGame(page: Page): Promise<string> {
  await showProject(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    openProject(page).getByRole('button', { name: 'Export game' }).click(),
  ]);
  const file = join(scratch, `stock-hut-export-${Date.now()}.game.json`);
  await download.saveAs(file);
  return file;
}

test('the hut made again from stock screens in the editor, and played to its end through them', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import zip' }).click(),
  ]);
  await chooser.setFiles(fixtureZip(stockHutDir(), 'the-hut'));
  await expect(openProject(page).getByRole('heading', { name: 'The hut' })).toBeVisible();
  const panel = await showPlay(page);
  // The game's modes are known once its scripts run: the HUD and the ending are written for them.
  await panel.getByRole('button', { name: 'Run its scripts' }).click();
  await importRope(page);
  await makeStock(page);

  const file = await exportGame(page);
  const exported = JSON.parse(readFileSync(file, 'utf8'));
  const built = JSON.parse(readFileSync(await stockHutGame(), 'utf8'));
  // Format 8 since the hut's music travels with it (M4.8); its credits still format 7's.
  expect(exported.format).toBe(8);
  expect(exported.ui.screens).toEqual(built.ui.screens);
  expect(exported.credits).toEqual(built.credits);

  await page.goto('play/');
  const [player] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Open a game file' }).click(),
  ]);
  await player.setFiles(file);
  await newGame(page);
  await expect(topScreen(page).getByText(/^\d+ Coins$/)).toBeVisible();
  await expectFits(page);

  await test.step('the codex holds rope back until it is bought, then shows how many are carried', async () => {
    let codex = await openPage(page, 'Codex');
    await codex.getByRole('tab', { name: 'Items' }).click();
    await expect(codex.getByText('Not yet found')).toHaveCount(2);
    await expectFits(page);
    await codex.getByRole('button', { name: 'Close' }).click();
    await press(page, topScreen(page).getByRole('button', { name: 'Store', exact: true }));
    const shop = game(page).getByRole('dialog', { name: 'The shop' });
    await press(page, shop.getByRole('button', { name: /^Rope: \d+, 2 left$/ }));
    await expectFits(page);
    await press(page, shop.getByRole('button', { name: 'Leave' }));
    codex = await openPage(page, 'Codex');
    await codex.getByRole('tab', { name: 'Items' }).click();
    await expect(codex.getByRole('heading', { name: 'Rope' })).toBeVisible();
    await expect(codex.getByText('Carried: 1')).toBeVisible();
    await expect(codex.getByText('Not yet found')).toHaveCount(1);
    await codex.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('the credits name the image, its author and its licence', async () => {
    const credits = await openPage(page, 'Credits');
    await expect(credits.getByRole('heading', { name: 'images/rope.png' })).toBeVisible();
    await expect(credits.getByText(`${ROPE_CREDIT.author} · CC BY 4.0`)).toBeVisible();
    await expect(credits.getByText(ROPE_CREDIT.source)).toBeVisible();
    await expectFits(page);
    await credits.getByRole('button', { name: 'Close' }).click();
  });

  await test.step('the season played out through the stock screens alone, to the ending', async () => {
    const seen = new Set<string>();
    for (let step = 0; step < 400; step++) {
      const next = await stockNextPress(page);
      if (!next) break;
      if (next.title && !seen.has(next.title)) {
        seen.add(next.title);
        await expectFits(page);
      }
      await press(page, next.button);
    }
    expect([...seen].sort()).toEqual(['A talk', 'An event']);
    await expect(topScreen(page).getByText('The game is over.')).toBeVisible();
    await expect(topScreen(page).getByText(/^Quests done: \d+$/)).toBeVisible();
    await expectFits(page);
  });

  await test.step('the ending leads back to the title', async () => {
    await topScreen(page).getByRole('button', { name: 'Back to title' }).click();
    await expect(shellScreens(page).getByRole('heading', { level: 2, name: 'The hut' })).toBeVisible();
    await expect(shellScreens(page).getByRole('button', { name: /^Continue/ })).toBeVisible();
  });
  expect(errors).toEqual([]);
});
