/**
 * M4.3's gate (D53) on phones: the hut's shell at /play/ by touch, at 360 and 390 px and in
 * landscape. Each of the shell's screens fits, its targets 44 px and nothing axe finds; a game
 * started in a slot, paused, and continued after a reload to the same state.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { expectFits, shellScreens } from './hutScreens.ts';
import { hutGame } from './inputHelpers.ts';
import { openTitle, pauseDialog, play, seen } from './playShellHelpers.ts';

const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`the hut's shell, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('every shell screen fits by touch, and a game paused, reloaded and continued', async ({ page }) => {
      test.setTimeout(120_000);
      const errors = watchErrors(page);
      const file = hutGame();
      const tap = async (button: import('@playwright/test').Locator) => button.tap();
      await openTitle(page, file, tap);
      await expectFits(page);
      const screens = shellScreens(page);
      await screens.getByRole('button', { name: 'New game' }).tap();
      await expect(screens.getByRole('heading', { level: 2, name: 'New game' })).toBeVisible();
      await expectFits(page);
      await screens.getByRole('button', { name: /^Slot 1/ }).tap();
      await play(page, 2, true);
      const before = await seen(page);

      await page.getByRole('button', { name: 'Pause' }).tap();
      await expect(pauseDialog(page)).toBeVisible();
      await expectFits(page);
      await pauseDialog(page).getByRole('button', { name: 'Saves' }).tap();
      await expect(screens.getByRole('button', { name: 'Load Slot 1' })).toBeVisible();
      await expectFits(page);
      await screens.getByRole('button', { name: 'Back' }).tap();
      await pauseDialog(page).getByRole('button', { name: 'Settings' }).tap();
      await expect(screens.getByRole('button', { name: 'Larger' })).toBeVisible();
      await expectFits(page);
      await screens.getByRole('button', { name: 'Back' }).tap();
      await pauseDialog(page).getByRole('button', { name: 'Resume' }).tap();
      await expect(pauseDialog(page)).toHaveCount(0);

      await page.reload();
      await openTitle(page, file, tap);
      await screens.getByRole('button', { name: /^Continue/ }).tap();
      expect(await seen(page)).toEqual(before);
      await expectFits(page);
      expect(errors).toEqual([]);
    });
  });
}
