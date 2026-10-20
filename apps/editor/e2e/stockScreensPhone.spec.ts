/**
 * M4.4's gate (D54) on phones: the hut on stock screens alone, built as New screen writes them, at
 * /play/ by touch at 360 and 390 px and in landscape. Each stock screen fits the first time it
 * shows, with no target under 44 px and nothing axe finds, and the season is played to its ending.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { expectFits, newGame, press, topScreen } from './hutScreens.ts';
import { openPage, stockHutGame, stockNextPress } from './stockHut.ts';

const VIEWPORTS = [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`the hut on stock screens, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('each stock screen fits by touch, and the season is played to its ending', async ({ page }) => {
      test.setTimeout(240_000);
      const errors = watchErrors(page);
      const tap = async (button: import('@playwright/test').Locator) => button.tap();
      await page.goto('play/');
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', { name: 'Open a game file' }).tap(),
      ]);
      await chooser.setFiles(await stockHutGame());
      await newGame(page, tap);
      await expectFits(page);
      for (const name of ['Inventory', 'Journal', 'Codex', 'Credits']) {
        const opened = await openPage(page, name, tap);
        await expectFits(page);
        await opened.getByRole('button', { name: 'Close' }).tap();
      }
      await press(page, topScreen(page).getByRole('button', { name: 'Store', exact: true }), true);
      await expectFits(page);
      const seen = new Set<string>(['The shop']);
      for (let step = 0; step < 400; step++) {
        const next = await stockNextPress(page);
        if (!next) break;
        if (next.title && !seen.has(next.title)) {
          seen.add(next.title);
          await expectFits(page);
        }
        await press(page, next.button, true);
      }
      expect([...seen].sort()).toEqual(['A talk', 'An event', 'The shop']);
      await expect(topScreen(page).getByText('The game is over.')).toBeVisible();
      await expectFits(page);
      expect(errors).toEqual([]);
    });
  });
}
