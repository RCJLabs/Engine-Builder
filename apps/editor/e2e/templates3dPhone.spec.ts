/**
 * M6.9's gate on phones (D81, docs/specs/templates.md#m69s-gate-d81), at 360×740 and 390×844
 * upright and 844×390 sideways: a new project from each 3D template made by touch, and walked to
 * its ending in the Play panel with the floating stick, a look drag and taps: the prompt, the
 * talks' options, the chest's Take all and, through the hamlet's fights, Attack held. Every target 44 px and nothing
 * past the edges as the walk starts and at the ending, and nothing axe finds there. Untested for feel.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { hands, type Steer } from './campHelpers.ts';
import { watchErrors } from './checks.ts';
import { expectFits } from './hutScreens.ts';
import { walkSteer } from './postHelpers.ts';
import { createFromTemplate, startGame } from './templateHelpers.ts';
import { type Fight, fightWith, playHamlet, playLighthouse } from './templates3dHelpers.ts';
import { drawing, settled } from './walkHelpers.ts';

type Fingers = Awaited<ReturnType<typeof hands>>;

/** A screen's button tapped once it is ready: the stick, the look and the prompt are the fingers'. */
const tap = (button: Locator) => button.tap();

/**
 * The hamlet's fights by touch: Attack held down by a thumb of its own throughout, as F is held by
 * keys, while the stick and the look drag steer, the stick running past 48 px when the foe is far.
 * Between fights nothing touches Attack, so no swing lands on Osric.
 */
function holdingAttack(page: Page, view: Locator, fingers: Fingers): Fight {
  // Past 48 px the stick runs.
  const steer: Steer = {
    ...walkSteer(page, view, fingers),
    walk: async (ms, run) => {
      await view.scrollIntoViewIfNeeded();
      const area = await view.boundingBox();
      if (!area) throw new Error('No view to touch');
      const bottom = Math.min(area.y + area.height, page.viewportSize()?.height ?? area.y + area.height);
      await fingers.press(1, area.x + area.width * 0.25, area.y + (bottom - area.y) * 0.6);
      await fingers.slide(1, 0, run ? -56 : -44);
      await page.waitForTimeout(ms);
      await fingers.lift(1);
    },
  };
  const fight = fightWith(page, steer);
  const attack = view.getByRole('button', { name: 'Attack' });
  return async (foes) => {
    await expect(attack).toBeVisible();
    const box = await attack.boundingBox();
    if (!box) throw new Error('No Attack to hold');
    await fingers.press(3, box.x + box.width / 2, box.y + box.height / 2);
    try {
      await fight(foes);
    } finally {
      await fingers.lift(3);
    }
  };
}

interface Made {
  readonly title: string;
  readonly name: string;
  readonly start: readonly [string, string];
  readonly play: (page: Page, view: Locator, fingers: Fingers) => Promise<void>;
}

const MADE: readonly Made[] = [
  {
    title: 'Open-world RPG',
    name: 'Beacon Fell',
    start: ['green', 'The green'],
    play: (page, view, fingers) =>
      playHamlet(page, walkSteer(page, view, fingers), tap, holdingAttack(page, view, fingers)),
  },
  {
    title: 'First-person adventure',
    name: 'Skerry Light',
    start: ['rock', 'The rock'],
    play: (page, view, fingers) => playLighthouse(page, walkSteer(page, view, fingers), tap),
  },
];

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`3D templates, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    for (const made of MADE) {
      test(`${made.title}: made and walked to its ending, by touch`, async ({ page }) => {
        test.setTimeout(480_000);
        const errors = watchErrors(page);
        await createFromTemplate(page, made.name, made.title, true);
        await startGame(page, true);
        await drawing(page, ...made.start);
        await settled(page);
        await expectFits(page);
        // The Play panel's view, whichever space it shows: its name is the space's.
        const view = page.locator('[data-panel="play"]').getByRole('application');
        const fingers = await hands(page);
        try {
          await test.step('walked to its ending by touch', () => made.play(page, view, fingers));
        } finally {
          await fingers.close();
        }
        await expectFits(page);
        expect(errors).toEqual([]);
      });
    }
  });
}
