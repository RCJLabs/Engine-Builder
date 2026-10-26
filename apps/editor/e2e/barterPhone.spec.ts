/**
 * M6.8's gate by touch (D80, docs/specs/barter.md#the-gate), at 360×740 and 390×844 upright and
 * 844×390 sideways: the post walked by the floating stick and a look drag. The chest opened by a
 * tap on its prompt, its bread taken and put back, the candle kept; Hild's lamp bought and the
 * candle sold her on the Shop screen. Each screen fits, every line a 44 px target.
 */
import { expect, type Locator, test } from '@playwright/test';
import { hands } from './campHelpers.ts';
import { watchErrors } from './checks.ts';
import { paused } from './fordHelpers.ts';
import { expectFits, game, topScreen } from './hutScreens.ts';
import { openPost, walkSteer, walkTo } from './postHelpers.ts';
import { settled } from './walkHelpers.ts';

const tap = (button: Locator) => button.tap();

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`the post by touch, ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('the chest taken from and put into, Hild’s lamp bought and the candle sold', async ({ page }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      const yard = await openPost(page, true);
      await settled(page);
      const touch = walkSteer(page, yard, await hands(page));
      const screen = topScreen(page);

      await test.step('the chest opened by its prompt: the bread taken and put back, the candle kept', async () => {
        await walkTo(page, touch, 'chest');
        await touch.use();
        await expect(screen.getByRole('heading', { name: 'Chest' })).toBeVisible();
        await expect.poll(() => paused(page)).toBe(true);
        await expectFits(page);
        await tap(screen.getByRole('button', { name: 'Take Bread (2)' }));
        await tap(screen.getByRole('tab', { name: 'Put' }));
        await tap(screen.getByRole('button', { name: 'Put Bread (2)' }));
        await tap(screen.getByRole('tab', { name: 'Take' }));
        await tap(screen.getByRole('button', { name: 'Take Candle (1)' }));
        await expectFits(page);
        await tap(screen.getByRole('button', { name: 'Close', exact: true }));
        await expect(screen.getByRole('heading', { name: 'Chest' })).toBeHidden();
      });

      await test.step('Hild’s counter: the lamp bought, the candle sold, the screen fitting', async () => {
        await walkTo(page, touch, 'counter');
        await touch.use();
        await expect(screen.getByRole('heading', { name: "Hild's post" })).toBeVisible();
        await tap(screen.getByRole('button', { name: 'Lamp: 12, 1 left' }));
        await expect(screen.getByText('Hild has 15')).toBeVisible();
        await tap(screen.getByRole('tab', { name: 'Sell' }));
        await tap(screen.getByRole('button', { name: 'Sell Candle for 2' }));
        await expect(screen.getByText('Hild has 13')).toBeVisible();
        await expectFits(page);
        await tap(screen.getByRole('button', { name: 'Leave' }));
        await expect(game(page).getByText('Coin 10 · Day 0')).toBeVisible();
      });
      expect(errors).toEqual([]);
    });
  });
}
