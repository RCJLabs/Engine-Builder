/**
 * M7.1's gate by mouse and keys (D83, docs/specs/2d-scenes.md#the-gate): the keep played in the Play
 * panel at 1280 wide. It is drawn at the scale rule's whole scale, its canvas showing only the
 * palette's colours; its parallax layers move at their factors as the camera pans; the torches'
 * frames advance, and a guard sent along the wall walks with its walk clip, facing the way it goes,
 * the sim hearing it arrive; and the bell is rung by a click, then again from a new game by Tab and
 * Enter, the HUD saying so. Untested for feel.
 */
import { expect, type Page, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { expectFits, game, press } from './hutScreens.ts';
import { coloursIn, drawnItem, look, openKeep, PALETTE, stage2d, startKeep } from './keepHelpers.ts';

test.use({ viewport: { width: 1280, height: 800 } });

const RUNG = 'The watch has rung the bell.';
const UNRUNG = 'The watch hasn’t rung the bell.';

/** The frames an item shows over `ms`, read every frame or so. */
async function framesOf(page: Page, path: string, ms: number): Promise<Set<number>> {
  const seen = new Set<number>();
  const end = Date.now() + ms;
  while (Date.now() < end) {
    seen.add((await drawnItem(page, path)).frame ?? -1);
    await page.waitForTimeout(40);
  }
  return seen;
}

test('the keep at night, drawn whole, panned, walked and its bell rung by a click and by keys', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  const box = await openKeep(page);

  await test.step('drawn at the scale rule’s whole scale, only the palette’s colours on its canvas', async () => {
    const seen = await stage2d(page);
    // The box's own size, as the stage reads it: whole CSS pixels inside its border.
    const [width, height] = await box.evaluate((el) => [el.clientWidth, el.clientHeight]);
    const { scale, cols, rows, dpr } = seen.scaled;
    const fitted = Math.max(1, Math.floor(Math.min((width * dpr) / 320, (height * dpr) / 180)));
    expect(scale).toBe(fitted);
    expect(cols).toBe(Math.ceil((width * dpr) / scale));
    expect(rows).toBe(Math.ceil((height * dpr) / scale));
    const canvas = box.locator('canvas');
    await expect(canvas).toHaveCSS('image-rendering', 'pixelated');
    const colours = await coloursIn(page, canvas);
    expect([...colours.keys()].filter((c) => !PALETTE.includes(c))).toEqual([]);
    // The keep shows most of the palette at once: night, stone, flame, a guard's red.
    expect(colours.size).toBeGreaterThanOrEqual(12);
  });

  await test.step('its parallax layers move at their factors as the camera pans', async () => {
    const at = async () =>
      Object.fromEntries(
        await Promise.all(
          ['sky', 'stars', 'moon', 'ridge-far', 'ridge-near', 'gatehouse'].map(
            async (path) => [path, (await drawnItem(page, path)).at[0]] as const,
          ),
        ),
      );
    const { scaled } = await stage2d(page);
    const left = Math.ceil(scaled.cols / 2);
    await look(page, [left, 90]);
    await page.waitForTimeout(100);
    const before = await at();
    const from = (await stage2d(page)).camera[0];
    await look(page, [left + 200, 90]);
    await page.waitForTimeout(100);
    const after = await at();
    const by = (await stage2d(page)).camera[0] - from;
    expect(by).toBeGreaterThan(100);
    const moved = (path: string) => (after[path] ?? 0) - (before[path] ?? 0);
    expect(moved('sky')).toBe(by);
    expect(moved('stars')).toBe(Math.round(by * 0.95));
    expect(moved('moon')).toBe(Math.round(by * 0.9));
    expect(moved('ridge-far')).toBe(Math.round(by * 0.7));
    expect(moved('ridge-near')).toBe(Math.round(by * 0.4));
    expect(moved('gatehouse')).toBe(0);
  });

  await test.step('the torches flicker, frame by frame', async () => {
    expect((await framesOf(page, 'torch-1', 1200)).size).toBeGreaterThanOrEqual(3);
    expect((await drawnItem(page, 'torch-1')).clip).toBe('burn');
  });

  await test.step('a guard walks the wall with its walk clip, facing the way it goes, and the sim hears it arrive', async () => {
    // Aldo stands at the tower's end as the night starts; an hour on, the patrol sends him on.
    await expect
      .poll(async () =>
        (await stage2d(page)).npcsSent.some((s) => s.arrived.aldo === 'walk-w1' && s.sent === 'accepted'),
      )
      .toBe(true);
    await press(page, game(page).getByRole('button', { name: 'Wait an hour' }));
    await expect.poll(async () => (await stage2d(page)).walkers.find((w) => w.actor === 'aldo')?.goal).toBe('walk-w2');
    await expect.poll(async () => (await drawnItem(page, 'aldo')).clip).toBe('walk');
    expect((await drawnItem(page, 'aldo')).flip).toBe(false);
    const walking = await framesOf(page, 'aldo', 1000);
    expect([...walking].every((f) => f >= 2 && f <= 5)).toBe(true);
    expect(walking.size).toBeGreaterThanOrEqual(3);
    await expect
      .poll(
        async () => (await stage2d(page)).npcsSent.some((s) => s.arrived.aldo === 'walk-w2' && s.sent === 'accepted'),
        {
          timeout: 60_000,
        },
      )
      .toBe(true);
    await expect.poll(async () => (await drawnItem(page, 'aldo')).clip).toBe('idle');
  });

  await test.step('the bell rung by a click on it', async () => {
    await expect(game(page).getByText(UNRUNG)).toBeVisible();
    const bell = box.getByRole('button', { name: 'Ring the bell' });
    await bell.click();
    await expect(game(page).getByText(RUNG)).toBeVisible();
    // Said as a toast and by the announcer, each for a while: one of them is enough.
    await expect(game(page).getByText('The bell rings out over the keep.').first()).toBeAttached();
    expect((await stage2d(page)).used).toEqual([{ path: 'bell', sent: 'accepted' }]);
    await expectFits(page);
  });

  await test.step('and from a new game by the keyboard alone: Tab to it, Enter', async () => {
    await page.locator('[data-panel="play"]').getByRole('button', { name: 'Start again' }).click();
    await startKeep(page);
    await expect(game(page).getByText(UNRUNG)).toBeVisible();
    await box.focus();
    const bell = box.getByRole('button', { name: 'Ring the bell' });
    for (let i = 0; i < 6 && !(await bell.evaluate((el) => el === document.activeElement)); i++)
      await page.keyboard.press('Tab');
    await expect(bell).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(game(page).getByText(RUNG)).toBeVisible();
  });

  expect(errors).toEqual([]);
});
