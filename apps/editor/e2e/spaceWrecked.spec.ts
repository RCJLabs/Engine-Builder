/**
 * Space-Wrecked as Pages serves it (M4.12, D62): the web export `pnpm build` writes beside the
 * editor at games/space-wrecked/, played by touch on a phone held sideways and upright. From the
 * title a captain is chosen, the hangar's checklist read, a job taken from the board with its odds
 * shown, and a part fitted, each screen with nothing past the edges, no target under 44 px and
 * nothing axe finds. The export stays within its size budget. Evan's own check on a phone, from
 * the live site and installed, is the gate's last step.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { expectFits, game, newGame, press, topScreen } from './hutScreens.ts';

const EXPORT = resolve(import.meta.dirname, '../dist/games/space-wrecked');

/**
 * The web export's bytes, every file counted: set from its reading of 520,046 bytes on
 * 2026-10-23 (ROADMAP.md, Readings), with about 4% room for the content to grow.
 */
const BUDGET = 540_000;

function bytesIn(folder: string): number {
  return readdirSync(folder, { withFileTypes: true }).reduce(
    (sum, entry) =>
      sum + (entry.isDirectory() ? bytesIn(join(folder, entry.name)) : statSync(join(folder, entry.name)).size),
    0,
  );
}

const dialog = (page: Page) => game(page).getByRole('dialog');

for (const viewport of [
  { width: 844, height: 390 },
  { width: 390, height: 844 },
]) {
  test.describe(`at ${viewport.width}×${viewport.height}, by touch`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('plays from its title: a captain chosen, a job from the board, a part fitted', async ({ page }) => {
      test.setTimeout(120_000);
      const errors = watchErrors(page);
      await page.goto('games/space-wrecked/');
      await expect(page).toHaveTitle('Space-Wrecked');
      await newGame(page, (button) => button.tap());

      await expect(topScreen(page).getByText('Who were you, before the ship?')).toBeVisible();
      await expectFits(page);
      await press(page, topScreen(page).getByRole('button', { name: 'Begin Debt-bound miner' }), true);

      const hangar = topScreen(page);
      await expect(hangar.getByText('The flight checklist')).toBeVisible();
      await expect(hangar.getByText(/^Thrust \d+ for mass \d+: not enough/)).toBeVisible();
      await expectFits(page);

      await press(page, hangar.getByRole('button', { name: /^The job board/ }), true);
      await expect(dialog(page).getByRole('heading', { name: 'The job board' })).toBeVisible();
      // Each job's odds, as the fight will roll them, under its label.
      const jobs = dialog(page).getByRole('listitem').locator('button');
      await expect(jobs.first()).toContainText(/Win \d+%/);
      await expectFits(page);
      await press(page, jobs.first(), true);
      await expect(topScreen(page).getByText('Day 1')).toBeVisible();

      await topScreen(page)
        .getByRole('button', { name: /^Refit the ship/ })
        .tap();
      await expect(dialog(page).getByRole('heading', { name: 'Refit the ship' })).toBeVisible();
      await expectFits(page);
      // Its list is refits only (takes refit/*), not everything the dock offers.
      await expect(dialog(page).getByRole('listitem').first()).toBeVisible();
      for (const label of await dialog(page).getByRole('listitem').allTextContents()) {
        expect(label).toMatch(/^(Fit|Strip) /);
      }
      const fit = dialog(page).getByRole('button', { name: /^Fit / }).first();
      await expect(fit).toBeVisible();
      const free = await dialog(page)
        .getByText(/hull space free/)
        .textContent();
      await press(page, fit, true);
      await expect(dialog(page).getByText(/hull space free/)).not.toHaveText(free ?? '');
      await dialog(page).getByRole('button', { name: 'Done' }).tap();
      expect(errors).toEqual([]);
    });
  });
}

// The editor's worker answers every navigation in its scope with the editor, unless told not to.
test('opens beside an installed editor, not as the editor', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await page.goto('games/space-wrecked/');
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'the worker saw this load').toBe(true);
  await expect(page).toHaveTitle('Space-Wrecked');
  await expect(page.getByRole('button', { name: 'New game' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the web export stays within its size budget', () => {
  expect(bytesIn(EXPORT)).toBeLessThanOrEqual(BUDGET);
});
