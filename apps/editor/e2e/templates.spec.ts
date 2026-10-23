/**
 * M4.11's gate (D61), on desktop: a new project from each template, every one of its Make it yours
 * steps followed to the place it names, the game played to an ending in the Play panel by pressing
 * only what its stock screens draw, and exported as one file that plays from file://.
 */
import { expect, type Page, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { exportFile } from './exportHelpers.ts';
import { newGame, shellScreens } from './hutScreens.ts';
import { showProject } from './ludus.ts';
import {
  createFromTemplate,
  FERRY,
  followGuide,
  guide,
  inspector,
  playToEnding,
  SALVAGE,
  startGame,
} from './templateHelpers.ts';

test.use({ viewport: { width: 1280, height: 900 }, actionTimeout: 20_000 });

/** The project's problems are none: its tab carries no count once the records are read. */
async function expectNoProblems(page: Page): Promise<void> {
  await expect(page.getByRole('tab', { name: 'Problems', exact: true })).toBeVisible();
}

/** The project exported as one file, played from file:// to its first screen after New game. */
async function playTheFile(page: Page, file: string, title: string): Promise<void> {
  const played = await page.context().newPage();
  const errors = watchErrors(played);
  await played.goto(`file://${file}`);
  await expect(played).toHaveTitle(title);
  await expect(shellScreens(played).getByRole('heading', { name: title })).toBeVisible();
  await newGame(played);
  expect(errors).toEqual([]);
}

test('a new project from the salvage coast: its steps followed, the debt lowered, played to an ending, exported', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await createFromTemplate(page, 'Grey Sound', 'Expedition run');
  await expect(page.getByText(/A salvage skipper on a stormy coast/)).toHaveCount(0);
  await expectNoProblems(page);
  await expect(guide(page)).toBeVisible();
  await followGuide(page, SALVAGE);
  // Its second step, taken: the debt 40 rather than 120, so one good voyage can clear it.
  await guide(page).getByRole('button', { name: 'Open: Change what the boat owes' }).click();
  await inspector(page).getByLabel('Starts at').fill('40');
  await inspector(page).getByLabel('Starts at').blur();
  await expectNoProblems(page);
  await startGame(page);
  const { ending, presses } = await playToEnding(page, 'salvage-coast');
  expect(['Free and clear', 'Seized', 'Lost at sea']).toContain(ending);
  test.info().annotations.push({ type: 'ending', description: `${ending} in ${presses} presses` });
  const file = await exportFile(page, 'Export file');
  expect(file).toMatch(/grey-sound-0\.1\.0\.html$/);
  await playTheFile(page, file, 'Grey Sound');
  expect(errors).toEqual([]);
});

test('a new project from the last ferry: its steps followed, played to an ending, exported', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await createFromTemplate(page, 'Nightboat', 'Story and choices');
  await expectNoProblems(page);
  await followGuide(page, FERRY);
  await startGame(page);
  const { ending, presses } = await playToEnding(page, 'last-ferry');
  expect(['Every light ashore', 'The patrol’s lantern', 'The far bank']).toContain(ending);
  test.info().annotations.push({ type: 'ending', description: `${ending} in ${presses} presses` });
  const file = await exportFile(page, 'Export file');
  expect(file).toMatch(/nightboat-0\.1\.0\.html$/);
  await playTheFile(page, file, 'Nightboat');
  expect(errors).toEqual([]);
});

test('a step follows its record renamed; deleted, it is W140 in Problems, which opens the Project panel', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await createFromTemplate(page, 'Short Haul', 'Expedition run');
  const step = guide(page).getByRole('button', { name: 'Open: Make the raiders tougher' });
  await step.click();
  const form = inspector(page);
  await form.getByRole('button', { name: 'Rename', exact: true }).click();
  await form.getByLabel('New id for raider').fill('corsair');
  await form.getByRole('form', { name: 'Rename raider' }).getByRole('button', { name: 'Rename' }).click();
  await expect(form.getByRole('heading', { name: /: corsair$/ })).toBeVisible();
  // The encounter's foe and the guide's step followed: no problems, and the step opens the corsair.
  await expect(page.getByRole('tab', { name: 'Problems', exact: true })).toBeVisible();
  await showProject(page);
  await step.click();
  await expect(form.getByRole('heading', { name: /: corsair$/ })).toBeVisible();

  await form.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(form).toContainText('This record isn’t there any more');
  await page.getByRole('tab', { name: /^Problems/ }).click();
  const problem = page.locator('[data-panel="problems"]').getByRole('button', { name: /W140 / });
  await expect(problem).toContainText('The project has no file "records/actor/corsair.json"');
  await problem.click();
  await expect(page.getByRole('tab', { name: 'Project', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(guide(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('Remove the guide takes the section away as one step, and undo brings it back', async ({ page }) => {
  await createFromTemplate(page, 'Short Haul', 'Expedition run');
  await guide(page).getByRole('button', { name: 'Remove the guide' }).click();
  await expect(guide(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo: Remove the guide' }).click();
  await expect(guide(page).getByRole('listitem')).toHaveCount(10);
});
