/**
 * M4.1's gate (D51), on desktop: the hut played in the editor's Play panel through its own
 * screens, a talk, the store, the journal and the storm each drawn as the screens say, every
 * button one the game offers; then exported as a game file and played in the player page at
 * /play/, which opens again offline. Each screen in reach, with nothing past the edges and nothing
 * axe finds.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { expectFits, game, playSeason, press, startHut, topScreen } from './hutScreens.ts';
import { openProject, scratch, showProject } from './ludus.ts';

test.use({ viewport: { width: 1280, height: 900 }, actionTimeout: 20_000 });

test('the hut played in the Play panel through its screens, to the end of its season', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await startHut(page);
  const top = topScreen(page);
  await expect(top.getByText(/^30 coins$/)).toBeVisible();
  // A button names an action on offer: closing is not, until the season ends.
  await expect(top.getByRole('button', { name: 'Close the hut for the winter' })).toHaveCount(0);
  await expectFits(page);

  await test.step('a talk, over the hut', async () => {
    await press(page, top.getByRole('button', { name: 'Visit Greta' }));
    const talk = game(page).getByRole('dialog', { name: 'A talk' });
    await expect(talk.getByText('The season up here is short.', { exact: false })).toBeVisible();
    await expect(talk.getByRole('button', { name: 'Go on' })).toBeDisabled();
    await expectFits(page);
    await press(page, talk.getByRole('button', { name: 'Ask about the guild' }));
    await expect(talk.getByText(/^Anselm leads their parties/)).toBeVisible();
    await press(page, talk.getByRole('button', { name: 'Go on' }));
    await expect(talk).toHaveCount(0);
  });

  await test.step('the store: bought, then sold back', async () => {
    await press(page, top.getByRole('button', { name: 'Open the store' }));
    const store = game(page).getByRole('dialog', { name: 'The store' });
    await expect(store.getByText('The hut’s store')).toBeVisible();
    await press(page, store.getByRole('button', { name: /^Rope: \d+ coins, 2 left$/ }));
    await expect(store.getByRole('button', { name: /^Rope: \d+ coins, 1 left$/ })).toBeVisible();
    await store.getByRole('tab', { name: 'Sell' }).click();
    await expect(store.getByRole('tab', { name: 'Sell' })).toHaveAttribute('aria-selected', 'true');
    // The store buys nothing back (its record has no buy list), so the sim offers no sale: the
    // button is drawn, with no price, and can't be pressed.
    await expect(store.getByRole('button', { name: 'Sell Rope for — coins' })).toBeDisabled();
    await expectFits(page);
    await press(page, store.getByRole('button', { name: 'Leave the store' }));
    await expect(store).toHaveCount(0);
  });

  await test.step('the journal, opened and closed by its buttons', async () => {
    await top.getByRole('button', { name: 'Journal' }).click();
    const journal = game(page).getByRole('dialog', { name: 'Journal' });
    await expect(journal.getByText('Loads for the village')).toBeVisible();
    await expect(journal.getByText('Carry five loads up (0/5)')).toBeVisible();
    await journal.getByRole('tab', { name: 'Bag' }).click();
    await expect(journal.getByText('Rope ×1')).toBeVisible();
    await expectFits(page);
    await journal.getByRole('button', { name: 'Close the journal' }).click();
    await expect(journal).toHaveCount(0);
  });

  await test.step('the season played out: the storm and the evening come, and the hut closes', async () => {
    const seen = await playSeason(page);
    expect(seen).toContain('An event');
    expect(seen).toContain('A talk');
    await expect(topScreen(page).getByText('The hut is closed for the winter.')).toBeVisible();
    await expectFits(page);
  });
  expect(errors).toEqual([]);
});

test('the hut exported as a game file and played at /play/, which opens again offline', async ({ page, context }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await startHut(page);
  await showProject(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    openProject(page).getByRole('button', { name: 'Export game' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('the-hut-0.1.0.game.json');
  const file = join(scratch, `the-hut-${Date.now()}.game.json`);
  await download.saveAs(file);
  expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ format: 4, project: { id: 'the-hut' } });

  await page.goto('play/');
  await expect(page.getByRole('heading', { level: 1, name: 'Play a game' })).toBeVisible();
  await expectFits(page);
  const open = async () => {
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: /^Open (a game file|another game)$/ }).click(),
    ]);
    await chooser.setFiles(file);
    await expect(page.getByRole('heading', { level: 1, name: 'The hut' })).toBeVisible();
  };
  await open();
  await expect(game(page).getByText(/^Day \d+ of 10$/)).toBeVisible();
  await press(page, topScreen(page).getByRole('button', { name: 'Visit Anselm' }));
  await expect(game(page).getByRole('dialog', { name: 'A talk' })).toBeVisible();
  await expectFits(page);

  // Offline, once the service worker holds the page: it opens and plays from the cache.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Play a game' })).toBeVisible();
  await open();
  await press(page, topScreen(page).getByRole('button', { name: 'Rest a day' }));
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test('a file that isn’t a game says so at /play/', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('play/');
  const bad = join(scratch, `not-a-game-${Date.now()}.json`);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(bad, JSON.stringify({ format: 4, project: { id: 'x' } }));
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Open a game file' }).click(),
  ]);
  await chooser.setFiles(bad);
  await expect(page.getByRole('alert')).toHaveText(
    'This isn’t a game file Engine-Builder can play: The pack project has no name.',
  );
  expect(errors).toEqual([]);
});
