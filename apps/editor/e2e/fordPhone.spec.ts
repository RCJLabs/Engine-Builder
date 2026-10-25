/**
 * M6.1's gate by touch (D73, docs/specs/npcs.md#the-gate), at 360×740 and 390×844 upright and
 * 844×390 sideways: the ford played in the Play panel, turned and walked by the stick to Ada, her
 * Talk tapped on the prompt beside Jump, the stick doing nothing under the talk, its choices tapped,
 * and the horseshoe in the party's bag on the HUD. Every screen in reach. Untested for feel.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { hud, openFord, PLACED, paused, turnedTo, yawToward } from './fordHelpers.ts';
import { offered, promptButton } from './glenHelpers.ts';
import { expectFits, topScreen } from './hutScreens.ts';
import { finger, lookByTouch, near, settled, stickUntil, walked } from './walkHelpers.ts';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`the ford by touch, ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('Ada’s Talk tapped, the stick still under it, her choices tapped and the horseshoe taken', async ({
      page,
    }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      const ford = await openFord(page, true);
      await settled(page);

      await test.step('turned to Ada and walked to her by the stick: the prompt says Talk', async () => {
        const from = await walked(page);
        const want = yawToward(from.feet, PLACED.smith.at);
        await lookByTouch(page, ford, Math.round(-(want - from.yaw) / 0.3), 0);
        await stickUntil(page, ford, 40, (w) => w.feet[0] <= -1.3);
        await settled(page);
        await offered(page, 'smith');
        const prompt = promptButton(ford);
        await expect(prompt).toHaveText('Talk');
        const box = await prompt.boundingBox();
        expect(box && box.width >= 44 && box.height >= 44).toBe(true);
        await expectFits(page);
      });

      await test.step('the prompt tapped: her talk on top, the walk paused, Ada turned to the player', async () => {
        const feet = (await walked(page)).feet;
        await promptButton(ford).tap();
        await expect(topScreen(page).getByText('The ferry’s mare threw a shoe. Take her this one?')).toBeVisible();
        await expect.poll(() => paused(page)).toBe(true);
        await turnedTo(page, 'smith', yawToward(PLACED.smith.at, feet));
        // A thumb where the stick would be: under the talk, nothing walks.
        const area = await ford.boundingBox();
        if (!area) throw new Error('No view');
        const thumb = await finger(page, 1);
        await thumb.down(area.x + area.width * 0.25, area.y + area.height * 0.6);
        await thumb.move(0, -40);
        await page.waitForTimeout(600);
        await thumb.up();
        const still = await walked(page);
        expect(near(still.feet[0], feet[0], 0.001) && near(still.feet[2], feet[2], 0.001)).toBe(true);
        await expectFits(page);
      });

      await test.step('her choice and Go on tapped: the horseshoe the party’s, Ada turned back', async () => {
        await topScreen(page).getByRole('button', { name: 'I’ll take it' }).tap();
        await expect(topScreen(page).getByText('Bryn will be glad of it.')).toBeVisible();
        await topScreen(page).getByRole('button', { name: 'Go on' }).tap();
        await expect.poll(() => paused(page)).toBe(false);
        await turnedTo(page, 'smith', PLACED.smith.yaw);
        await expect(hud(page, 1, 0, 0)).toBeVisible();
        await expectFits(page);
      });
      expect(errors).toEqual([]);
    });
  });
}
