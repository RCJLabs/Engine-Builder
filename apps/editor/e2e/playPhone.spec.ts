/**
 * M4.1's gate on phones, portrait and landscape: the hut started in the Play panel behind More and
 * played to its end by touch through its screens, a talk, the store and the journal drawn over the
 * hut, each screen in reach with nothing past the edges and nothing axe finds; and the player page
 * at /play/ with the hut in play.
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { HUT } from './hutHelpers.ts';
import { expectFits, game, playSeason, press, startHut, topScreen } from './hutScreens.ts';
import { REPO, scratch } from './ludus.ts';

/** The hut as a game file, as `eb build` writes it: the pack Export game writes too. */
function hutGame(): string {
  const file = join(scratch, `the-hut-${Date.now()}.game.json`);
  execFileSync('node', ['tools/cli/src/cli.ts', 'build', HUT, '--out', file], { cwd: REPO });
  return file;
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`the hut, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('played to its end by touch through its screens in the Play panel, every screen in reach', async ({
      page,
    }) => {
      test.setTimeout(120_000);
      const errors = watchErrors(page);
      await startHut(page);
      await expectFits(page);
      const top = topScreen(page);
      await press(page, top.getByRole('button', { name: 'Visit Greta' }), true);
      const talk = game(page).getByRole('dialog', { name: 'A talk' });
      await expect(talk.getByRole('button', { name: 'Thank her' })).toBeVisible();
      await expectFits(page);
      await press(page, talk.getByRole('button', { name: 'Thank her' }), true);
      await expect(talk).toHaveCount(0);
      await press(page, top.getByRole('button', { name: 'Open the store' }), true);
      const store = game(page).getByRole('dialog', { name: 'The store' });
      await expect(store.getByRole('tab', { name: 'Buy' })).toBeVisible();
      await expectFits(page);
      await press(page, store.getByRole('button', { name: 'Leave the store' }), true);
      await top.getByRole('button', { name: 'Journal' }).tap();
      const journal = game(page).getByRole('dialog', { name: 'Journal' });
      await expect(journal).toBeVisible();
      await expectFits(page);
      await journal.getByRole('button', { name: 'Close the journal' }).tap();
      const seen = await playSeason(page, true);
      expect(seen).toContain('An event');
      await expect(topScreen(page).getByText('The hut is closed for the winter.')).toBeVisible();
      await expectFits(page);
      expect(errors).toEqual([]);
    });

    test('the player page, before a game is open and with the hut in play', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('play/');
      await expect(page.getByRole('heading', { level: 1, name: 'Play a game' })).toBeVisible();
      await expectFits(page);
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', { name: 'Open a game file' }).tap(),
      ]);
      await chooser.setFiles(hutGame());
      await expect(page.getByRole('heading', { level: 1, name: 'The hut' })).toBeVisible();
      await expectFits(page);
      await press(page, topScreen(page).getByRole('button', { name: 'Visit Anselm' }));
      await expect(game(page).getByRole('dialog', { name: 'A talk' })).toBeVisible();
      await expectFits(page);
      expect(errors).toEqual([]);
    });
  });
}
