/**
 * M7.3's gate by mouse and keys (D85, docs/specs/rooms.md#the-gate): the tower played in the Play panel at
 * 1280 wide. Its building is drawn at the scale rule's whole scale in the palette's colours alone, each
 * room's sprite across its slots and the ladders up their floors; its folk walk their floors and climb
 * only at the stairs; the bell rings by a click, all three come down to the hall and the HUD's line
 * follows the warden; and again from a new game by Tab and Enter. Untested for feel.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { expectFits, game } from './hutScreens.ts';
import { coloursIn, PALETTE, stage2d } from './keepHelpers.ts';
import { building, climbs, folk, openTower, startTower, watchFolk } from './towerHelpers.ts';

test.use({ viewport: { width: 1280, height: 800 } });

const QUIET = 'The bell hasn’t rung.';
const RUNG = 'The bell has rung.';

test('the tower drawn by its rooms, its folk climbing its stairs, and the bell by a click and by keys', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  const box = await openTower(page);

  await test.step('drawn at the scale rule’s whole scale, only the palette’s colours, each room across its slots', async () => {
    const seen = await stage2d(page);
    const [width, height] = await box.evaluate((el) => [el.clientWidth, el.clientHeight]);
    const { scale, dpr } = seen.scaled;
    expect(scale).toBe(Math.max(1, Math.floor(Math.min((width * dpr) / 208, (height * dpr) / 176))));
    const colours = await coloursIn(page, box.locator('canvas'));
    expect([...colours.keys()].filter((c) => !PALETTE.includes(c))).toEqual([]);
    const shown = [...colours.values()].reduce((sum, n) => sum + n, 0);
    // The rooms' back walls, drawn by the stage: 12.0% of the view at 1280 (2026-10-27), where the sky, the
    // ridges, the battlements and the figures alone show little of it.
    expect((colours.get('#3b3c4f') ?? 0) / shown).toBeGreaterThan(0.06);
    const tower = await building(page);
    expect(tower?.path).toBe('tower');
    const of = (id: string) => tower?.pieces.filter((p) => p.of === id) ?? [];
    expect(of('crypt').map((p) => [p.sprite, p.box.x, p.box.y, p.box.w])).toEqual([['room-crypt', 112, 16, 48]]);
    // The hall's sprite is two slots wide; the watch room's one, so it is drawn twice across its two.
    expect(of('hall').map((p) => [p.sprite, p.box.w])).toEqual([['room-hall', 96]]);
    expect(of('watch').map((p) => p.box.x)).toEqual([112, 160]);
    // Each ladder is four of its 8-pixel frames up a floor of 32.
    expect(of('stair 1').map((p) => [p.box.x, p.box.y])).toEqual([
      [192, 48],
      [192, 56],
      [192, 64],
      [192, 72],
    ]);
  });

  await test.step('the folk walk their floors and climb only at the stairs', async () => {
    await expect(game(page).getByText('The warden is in the chapel.')).toBeVisible();
    await expect
      .poll(async () => new Set((await folk(page)).find((f) => f.actor === 'wynn')?.floors?.map((p) => p[0])).size, {
        timeout: 60_000,
      })
      .toBeGreaterThan(1);
    for (const f of await folk(page)) if (f.floors) expect(climbs(f.floors), f.actor).toBe(true);
    expect(await watchFolk(page, 40)).toEqual([]);
    await expect(game(page).getByText('The warden is in the crypt.')).toBeVisible({ timeout: 90_000 });
  });

  await test.step('the bell rung by a click: all three to the hall, the HUD following the warden', async () => {
    await expect(game(page).getByText(QUIET)).toBeVisible();
    await box.getByRole('button', { name: 'Ring the bell' }).click();
    await expect(game(page).getByText(RUNG)).toBeVisible();
    await expect(game(page).getByText('The bell rings, and the tower comes down to the hall.').first()).toBeAttached();
    await expect(game(page).getByText('The warden is in the hall.')).toBeVisible({ timeout: 90_000 });
    await expect
      .poll(async () => (await folk(page)).filter((f) => f.at[1] === 48 && !f.moving).length, { timeout: 90_000 })
      .toBe(3);
    expect(await watchFolk(page, 10)).toEqual([]);
    await expectFits(page);
  });

  await test.step('and from a new game by the keyboard alone: Tab to it, Enter', async () => {
    await page.locator('[data-panel="play"]').getByRole('button', { name: 'Start again' }).click();
    await startTower(page);
    await expect(game(page).getByText(QUIET)).toBeVisible();
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
