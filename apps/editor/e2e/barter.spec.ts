/**
 * M6.8's gate by keys and the mouse (D80, docs/specs/barter.md#the-gate): the post played in the Play
 * panel. The chest opened by E: its bread taken and put back, its candle kept, and closed. Hild's
 * counter: a lamp bought from her bag into her purse, the candle sold her from it. The lamp put in
 * the empty barrel. Read through the screens the game draws and window.__ebWalk.
 */
import { expect, test } from '@playwright/test';
import { keySteer } from './campHelpers.ts';
import { watchErrors } from './checks.ts';
import { paused } from './fordHelpers.ts';
import { game, topScreen } from './hutScreens.ts';
import { buttons, openPost, walkTo } from './postHelpers.ts';
import { settled } from './walkHelpers.ts';

test('the post by keys: a line taken from the chest and one put back, Hild’s lamp bought and the candle sold', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  const yard = await openPost(page);
  await yard.focus();
  await settled(page);
  const keys = keySteer(page, yard);
  const screen = topScreen(page);

  await test.step('the chest opened by E: the bread taken and put back, the candle kept', async () => {
    await walkTo(page, keys, 'chest');
    await page.keyboard.press('KeyE');
    await expect(screen.getByRole('heading', { name: 'Chest' })).toBeVisible();
    // The walk stops under the screen, as under a talk.
    await expect.poll(() => paused(page)).toBe(true);
    await screen.getByRole('button', { name: 'Take Bread (2)' }).click();
    await screen.getByRole('tab', { name: 'Put' }).click();
    await screen.getByRole('button', { name: 'Put Bread (2)' }).click();
    await screen.getByRole('tab', { name: 'Take' }).click();
    expect(await buttons(screen.getByRole('tabpanel'))).toEqual(['Take Bread (2)', 'Take Candle (1)']);
    await screen.getByRole('button', { name: 'Take Candle (1)' }).click();
    await screen.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(screen.getByRole('heading', { name: 'Chest' })).toBeHidden();
    await expect.poll(() => paused(page)).toBe(false);
  });

  await test.step('Hild’s counter: a lamp bought into her purse, the candle sold her from it', async () => {
    await yard.focus();
    await walkTo(page, keys, 'counter');
    await page.keyboard.press('KeyE');
    await expect(screen.getByRole('heading', { name: "Hild's post" })).toBeVisible();
    await expect(screen.getByText('Hild has 3')).toBeVisible();
    await screen.getByRole('button', { name: 'Lamp: 12, 1 left' }).click();
    await expect(screen.getByText('Hild has 15')).toBeVisible();
    await screen.getByRole('tab', { name: 'Sell' }).click();
    await screen.getByRole('button', { name: 'Sell Candle for 2' }).click();
    await expect(screen.getByText('Hild has 13')).toBeVisible();
    await screen.getByRole('button', { name: 'Leave' }).click();
    await expect(game(page).getByText('Coin 10 · Day 0')).toBeVisible();
    await expect(game(page).getByText('Hild has 13 coin')).toBeVisible();
  });

  await test.step('the lamp put in the empty barrel', async () => {
    await yard.focus();
    await walkTo(page, keys, 'barrel');
    await page.keyboard.press('KeyE');
    await expect(screen.getByRole('heading', { name: 'Barrel' })).toBeVisible();
    await expect(screen.getByText('It is empty.')).toBeVisible();
    await screen.getByRole('tab', { name: 'Put' }).click();
    await screen.getByRole('button', { name: 'Put Lamp (1)' }).click();
    await screen.getByRole('tab', { name: 'Take' }).click();
    await expect(screen.getByRole('button', { name: 'Take Lamp (1)' })).toBeVisible();
    await screen.getByRole('button', { name: 'Close', exact: true }).click();
  });
  expect(errors).toEqual([]);
});
