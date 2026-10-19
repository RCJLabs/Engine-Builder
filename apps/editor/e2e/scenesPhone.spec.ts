/**
 * M3.11 on phones, portrait and landscape: a scene made from the Logic tab, written in the
 * inspector's sheet with CodeMirror wrapping its lines, a problem's Line button taking the cursor
 * there, and the map of its talk, a box tapped to open its line. All in reach, with nothing past
 * the screen's edge.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { kitsBox, storedText } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';

async function expectFits(page: Page, scope: string): Promise<void> {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, scope)).toEqual([]);
  await expectNoAxeIssues(page);
}

const SCENE = [
  '# name: The letter',
  'A raven lands on the gatepost with a letter in your mother’s hand, folded and unfolded many times before it was sent.',
  '* [Send the rings.]',
  '  You wrap them in the letter.',
  '* [Write back.]',
  '- The lamp gutters.',
  '-> END',
  '',
].join('\n');

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 740, height: 360 },
]) {
  test.describe(`scenes, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('a scene made and written by touch, its problem’s line and its map in reach', async ({ page }) => {
      test.setTimeout(60_000);
      const errors = watchErrors(page);
      await page.goto('./');
      await showProject(page);
      await page.getByRole('button', { name: 'New project' }).tap();
      await page.getByLabel('Name').fill('Raven');
      await page.getByRole('button', { name: 'Create' }).tap();
      await expect(openProject(page).getByRole('heading', { name: 'Raven' })).toBeVisible();
      await kitsBox(page).getByLabel('Dialogue', { exact: true }).tap();

      await page.getByRole('tab', { name: 'Logic' }).tap();
      const panel = page.locator('[data-panel="logic"]');
      await panel.getByRole('button', { name: 'New scene' }).tap();
      await panel.getByLabel('Name of the new scene').fill('Letter');
      await panel.getByRole('button', { name: 'Create' }).tap();
      const scene = page.getByRole('region', { name: 'Scene letter.ink' });
      const code = scene.locator('.cm-content');
      await expect(code).toContainText('# name: Letter');

      // Written with a construct the engine doesn't read on its third line, then the line's button taps there.
      await code.tap();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.insertText(SCENE.replace('- The lamp', '~ x = 1\n- The lamp'));
      await expect.poll(() => storedText(page, 'raven', 'scenes/letter.ink')).toContain('~ x = 1');
      await scene.getByRole('button', { name: 'Line 6', exact: true }).tap();
      await expect(scene.locator('.cm-activeLine')).toContainText('~ x = 1');
      await expectFits(page, '[data-panel="inspector"]');

      await code.tap();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.insertText(SCENE);
      const map = scene.getByRole('region', { name: 'Map of the talk' });
      await map.getByRole('button', { name: /^start-2\b/ }).tap();
      await expect(scene.locator('.cm-activeLine')).toContainText('You wrap them in the letter.');
      await expectFits(page, '[data-panel="inspector"]');
      expect(errors).toEqual([]);
    });
  });
}
