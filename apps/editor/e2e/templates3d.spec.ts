/**
 * M6.9's gate on desktop (D81, docs/specs/templates.md#m69s-gate-d81): a new project from each 3D
 * template, every one of its Make it yours steps followed to the place it names, the game walked to
 * its ending in the Play panel by keys and the mouse, and exported as one file that plays from
 * file://. Untested for feel.
 */
import { expect, type Locator, type Page, test } from '@playwright/test';
import { keySteer } from './campHelpers.ts';
import { watchErrors } from './checks.ts';
import { exportFile } from './exportHelpers.ts';
import { newGame, shellScreens } from './hutScreens.ts';
import { createFromTemplate, followGuide, guide, type Landing, startGame } from './templateHelpers.ts';
import { type Fight, fightWith, HAMLET, LIGHTHOUSE, playHamlet, playLighthouse } from './templates3dHelpers.ts';
import { drawing, settled } from './walkHelpers.ts';

test.use({ viewport: { width: 1280, height: 900 }, actionTimeout: 20_000 });

interface Made {
  readonly title: string;
  readonly name: string;
  readonly file: RegExp;
  readonly landings: readonly Landing[];
  /** The space a new game starts in, and its name. */
  readonly start: readonly [string, string];
  readonly play: (page: Page, view: Locator) => Promise<void>;
}

const click = (button: Locator) => button.click();

/** F held through the fight, as a player holds it to swing again and again. */
function byKeys(page: Page, view: Locator): Fight {
  const fight = fightWith(page, keySteer(page, view));
  return async (foes) => {
    await view.focus();
    await page.keyboard.down('KeyF');
    try {
      await fight(foes);
    } finally {
      await page.keyboard.up('KeyF');
    }
  };
}

const MADE: readonly Made[] = [
  {
    title: 'Open-world RPG',
    name: 'Beacon Fell',
    file: /beacon-fell-0\.1\.0\.html$/,
    landings: HAMLET,
    start: ['green', 'The green'],
    play: (page, view) => playHamlet(page, keySteer(page, view), click, byKeys(page, view)),
  },
  {
    title: 'First-person adventure',
    name: 'Skerry Light',
    file: /skerry-light-0\.1\.0\.html$/,
    landings: LIGHTHOUSE,
    start: ['rock', 'The rock'],
    play: (page, view) => playLighthouse(page, keySteer(page, view), click),
  },
];

/** The project exported as one file, played from file:// to its first space drawn after New game. */
async function playTheFile(page: Page, file: string, made: Made): Promise<void> {
  const played = await page.context().newPage();
  const errors = watchErrors(played);
  await played.goto(`file://${file}`);
  await expect(played).toHaveTitle(made.name);
  await expect(shellScreens(played).getByRole('heading', { name: made.name })).toBeVisible();
  await newGame(played);
  await drawing(played, ...made.start);
  expect(errors).toEqual([]);
  await played.close();
}

for (const made of MADE) {
  test(`${made.title}: made, its steps followed, walked to its ending by keys, exported`, async ({ page }) => {
    test.setTimeout(480_000);
    const errors = watchErrors(page);
    await createFromTemplate(page, made.name, made.title);
    // The project's problems are none: its tab carries no count once the records are read.
    await expect(page.getByRole('tab', { name: 'Problems', exact: true })).toBeVisible();
    await expect(guide(page)).toBeVisible();
    await test.step('every Make it yours step opens where it says', () => followGuide(page, made.landings));
    await startGame(page);
    await drawing(page, ...made.start);
    // The Play panel's view, whichever space it shows: its name is the space's.
    const view = page.locator('[data-panel="play"]').getByRole('application');
    await view.focus();
    await settled(page);
    await test.step('walked to its ending by keys and the mouse', () => made.play(page, view));
    const file = await exportFile(page, 'Export file');
    expect(file).toMatch(made.file);
    await test.step('exported as one file that plays from file://', () => playTheFile(page, file, made));
    expect(errors).toEqual([]);
  });
}
