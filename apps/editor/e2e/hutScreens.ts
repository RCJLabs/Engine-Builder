/**
 * M4.1's gate (D51), what its specs share: the Play panel on any layout; the hut's theme and six
 * screens made in it, each typed into the screen editor and compared with the fixture as it
 * lands; the hut imported and started; and its game's screens, as a player sees them.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets } from './checks.ts';
import { fixtureText, HUT, landed } from './hutHelpers.ts';
import { replaceText } from './hutLogic.ts';
import { fixtureZip } from './kitHelpers.ts';
import { openProject, showProject } from './ludus.ts';

/** The screens in the order the hut spec makes them: the mode's first, the button-opened last. */
export const SCREENS = ['hut', 'talk', 'storm', 'store', 'journal', 'closed'];

/** The Play panel to the front: its tab, or More's item on a phone. */
export async function showPlay(page: Page): Promise<Locator> {
  const tab = page.getByRole('tab', { name: 'Play' });
  if (await tab.isVisible()) await tab.click();
  else {
    await page.getByRole('tab', { name: 'More' }).click();
    await page
      .locator('[data-panel="more"]')
      .getByRole('button', { name: /^Play / })
      .click();
  }
  const panel = page.locator('[data-panel="play"]');
  await expect(panel.getByRole('heading', { name: 'Screens' })).toBeVisible();
  return panel;
}

/** The hut's theme and screens, made in the Play panel and written in the screen editor. */
export async function makeScreens(page: Page): Promise<void> {
  const panel = await showPlay(page);
  await panel.getByRole('button', { name: 'New theme' }).click();
  const theme = page.getByRole('region', { name: 'The theme' });
  await expect(theme.locator('.cm-content')).toContainText('"on-accent"');
  await replaceText(page, theme, fixtureText('ui/theme.json'));
  await landed(page, 'ui/theme.json');
  for (const id of SCREENS) {
    await showPlay(page);
    await panel.getByRole('button', { name: 'New screen' }).click();
    await panel.getByLabel('Name of the new screen').fill(id);
    await panel.getByRole('button', { name: 'Create' }).click();
    const screen = page.getByRole('region', { name: `Screen ${id}` });
    await expect(screen.locator('.cm-content')).toContainText('"title"');
    await replaceText(page, screen, fixtureText(`ui/${id}.json`));
    await landed(page, `ui/${id}.json`);
  }
  await showPlay(page);
  await expect(panel.getByRole('list').getByRole('button')).toHaveText([
    ...[...SCREENS].sort().map((id) => new RegExp(`^${id}No problems$`)),
    /^ThemeNo problems$/,
  ]);
}

/** The hut imported from its fixture, its scripts let run, and a game of it started in Play. */
export async function startHut(page: Page): Promise<Locator> {
  await page.goto('./');
  await showProject(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import zip' }).click(),
  ]);
  await chooser.setFiles(fixtureZip(HUT, 'the-hut'));
  await expect(openProject(page).getByRole('heading', { name: 'The hut' })).toBeVisible();
  const panel = await showPlay(page);
  await panel.getByRole('button', { name: 'Run its scripts' }).click();
  await panel.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(game(page).getByText(/^Day \d+ of 10$/)).toBeVisible();
  return panel;
}

export const game = (page: Page): Locator => page.locator('.eb-game');

/** The screen on top: the one a player's taps go to. */
export const topScreen = (page: Page): Locator => game(page).locator('.eb-screen:not([inert])');

/** Nothing past the edges, no target under 44 px, and nothing axe finds, at every impact. */
export async function expectFits(page: Page): Promise<void> {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, 'body')).toEqual([]);
  await expectNoAxeIssues(page);
}

/** Presses a button that takes an action, by touch on a phone, and waits for the step's view: the game's turn moves on. */
export async function press(page: Page, button: Locator, touch = false): Promise<void> {
  const turn = await game(page).getAttribute('data-turn');
  if (touch) await button.tap();
  else await button.click();
  await expect(game(page)).not.toHaveAttribute('data-turn', turn ?? '');
}

/**
 * Plays on until the hut closes, pressing only what the screens draw: in a talk or an event, its
 * first option on offer or Go on; in the store, Leave; otherwise a load carried, and the hut
 * closed once the season is over. Returns the modal screens' titles as they came up.
 */
export async function playSeason(page: Page, touch = false): Promise<string[]> {
  const seen: string[] = [];
  for (let turn = 0; turn < 60; turn++) {
    const top = topScreen(page);
    if (await top.getByText('The hut is closed for the winter.').isVisible()) return seen;
    const dialog = game(page).getByRole('dialog');
    if (await dialog.isVisible()) {
      seen.push((await dialog.getByRole('heading', { level: 2 }).textContent()) ?? '');
      const options = dialog.getByRole('listitem').locator('button:enabled');
      const goOn = dialog.getByRole('button', { name: 'Go on' });
      const leave = dialog.getByRole('button', { name: 'Leave the store' });
      if ((await options.count()) > 0) await press(page, options.first(), touch);
      else if (await goOn.isEnabled()) await press(page, goOn, touch);
      else await press(page, leave, touch);
    } else {
      const close = top.getByRole('button', { name: 'Close the hut for the winter' });
      if (await close.isVisible()) await press(page, close, touch);
      else await press(page, top.getByRole('button', { name: 'Carry a load up' }), touch);
    }
  }
  throw new Error(`The hut didn’t close in 60 presses; saw ${seen.join(', ')}`);
}
