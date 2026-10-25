/**
 * M6.2's gate in the editor (D74, docs/specs/navigation.md#the-gate), at 1280 and 390 wide: the
 * square opened in the Scene panel, its navmesh drawn by Show navigation; stall 1 moved in the
 * inspector, and W147 in the Problems panel and the Navigation row; Bake navigation pressed, a new
 * .nav stored with its new hash, and the warning gone from both.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { press, showInspector, showOutliner } from './componentHelpers.ts';
import { fixtureZip, storedText } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';
import { outlinerRow, scenePanel, showScene, viewStarted } from './spaceHelpers.ts';
import { SQUARE } from './squareHelpers.ts';

const FOLDER = 'square';
const STALE = "Baked before the space's solids or terrain last changed: press Bake navigation again";

/** The Problems panel: a tab beside the Console on desktop, a tab of the phone's own too. */
async function showProblems(page: Page, touch: boolean): Promise<Locator> {
  await press(page.getByRole('tab', { name: /^Problems/ }), touch);
  const panel = page.locator('[data-panel="problems"]');
  await expect(panel.getByRole('heading', { name: 'Problems' })).toBeVisible();
  return panel;
}

/**
 * The Scene toolbar's Navigation row, open: on a phone the Scene panel comes back from More with its
 * rows shut, and the inspector's sheet is folded down off the toolbar first.
 */
async function navRow(page: Page, touch: boolean): Promise<Locator> {
  await showScene(page);
  const handle = page.locator('.sheet-handle');
  if ((await handle.isVisible()) && (await handle.getAttribute('aria-expanded')) === 'true') await handle.tap();
  const toggle = scenePanel(page).getByRole('button', { name: 'Navigation', exact: true });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await press(toggle, touch);
  return scenePanel(page).locator('fieldset.scene-terrain');
}

/** The hash a .nav file's header carries: 16 hex digits after "EBNV" and its version. */
const hashOf = async (page: Page) => (await storedText(page, FOLDER, 'spaces/square.nav'))?.slice(5, 21) ?? null;

const drawnNav = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __ebViewport?: { nav(): { polygons: number } | null } }).__ebViewport?.nav() ?? null,
  );

for (const [width, height, touch] of [
  [1280, 800, false],
  [390, 844, true],
] as const) {
  test.describe(`the square’s navmesh in the editor, ${width} wide`, () => {
    test.use({ viewport: { width, height }, ...(touch ? { hasTouch: true, isMobile: true } : {}) });

    test('a stall moved, W147 shown, the navmesh baked again and the warning gone', async ({ page }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      await page.goto('./');
      await showProject(page);
      const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        press(page.getByRole('button', { name: 'Import zip' }), touch),
      ]);
      await chooser.setFiles(fixtureZip(SQUARE, 'square'));
      await expect(openProject(page).getByRole('heading', { name: 'The square' })).toBeVisible();
      const baked = await hashOf(page);
      expect(baked).toMatch(/^[0-9a-f]{16}$/);

      const panel = await showScene(page);
      await press(panel.getByRole('button', { name: /^The square \(square\)/ }), touch);
      await viewStarted(page);
      await test.step('Navigation shows the navmesh baked from the space as it is', async () => {
        const row = await navRow(page, touch);
        await expect(row.getByRole('status')).toHaveText('Baked from the space as it is.');
        await press(row.getByRole('button', { name: 'Show navigation' }), touch);
        await expect.poll(async () => (await drawnNav(page))?.polygons ?? 0).toBe(135);
      });

      await test.step('stall 1 moved 2 m: W147, in the Problems panel and the row', async () => {
        const outliner = await showOutliner(page, touch);
        await press(outlinerRow(outliner, 'Stall 1'), touch);
        const form = await showInspector(page, touch);
        const z = form.getByRole('group', { name: 'Place, in metres' }).getByLabel('z', { exact: true });
        await z.fill('4');
        await z.press('Enter');
        const problems = await showProblems(page, touch);
        await expect(problems.getByText(STALE)).toBeVisible();
        const row = await navRow(page, touch);
        await expect(row.getByRole('status')).toHaveText(
          'Baked before the solids or terrain last changed: bake it again.',
        );
      });

      await test.step('Bake navigation: a new .nav, and the warning gone', async () => {
        const row = await navRow(page, touch);
        await press(row.getByRole('button', { name: 'Bake navigation' }), touch);
        await expect(row.getByRole('status')).toHaveText(/^Baked in \d+ ms: 1 tile, \d+ polygons\.$/, {
          timeout: 30_000,
        });
        await expect.poll(() => hashOf(page)).not.toBe(baked);
        const problems = await showProblems(page, touch);
        await expect(problems.getByText(STALE)).toHaveCount(0);
        await expect(page.getByRole('tab', { name: /^Problems/ })).toHaveText('Problems');
      });
      expect(errors).toEqual([]);
    });
  });
}
