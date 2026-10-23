/**
 * M4.11's gate (D61), what its specs share: a new project from a template, its Make it yours steps
 * followed, each checked to land where it says, and each template played to an ending in the Play
 * panel by pressing only what its stock screens draw.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { game, newGame, press, showPlay, topScreen } from './hutScreens.ts';
import { openProject, showProject } from './ludus.ts';

/** New project, named, from the template New project offers under `title`, by click or by touch. */
export async function createFromTemplate(page: Page, name: string, title: string, touch = false): Promise<void> {
  const how = (target: Locator) => (touch ? target.tap() : target.click());
  await page.goto('./');
  await showProject(page);
  await how(page.getByRole('button', { name: 'New project' }));
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Start from').selectOption({ label: title });
  await how(page.getByRole('button', { name: 'Create' }));
  await expect(openProject(page).getByRole('heading', { name, level: 3 })).toBeVisible();
}

export const guide = (page: Page): Locator => openProject(page).getByRole('region', { name: 'Make it yours' });

/** The inspector, wherever the layout puts it: the dock, a phone's sheet, or a side zone's tab panel. */
export const inspector = (page: Page): Locator => page.locator('[data-panel="inspector"]');

/** Where a step lands, and what shows it got there. */
export interface Landing {
  readonly step: string;
  readonly shows: (page: Page) => Locator;
}

/** A record's form, its heading "Type: id". */
const record = (id: string) => (page: Page) => inspector(page).getByRole('heading', { name: new RegExp(`: ${id}$`) });
const code = (text: string) => (page: Page) => inspector(page).locator('.cm-content').getByText(text).first();

/** Where each step of a template's guide lands. */
export const SALVAGE: readonly Landing[] = [
  { step: 'Name your game', shows: (page) => openProject(page) },
  { step: 'Change what the boat owes', shows: record('debt') },
  { step: 'Add something to find in a wreck', shows: record('wrecks') },
  { step: 'Reshape the coast', shows: record('coast') },
  { step: 'Make the raiders tougher', shows: record('raider') },
  { step: 'Change a contract’s pay', shows: record('survey') },
  { step: 'Give the skipper more voyages', shows: code('const VOYAGES = 5;') },
  { step: 'Recolour it', shows: (page) => inspector(page).getByRole('region', { name: 'The theme' }) },
  { step: 'Play it', shows: (page) => page.locator('[data-panel="play"]') },
  { step: 'Export it', shows: (page) => openProject(page).getByRole('region', { name: 'Export' }) },
];

export const FERRY: readonly Landing[] = [
  { step: 'Name your story', shows: (page) => openProject(page) },
  { step: 'Rewrite the opening', shows: code('The bridge opens tomorrow.') },
  { step: 'Change a choice', shows: code('Take the weir channel.') },
  { step: 'Add a passenger', shows: record('crossing') },
  { step: 'Change what an ending needs', shows: code('The ferry grinds onto the shingle') },
  { step: 'Change what the journal says', shows: record('marta') },
  { step: 'Recolour it', shows: (page) => inspector(page).getByRole('region', { name: 'The theme' }) },
  { step: 'Play it', shows: (page) => page.locator('[data-panel="play"]') },
  { step: 'Export it', shows: (page) => openProject(page).getByRole('region', { name: 'Export' }) },
];

/**
 * Presses each step's Open, in order, and checks it shows what `landings` says, then runs `each`
 * there; the step titles must be those. By touch, the phone's inspector sheet is lowered between
 * steps, since in portrait it covers the tab bar.
 */
export async function followGuide(
  page: Page,
  landings: readonly Landing[],
  { touch = false, each }: { touch?: boolean; each?: (step: string) => Promise<void> } = {},
): Promise<void> {
  const steps = guide(page).getByRole('listitem');
  await expect(steps.locator('strong')).toHaveText(landings.map((l) => l.step));
  for (const { step, shows } of landings) {
    if (touch) await lowerSheet(page);
    await showProject(page);
    const open = guide(page).getByRole('button', { name: `Open: ${step}` });
    if (touch) await open.tap();
    else await open.click();
    await expect(shows(page), step).toBeVisible();
    await each?.(step);
  }
  if (touch) await lowerSheet(page);
  await showProject(page);
}

/** The Play panel's game, from New game: its scripts already trusted, as a template's are. */
export async function startGame(page: Page, touch = false): Promise<void> {
  const panel = await showPlay(page);
  const play = panel.getByRole('button', { name: 'Play', exact: true });
  await expect(play).toBeEnabled({ timeout: 60_000 });
  if (touch) await play.tap();
  else await play.click();
  await newGame(page, touch ? (b) => b.tap() : (b) => b.click());
}

const SALVAGE_ENDINGS = ['Free and clear', 'Seized', 'Lost at sea'];
const FERRY_ENDINGS = ['Every light ashore', 'The patrol’s lantern', 'The far bank'];

/** The ending the top screen shows, if the game is over. */
async function ended(page: Page, endings: readonly string[]): Promise<string | undefined> {
  for (const ending of endings) {
    if (await topScreen(page).getByText(ending, { exact: true }).first().isVisible()) return ending;
  }
  return undefined;
}

