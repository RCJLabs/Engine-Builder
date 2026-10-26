/**
 * M6.5's gate by touch (D77, docs/specs/animation.md#the-gate), at 360×740 and 390×844 upright and
 * 844×390 sideways: the camp walked by the floating stick, a little way out to walk and past 48 px
 * to run, a jump by the Jump button, and a bandit fought by the Attack button, every frame read
 * through window.__ebWalk.anims() as anim.spec.ts reads it. Untested for feel.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import {
  expectDown,
  expectIdle,
  expectJump,
  expectPaces,
  expectSwings,
  PLAYER,
  record,
  startRecording,
  stopRecording,
} from './animHelpers.ts';
import { BANDITS, fallenOf, fightUntil, fought, hands, openCamp, touchSteer, yawTo } from './campHelpers.ts';
import { watchErrors } from './checks.ts';
import { expectFits } from './hutScreens.ts';
import { settled, walked } from './walkHelpers.ts';

/** Where a thumb holds the stick: the view's lower left, within the part shown sideways. */
async function stickAt(page: Page, camp: Locator) {
  await camp.scrollIntoViewIfNeeded();
  const area = await camp.boundingBox();
  if (!area) throw new Error('No view to touch');
  const bottom = Math.min(area.y + area.height, page.viewportSize()?.height ?? area.y + area.height);
  return { x: area.x + area.width * 0.25, y: area.y + (bottom - area.y) * 0.6 };
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`the camp's animation by touch, ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('idle, the stick’s walk and run at their paces, Jump, Attack on its phases, a bandit down', async ({
      page,
    }) => {
      test.setTimeout(400_000);
      const errors = watchErrors(page);
      const camp = await openCamp(page, true);
      await settled(page);
      const fingers = await hands(page);
      const touch = touchSteer(page, camp, fingers);

      await test.step('the hero and the bandits drawn as the starter character, idle', async () => {
        expectIdle(await record(page, 500), [PLAYER, ...BANDITS]);
      });

      await test.step('turned to the fire: the stick held to walk, then pushed past 48 px to run', async () => {
        const me = await walked(page);
        await touch.turn(yawTo(me.feet, [0, 0, -5]) - me.yaw);
        const at = await stickAt(page, camp);
        await fingers.press(1, at.x, at.y);
        await fingers.slide(1, 0, -40);
        await page.waitForTimeout(300);
        const walking = await record(page, 1500);
        await fingers.slide(1, 0, -24);
        await page.waitForTimeout(300);
        const running = await record(page, 1000);
        await fingers.lift(1);
        expectPaces(walking, running);
      });

      await test.step('Jump tapped: through the air and standing again', async () => {
        await settled(page);
        await startRecording(page);
        await fingers.tap(camp.getByRole('button', { name: 'Jump' }));
        await page.waitForTimeout(1500);
        expectJump(await stopRecording(page));
      });

      await test.step('Attack tapped at a bandit: the swing on its phases, the felled lying', async () => {
        await startRecording(page);
        await fightUntil(page, touch, (seen) => fallenOf(seen.fight).length > 0);
        await page.waitForTimeout(1500);
        const frames = await stopRecording(page);
        expectSwings(frames);
        const felled = fallenOf(await fought(page))[0];
        expect(felled).toBeDefined();
        expectDown(frames, felled as string);
        await expectFits(page);
      });
      await fingers.close();
      expect(errors).toEqual([]);
    });
  });
}
