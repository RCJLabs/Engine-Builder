/**
 * M3.2 on phones, portrait and landscape: a game started from the Logic tab, its script in the
 * inspector's sheet with CodeMirror wrapping its lines, Run's report, and every control in reach.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { openProject, showProject } from './ludus.ts';

async function expectFits(page: Page, scope: string): Promise<void> {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, scope)).toEqual([]);
  await expectNoAxeIssues(page);
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 740, height: 360 },
]) {
  test.describe(`scripts, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('a game started by touch, its script in the inspector’s sheet, and Run, all in reach', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('./');
      await showProject(page);
      await page.getByRole('button', { name: 'New project' }).tap();
      await page.getByLabel('Name').fill('Tide');
      await page.getByRole('button', { name: 'Create' }).tap();
      await expect(openProject(page).getByRole('heading', { name: 'Tide' })).toBeVisible();
      await page.getByRole('tab', { name: 'Logic' }).tap();
      const panel = page.locator('[data-panel="logic"]');
      await panel.getByRole('button', { name: 'Start a game' }).tap();
      const game = page.getByRole('region', { name: 'Script game.ts' });
      await expect(game.locator('.cm-content')).toContainText('export const modules = [main];');
      // The longest line wraps inside the editor rather than running off the screen.
      await expectFits(page, '[data-panel="inspector"]');

      // In portrait the inspector's sheet covers the Logic tab until it is lowered; in landscape
      // the inspector took the side zone, which Logic shares.
      const lower = page.getByRole('button', { name: 'Inspector' });
      if (await lower.isVisible()) await lower.tap();
      else await page.getByRole('tab', { name: 'Logic' }).tap();
      await expect(panel.getByText('The game: main, starting in play; 2 actions; bots worker.')).toBeVisible();
      await panel.getByRole('button', { name: 'Run 20 games' }).tap();
      await expect(panel.locator('.logic-report')).toContainText('tide: 20 runs with the worker policy');
      await expectFits(page, '[data-panel="logic"]');
      expect(errors).toEqual([]);
    });
  });
}