/** In a dialog: the first open choice whose words are wanted, else its first open choice, else Go on. */
async function inDialog(dialog: Locator, wanted: readonly string[]): Promise<Locator> {
  const open = dialog.getByRole('listitem').locator('button:enabled');
  for (const words of wanted) {
    const choice = open.filter({ hasText: words });
    if ((await choice.count()) > 0) return choice.first();
  }
  if ((await open.count()) > 0) return open.first();
  return dialog.getByRole('button', { name: 'Go on', exact: true });
}

const layerOf = (id: string | null) => Number(/^n(\d+)-/.exec(id ?? '')?.[1] ?? -1);

/** On the coast's map: the first node a move takes on a layer, picked and moved to. */
async function onMap(map: Locator, touch: boolean): Promise<Locator> {
  const here = layerOf(await map.locator('[data-here]').getAttribute('data-node'));
  for (const node of await map.locator('[data-reached]').all()) {
    if (layerOf(await node.getAttribute('data-node')) <= here) continue;
    await (touch ? node.tap() : node.click());
    const moves = map.locator('.eb-map-picked button:enabled');
    if ((await moves.count()) > 0) return moves.first();
  }
  throw new Error('Nothing to press on the coast');
}

/** The number before `label` in the HUD's top line, such as "40 Coin". */
async function amount(page: Page, label: string): Promise<number> {
  const text =
    (await topScreen(page)
      .getByText(new RegExp(`^\\d+ ${label}$`))
      .textContent()) ?? '';
  return Number(text.split(' ')[0]);
}

/**
 * A skipper's next press on the salvage coast's screens: sell what the hold has, pay the
 * harbourmaster when the purse allows, feed and patch the boat, sail, and at sea take the salvage.
 * Undefined once an ending shows.
 */
async function salvagePress(page: Page, sold: { done: boolean }, touch: boolean): Promise<Locator | undefined> {
  if (await ended(page, SALVAGE_ENDINGS)) return undefined;
  const dialog = game(page).getByRole('dialog');
  if (await dialog.isVisible()) {
    // The chandlery: everything in the hold sold, then Leave. Events' own leaving is in their words.
    const leave = dialog.getByRole('button', { name: 'Leave', exact: true });
    if (await leave.isVisible()) {
      const sell = dialog.getByRole('button', { name: /^Sell / });
      if ((await sell.count()) > 0) return sell.first();
      sold.done = true;
      return leave;
    }
    return inDialog(dialog, [
      'Pay 40 off the debt',
      'Take on six stores',
      'Take the Gannet',
      'Strip the fittings',
      'Raise the bell',
      'Fight',
      'Ride it out',
      'Rest and patch',
      'Not today',
    ]);
  }
  const map = topScreen(page).getByRole('region', { name: 'The coast' });
  if (await map.isVisible()) return onMap(map, touch);
  const button = (name: string) => topScreen(page).getByRole('button', { name, exact: true });
  if (await button('Hand over').isVisible()) return button('Hand over');
  if ((await amount(page, 'Coin')) >= 40) return button('Harbourmaster');
  if (!sold.done) return button('Chandlery');
  if ((await amount(page, 'Stores')) < 6 && (await amount(page, 'Coin')) >= 10) return button('Yard');
  sold.done = false;
  return button('Set sail');
}

/** The ferryman's next press: in a scene, its first open option or Go on; on the river, Row on, then Come ashore. */
async function ferryPress(page: Page): Promise<Locator | undefined> {
  if (await ended(page, FERRY_ENDINGS)) return undefined;
  const dialog = game(page).getByRole('dialog');
  if (await dialog.isVisible()) return inDialog(dialog, []);
  const row = topScreen(page).getByRole('button', { name: 'Row on', exact: true });
  return (await row.isVisible()) ? row : topScreen(page).getByRole('button', { name: 'Come ashore', exact: true });
}

/**
 * Plays the template's game until an ending shows; returns the ending and how many presses it took.
 * `firstSight` runs once for each screen the game shows, by its title, before anything on it is pressed.
 */
export async function playToEnding(
  page: Page,
  template: 'salvage-coast' | 'last-ferry',
  { touch = false, firstSight }: { touch?: boolean; firstSight?: (screen: string) => Promise<void> } = {},
): Promise<{ ending: string; presses: number }> {
  const sold = { done: false };
  const seen = new Set<string>();
  const sight = async () => {
    const screen = (await topScreen(page).locator('h2.eb-sr').first().textContent()) ?? '';
    if (seen.has(screen)) return;
    seen.add(screen);
    await firstSight?.(screen);
  };
  for (let presses = 0; presses < 400; presses++) {
    const next = template === 'salvage-coast' ? await salvagePress(page, sold, touch) : await ferryPress(page);
    await sight();
    if (!next) {
      const ending = await ended(page, template === 'salvage-coast' ? SALVAGE_ENDINGS : FERRY_ENDINGS);
      return { ending: ending ?? '', presses };
    }
    await press(page, next, touch);
  }
  throw new Error(`${template} didn’t end in 400 presses`);
}

/** The phone's inspector sheet lowered, if it is up: in portrait it covers the tab bar. */
export async function lowerSheet(page: Page): Promise<void> {
  const handle = page.locator('.sheet-handle[aria-expanded="true"]');
  if (await handle.isVisible()) await handle.tap();
}
