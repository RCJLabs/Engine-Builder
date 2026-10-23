/**
 * M4.10's gate on phones, portrait and landscape: the Project panel's Export section set up and
 * used by touch, in reach with nothing past the edges and nothing axe finds; and the hut exported
 * as one file, opened at the phone's size and played by touch.
 */
import { expect, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { exportFile, exportReport, exportSection, importHut } from './exportHelpers.ts';
import { expectFits, game, newGame, press, shellScreens, topScreen } from './hutScreens.ts';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`export, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('Export set up and used by touch, and the hut’s single file played at this size', async ({
      page,
      context,
    }) => {
      test.setTimeout(150_000);
      const errors = watchErrors(page);
      await importHut(page);
      const section = exportSection(page);
      await section.getByRole('button', { name: 'Set up export' }).tap();
      await expect(section.getByRole('group', { name: 'Targets (optional)' })).toBeVisible();
      await section.getByRole('textbox', { name: 'Short name (optional)', exact: true }).fill('Hut');
      await section.scrollIntoViewIfNeeded();
      await expectNothingOffscreen(page);
      expect(await smallTargets(page, '.project-export')).toEqual([]);
      await expectNoAxeIssues(page);

      const file = await exportFile(page, 'Export file', true);
      await expect(exportReport(page)).toBeVisible();
      await expectNothingOffscreen(page);
      expect(errors).toEqual([]);

      const played = await context.newPage();
      const playedErrors = watchErrors(played);
      await played.goto(`file://${file}`);
      await expect(shellScreens(played).getByRole('heading', { name: 'The hut' })).toBeVisible();
      await expectFits(played);
      await newGame(played, (button) => button.tap());
      await expect(game(played).getByText(/^Day 0 of 10$/)).toBeVisible();
      await press(played, topScreen(played).getByRole('button', { name: 'Carry a load up' }), true);
      await expectFits(played);
      expect(playedErrors).toEqual([]);
    });
  });
}
