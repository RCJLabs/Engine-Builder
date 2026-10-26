/**
 * M6.4's gate by touch (D76, docs/specs/combat.md#the-gate), at 360×740 and 390×844 upright and
 * 844×390 sideways: the camp fought in the Play panel with the floating stick, a look drag and the
 * Attack button above Jump. Each bandit turned to and struck by taps until all three lie, each body
 * searched by tapping its prompt, and a tap on the HUD's Take the bow. Every target 44 px, nothing
 * off the screen. Untested for feel.
 */
import { expect, test } from '@playwright/test';
import {
  BANDITS,
  fallenOf,
  fightUntil,
  fought,
  hands,
  hitsBy,
  hudOf,
  openCamp,
  searchAll,
  touchSteer,
} from './campHelpers.ts';
import { watchErrors } from './checks.ts';
import { expectFits, game } from './hutScreens.ts';
import { settled } from './walkHelpers.ts';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`the camp by touch, ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('each bandit struck by the Attack button, each body searched by its prompt', async ({ page }) => {
      test.setTimeout(400_000);
      const errors = watchErrors(page);
      const camp = await openCamp(page, true);
      await settled(page);
      const attack = camp.getByRole('button', { name: 'Attack' });
      const fingers = await hands(page);
      const touch = touchSteer(page, camp, fingers);

      await test.step('the Attack button shows with the stick, above Jump, and fits', async () => {
        await touch.walk(300);
        await expect(attack).toBeVisible();
        const [a, jump] = await Promise.all([
          attack.boundingBox(),
          camp.getByRole('button', { name: 'Jump' }).boundingBox(),
        ]);
        expect(a && jump && a.y + a.height <= jump.y).toBe(true);
        await expectFits(page);
      });

      await test.step('each bandit turned to and struck by taps until all three lie', async () => {
        await fightUntil(page, touch, (seen) => fallenOf(seen.fight).length === BANDITS.length);
        expect(hitsBy(await fought(page), 'hero').length).toBeGreaterThanOrEqual(BANDITS.length);
        await expect(game(page).getByText(/^Down 3 of 3 · Rook 0 · Crow 0 · Wren 0$/)).toBeVisible();
        console.info(`the camp by touch at ${viewport.width}: the HUD at ${await hudOf(page)}`);
      });

      await test.step('each body searched by tapping its prompt', async () => {
        await searchAll(page, touch, (button) => button.tap());
        await expect.poll(() => hudOf(page)).toMatch(/ · Coin 5$/);
        await expectFits(page);
      });

      await test.step('Take the bow tapped on the HUD', async () => {
        await fingers.tap(game(page).getByRole('button', { name: 'Take the bow' }));
        await expect.poll(async () => (await fought(page)).weapon).toBe('bow');
      });
      await fingers.close();
      expect(errors).toEqual([]);
    });
  });
}
