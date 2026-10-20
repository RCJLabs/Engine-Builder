/**
 * M4.2's gate (D52) on phones, portrait and landscape: the hut at /play/ by touch, with its
 * gestures. A swipe on the journal's tabs turns them, a swipe right on it closes it, and so does
 * the browser's back, as Android's back gesture would, without leaving the game. A swipe that
 * begins on a button presses nothing. Each screen, toast and log in reach, with nothing axe finds.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { expectFits, game, playSeason, press, topScreen } from './hutScreens.ts';
import { announcer, openHut, swipe } from './inputHelpers.ts';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`the hut at /play/, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('played to its end by touch, its tabs swiped and its journal closed by a swipe and by back', async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const errors = watchErrors(page);
      await openHut(page, (button) => button.tap());
      const top = topScreen(page);

      await test.step('a swipe that begins on a button presses nothing', async () => {
        const rest = top.getByRole('button', { name: 'Rest a day' });
        await rest.scrollIntoViewIfNeeded();
        await swipe(page, rest, 'right');
        await swipe(page, rest, 'left');
        await expect(game(page)).toHaveAttribute('data-turn', '0');
        await press(page, rest, true);
        await expect(announcer(page)).toHaveText(/^Day 1 begins\.$/);
        await expect(top.getByRole('log', { name: 'Lately' }).getByRole('listitem')).toHaveText(['Day 1 begins.']);
        await expectFits(page);
      });

      await test.step('the journal’s tabs turned by swipes, and the journal closed by one', async () => {
        await top.getByRole('button', { name: 'Journal' }).tap();
        const journal = game(page).getByRole('dialog', { name: 'Journal' });
        const panel = journal.getByRole('tabpanel');
        await swipe(page, panel, 'left');
        await expect(journal.getByRole('tab', { name: 'Bag' })).toHaveAttribute('aria-selected', 'true');
        await swipe(page, panel, 'left');
        await expect(journal.getByRole('tab', { name: 'Log' })).toHaveAttribute('aria-selected', 'true');
        await expect(journal.getByRole('log', { name: 'The season so far' })).toContainText('Day 1 begins.');
        await expectFits(page);
        await swipe(page, panel, 'right');
        await expect(journal.getByRole('tab', { name: 'Bag' })).toHaveAttribute('aria-selected', 'true');
        // Off the tabs, a swipe right is Back.
        await swipe(page, journal.getByRole('button', { name: 'Close the journal' }), 'right');
        await expect(journal).toHaveCount(0);
        // History goes back with it: the entry for the journal is gone.
        await expect
          .poll(() => page.evaluate(() => (history.state as { ebOpened?: number } | null)?.ebOpened ?? 0))
          .toBe(0);
      });

      await test.step('the browser’s back closes the journal and stays in the game', async () => {
        await top.getByRole('button', { name: 'Journal' }).tap();
        const journal = game(page).getByRole('dialog', { name: 'Journal' });
        await expect(journal).toBeVisible();
        await page.goBack();
        await expect(journal).toHaveCount(0);
        await expect(page.getByRole('heading', { level: 1, name: 'The hut' })).toBeVisible();
        // Closed by its own button, history goes back with it: no entry is left for a screen that's gone.
        await top.getByRole('button', { name: 'Journal' }).tap();
        await journal.getByRole('button', { name: 'Close the journal' }).tap();
        await expect(journal).toHaveCount(0);
        await expect
          .poll(() => page.evaluate(() => (history.state as { ebOpened?: number } | null)?.ebOpened ?? 0))
          .toBe(0);
      });

      await test.step('the season played to its end by touch', async () => {
        const seen = await playSeason(page, true);
        expect(seen).toContain('An event');
        await expect(topScreen(page).getByText('The hut is closed for the winter.')).toBeVisible();
        await expectFits(page);
      });
      expect(errors).toEqual([]);
    });
  });
}

test.describe('the hut at /play/, its history slow to answer', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

  test('a screen opened while the page steps history back is still one back away', async ({ page }) => {
    const errors = watchErrors(page);
    // history.go answered late, as on a slow phone: the journal is opened again before it is. The
    // page counts the steps not yet landed, so the test can wait for them.
    await page.addInitScript(() => {
      const go = history.go.bind(history);
      const slow = window as unknown as { landing: number };
      slow.landing = 0;
      history.go = (delta?: number) => {
        slow.landing++;
        setTimeout(() => {
          window.addEventListener('popstate', () => slow.landing--, { once: true });
          go(delta);
        }, 1000);
      };
    });
    await openHut(page, (button) => button.tap());
    const top = topScreen(page);
    const journal = game(page).getByRole('dialog', { name: 'Journal' });
    await top.getByRole('button', { name: 'Journal' }).tap();
    await journal.getByRole('button', { name: 'Close the journal' }).tap();
    await top.getByRole('button', { name: 'Journal' }).tap();
    await expect(journal).toBeVisible();
    // The race this is about: the journal opened again before the step back landed.
    expect(await page.evaluate(() => (window as unknown as { landing: number }).landing)).toBe(1);
    // Once the late step back lands, the journal is still open, and back closes it, in the game.
    await expect.poll(() => page.evaluate(() => (window as unknown as { landing: number }).landing)).toBe(0);
    await expect(journal).toBeVisible();
    expect(await page.evaluate(() => (history.state as { ebOpened?: number } | null)?.ebOpened)).toBe(1);
    await page.goBack();
    await expect(journal).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'The hut' })).toBeVisible();
    expect(errors).toEqual([]);
  });
});
