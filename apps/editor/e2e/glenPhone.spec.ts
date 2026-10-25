/**
 * M5.9's gate by touch (D71, docs/specs/worldspaces.md#the-gate), at 360×740 and 390×844 upright and
 * 844×390 sideways: the glen played in the Play panel, the rope taken by tapping the prompt, which is
 * the touch button beside Jump, the stick walked to the bothy's door and the prompt tapped again, and
 * a pause, a quit and Continue that put the player back in the bothy where they stood. Every screen in
 * reach, the prompt a 44 px target and more. Untested for feel.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { acted, offered, openGlen, promptButton } from './glenHelpers.ts';
import { expectFits, game, shellScreens } from './hutScreens.ts';
import { pauseDialog } from './playShellHelpers.ts';
import { drawing, lookByTouch, near, settled, stickUntil, walked } from './walkHelpers.ts';

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`the glen by touch, ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('the prompt tapped takes the rope and opens the door, and a load puts the player back', async ({ page }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      const glen = await openGlen(page, true);
      await settled(page);

      await test.step('the prompt is the touch button beside Jump, with no key named', async () => {
        await offered(page, 'rope');
        const prompt = promptButton(glen);
        await expect(prompt).toHaveText('Take');
        const jump = glen.getByRole('button', { name: 'Jump' });
        const [at, beside] = [await prompt.boundingBox(), await jump.boundingBox()];
        if (!at || !beside) throw new Error('No prompt or no Jump');
        expect(at.height).toBeGreaterThanOrEqual(44);
        expect(at.width).toBeGreaterThanOrEqual(44);
        // Left of Jump, at its height, and clear of it.
        expect(at.x + at.width).toBeLessThanOrEqual(beside.x);
        expect(near(at.y, beside.y, 1)).toBe(true);
        await expectFits(page);
        await prompt.tap();
        await expect.poll(async () => (await acted(page)).taken).toEqual(['rope']);
        await expect(game(page).getByText('Rope 1 · Lamp 0')).toBeVisible();
        await expect(prompt).toBeHidden();
      });

      await test.step('turned and walked by the stick to the bothy’s door, the prompt tapped: the bothy', async () => {
        // The door is up and to the left: turned to face it, 0.3° a pixel dragged.
        const from = await walked(page);
        const want = (Math.atan2(-(-6 - from.feet[0]), -(-3 - from.feet[2])) * 180) / Math.PI;
        await lookByTouch(page, glen, Math.round(-(want - from.yaw) / 0.3), 0);
        await stickUntil(page, glen, 40, (w) => w.feet[2] <= -2.4 || w.feet[0] <= -5.5);
        await settled(page);
        await offered(page, 'bothy-door');
        await promptButton(glen).tap();
        await drawing(page, 'bothy', 'The bothy');
        expect((await acted(page)).began).toEqual({ from: 'arrive', spawn: 'door' });
      });

      await test.step('paused, quit and continued: in the bothy where the player stood', async () => {
        const bothy = page.locator('[data-eb-walk]');
        await stickUntil(page, bothy, 30, (w) => w.feet[2] <= 0.6);
        const here = await settled(page);
        await page.getByRole('button', { name: 'Pause' }).tap();
        await expect.poll(async () => (await acted(page)).stood.at(-1)?.sent).toBe('accepted');
        await pauseDialog(page).getByRole('button', { name: 'Quit to title' }).tap();
        await shellScreens(page)
          .getByRole('button', { name: /^Continue/ })
          .tap();
        await drawing(page, 'bothy', 'The bothy');
        const back = await settled(page);
        expect((await acted(page)).began).toEqual({ from: 'at' });
        expect(near(back.feet[0], here.feet[0], 0.02) && near(back.feet[2], here.feet[2], 0.02)).toBe(true);
        await expect(game(page).getByText('Rope 1 · Lamp 0')).toBeVisible();
        await expectFits(page);
      });
      expect(errors).toEqual([]);
    });
  });
}
