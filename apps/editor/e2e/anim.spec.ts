/**
 * M6.5's gate on desktop (D77, docs/specs/animation.md#the-gate): the camp walked and fought by keys,
 * every frame read through window.__ebWalk.anims(), which reads three's mixer and skeleton back.
 * The hero and the three bandits are the starter character; standing they idle; walking and running
 * their clips play at the speed over each clip's pace, measured against the ground walked; a jump
 * goes through the air; a swing's wind-up, strike and recover are the upper layer's states frame by
 * frame, the strike playing as each hit is sent, the sword hand coming down and forward; and a
 * bandit felled lies down. The clips themselves are first drafts, untested for feel.
 */
import { expect, test } from '@playwright/test';
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
  throughJump,
} from './animHelpers.ts';
import { BANDITS, fallenOf, fightUntil, fought, keySteer, openCamp, yawTo } from './campHelpers.ts';
import { watchErrors } from './checks.ts';
import { holdUntil, settled, walked } from './walkHelpers.ts';

test('the camp by keys: idle, walk and run at their paces, the air, a swing on its phases, a bandit down', async ({
  page,
}) => {
  test.setTimeout(400_000);
  const errors = watchErrors(page);
  const camp = await openCamp(page);
  await camp.focus();
  await settled(page);
  const keys = keySteer(page, camp);

  await test.step('the hero and the bandits drawn as the starter character, idle', async () => {
    expectIdle(await record(page, 500), [PLAYER, ...BANDITS]);
  });

  await test.step('turned to the fire: walked, then run, each clip at the speed over its pace', async () => {
    const me = await walked(page);
    await keys.turn(yawTo(me.feet, [0, 0, -5]) - me.yaw);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(300);
    const walking = await record(page, 1500);
    await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(300);
    const running = await record(page, 1000);
    await page.keyboard.up('ShiftLeft');
    await page.keyboard.up('KeyW');
    expectPaces(walking, running);
  });

  await test.step('a jump goes through the air and lands standing', async () => {
    await settled(page);
    await startRecording(page);
    await holdUntil(page, ['Space'], (w) => !w.grounded);
    await throughJump(page);
    expectJump(await stopRecording(page));
  });

  await test.step('F held at a bandit: the swing on its phases, the strike as each hit goes, the felled lying', async () => {
    await camp.focus();
    await startRecording(page);
    await page.keyboard.down('KeyF');
    try {
      await fightUntil(page, keys, (seen) => fallenOf(seen.fight).length > 0);
    } finally {
      await page.keyboard.up('KeyF');
    }
    await page.waitForTimeout(1500);
    const frames = await stopRecording(page);
    expectSwings(frames);
    const felled = fallenOf(await fought(page))[0];
    expect(felled).toBeDefined();
    expectDown(frames, felled as string);
  });

  expect(errors).toEqual([]);
});
