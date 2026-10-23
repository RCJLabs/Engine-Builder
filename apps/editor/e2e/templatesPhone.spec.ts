/**
 * M4.11's gate (D61) on phones, portrait and landscape: a new project from each template made by
 * touch, every Make it yours step followed to the place it names with nothing past the edges, the
 * game played to an ending in the Play panel by touch with each screen in reach and nothing axe
 * finds, and exported as one file that plays from file:// at the phone's size.
 */
import { expect, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { exportFile } from './exportHelpers.ts';
import { expectFits, newGame, shellScreens } from './hutScreens.ts';
import { showProject } from './ludus.ts';
import {
  createFromTemplate,
  FERRY,
  followGuide,
  guide,
  inspector,
  type Landing,
  lowerSheet,
  playToEnding,
  SALVAGE,
  startGame,
} from './templateHelpers.ts';

interface Made {
  readonly title: string;
  readonly template: 'salvage-coast' | 'last-ferry';
  readonly name: string;
  readonly file: RegExp;
  readonly landings: readonly Landing[];
}

const MADE: readonly Made[] = [
  { title: 'Expedition run', template: 'salvage-coast', name: 'Grey Sound', file: /grey-sound/, landings: SALVAGE },
  { title: 'Story and choices', template: 'last-ferry', name: 'Nightboat', file: /nightboat/, landings: FERRY },
];

/** The salvage coast's debt lowered to 40 by touch, as its second step says, so a game ends sooner. */
async function lowerTheDebt(page: Page): Promise<void> {
  await guide(page).getByRole('button', { name: 'Open: Change what the boat owes' }).tap();
  const start = inspector(page).getByLabel('Starts at');
  await start.fill('40');
  await start.blur();
  await lowerSheet(page);
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`templates, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    for (const made of MADE) {
      test(`${made.title}: made, its steps followed, played to an ending and exported, by touch`, async ({
        page,
        context,
      }) => {
        test.setTimeout(300_000);
        const errors = watchErrors(page);
        await createFromTemplate(page, made.name, made.title, true);
        await expect(guide(page)).toBeVisible();
        await guide(page).scrollIntoViewIfNeeded();
        await expectNothingOffscreen(page);
        expect(await smallTargets(page, '.project-guide')).toEqual([]);
        await expectNoAxeIssues(page);
        await followGuide(page, made.landings, { touch: true, each: () => expectNothingOffscreen(page) });
        if (made.template === 'salvage-coast') await lowerTheDebt(page);

        await startGame(page, true);
        const screens: string[] = [];
        const { ending } = await playToEnding(page, made.template, {
          touch: true,
          firstSight: async (screen) => {
            screens.push(screen);
            await expectFits(page);
          },
        });
        expect(ending).not.toBe('');
        test.info().annotations.push({ type: 'screens', description: screens.join(', ') });

        await showProject(page);
        const file = await exportFile(page, 'Export file', true);
        expect(file).toMatch(made.file);
        const played = await context.newPage();
        const playedErrors = watchErrors(played);
        await played.goto(`file://${file}`);
        await expect(shellScreens(played).getByRole('heading', { name: made.name })).toBeVisible();
        await expectFits(played);
        await newGame(played, (button) => button.tap());
        await expectFits(played);
        expect(playedErrors).toEqual([]);
        expect(errors).toEqual([]);
      });
    }
  });
}
