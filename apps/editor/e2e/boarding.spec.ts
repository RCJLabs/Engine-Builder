/**
 * M7.4's gate by mouse and keys (D86, docs/specs/stages.md#the-gate): the boarding deck played in the
 * Play panel at 1280 wide, drawn by Space-Wrecked's battle board as a stage in its worker. Its frames
 * are counted by the hook and the board's own colours are on the canvas; the crew walk their rounds;
 * the board turns by a drag, the arrow keys and the wheel, the alarm's button going with its tile; the
 * alarm sounds by a click, the HUD showing its SVG; and again from a new game by Tab and Enter.
 * Untested for feel.
 */
import { expect, test } from '@playwright/test';
import {
  code,
  expectBoardColours,
  moved,
  openBoarding,
  QUIET,
  rectOf,
  SOUNDING,
  startBoarding,
} from './boardingHelpers.ts';
import { watchErrors } from './checks.ts';
import { walkers } from './deckHelpers.ts';
import { expectFits, game } from './hutScreens.ts';

test.use({ viewport: { width: 1280, height: 800 } });

test('the deck drawn by Space-Wrecked’s battle board, turned by the mouse and keys, and the alarm sounded', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  const box = await openBoarding(page);
  const canvas = box.locator('canvas.eb-stage-canvas');
  const alarm = box.getByRole('button', { name: 'Sound the alarm' });

  await test.step('drawn in its worker: frames counted, Space-Wrecked’s colours on the canvas', async () => {
    const first = (await code(page))?.frames ?? 0;
    await expect.poll(async () => (await code(page))?.frames ?? 0).toBeGreaterThan(first + 10);
    const seen = await code(page);
    expect(seen).toMatchObject({ stage: 'battle', boxed: ['alarm'], unboxed: [] });
    expect(seen?.error).toBeUndefined();
    await expectBoardColours(page, canvas);
  });

  await test.step('the crew walking their rounds', async () => {
    const at = async () => (await walkers(page)).map((w) => `${w.actor} ${w.at.join(',')}`).join('; ');
    const before = await at();
    await expect.poll(at, { timeout: 30_000 }).not.toBe(before);
    expect((await walkers(page)).map((w) => w.actor).sort()).toEqual(['ines', 'oren']);
  });

  await test.step('the board turned by a drag, the arrow keys and the wheel, the alarm’s button with it', async () => {
    const area = await rectOf(canvas);
    let before = await rectOf(alarm);
    // A press away from the button, so it is the canvas's.
    const from: [number, number] = [area.x + area.width * 0.12, area.y + area.height * 0.88];
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(from[0] + 80, from[1] - 20, { steps: 10 });
    await page.mouse.up();
    before = await moved(alarm, before);
    await expect(canvas).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    before = await moved(alarm, before);
    await page.keyboard.press('ArrowUp');
    before = await moved(alarm, before);
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    await page.mouse.wheel(0, -240);
    await moved(alarm, before);
    expect((await code(page))?.boxed).toEqual(['alarm']);
  });

  await test.step('the alarm sounded by a click, the HUD showing its SVG', async () => {
    await expect(game(page).getByText(QUIET)).toBeVisible();
    const hud = game(page).getByRole('img', { name: 'The alarm' });
    await expect(hud).toBeHidden();
    await alarm.click();
    await expect(game(page).getByText(SOUNDING)).toBeVisible();
    await expect(hud).toBeVisible();
    expect(await hud.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    // Decoded: an SVG that failed to load would be shown with no size of its own.
    await expect.poll(() => hud.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(24);
    await expectFits(page);
  });

  await test.step('and from a new game by the keyboard alone: Tab to it, Enter', async () => {
    await page.locator('[data-panel="play"]').getByRole('button', { name: 'Start again' }).click();
    await startBoarding(page);
    await expect(game(page).getByText(QUIET)).toBeVisible();
    await canvas.focus();
    for (let i = 0; i < 6 && !(await alarm.evaluate((el) => el === document.activeElement)); i++)
      await page.keyboard.press('Tab');
    await expect(alarm).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(game(page).getByText(SOUNDING)).toBeVisible();
  });

  expect(errors).toEqual([]);
});
