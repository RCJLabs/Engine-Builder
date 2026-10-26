/**
 * M6.6's gate (D78, docs/specs/markers.md#the-gate), what its specs share: the markers the walk shows,
 * read through window.__ebWalk.markers(), the compass strip over the view, and the glen's Journal,
 * Map and Settings screens as a player reaches them.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { game, shellScreens } from './hutScreens.ts';
import { pauseDialog } from './playShellHelpers.ts';

/** A marker as src/walk/markerView.ts's WalkMarker says it. */
export interface Shown {
  readonly quest: string;
  readonly objective: string;
  readonly text: string;
  readonly at: readonly number[];
  readonly door?: string;
  readonly bearing: number;
  readonly distance: number;
  readonly screen: readonly number[] | null;
}

/** The markers shown at the walk's last frame. */
export async function shown(page: Page): Promise<readonly Shown[]> {
  const read = await page.evaluate(() => {
    const hook = (window as unknown as { __ebWalk?: { markers(): readonly Shown[] } }).__ebWalk;
    return hook ? hook.markers() : null;
  });
  if (!read) throw new Error('No space is being walked');
  return read;
}

const rounded = (n: number) => Math.round(n * 100) / 100;

/** Each marker's objective, the door it stands in at and its point, to the centimetre. */
export async function pointed(page: Page): Promise<unknown[]> {
  return (await shown(page)).map((m) => [m.objective, m.door ?? null, m.at.map(rounded)]);
}

/** Until the markers point at these: objective, door or null, and the point. */
export async function pointsAt(page: Page, want: readonly unknown[]): Promise<void> {
  await expect.poll(() => pointed(page), { timeout: 20_000 }).toEqual(want);
}

export const compass = (page: Page): Locator => page.locator('[data-eb-walk] .walk-compass');
export const compassText = (page: Page): Locator => page.locator('[data-eb-walk] .walk-compass-text');

/** A screen the walk's bar opens, by its title, and the button that opened it. */
export async function openScreen(
  page: Page,
  name: 'Journal' | 'Map',
  how: (button: Locator) => Promise<void>,
): Promise<Locator> {
  await how(game(page).getByRole('button', { name, exact: true }));
  const dialog = game(page).getByRole('dialog', { name });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The journal's entry for a quest, by its name. */
export const entry = (journal: Locator, name: string): Locator =>
  journal.locator('li').filter({ has: journal.page().getByRole('heading', { name, exact: true }) });

/** Track pressed on a quest's entry, the journal closed again. */
export async function track(page: Page, name: string, how: (button: Locator) => Promise<void>): Promise<void> {
  const journal = await openScreen(page, 'Journal', how);
  const button = entry(journal, name).getByRole('button', { name: 'Track' });
  await expect(button).toBeEnabled();
  await how(button);
  await expect(entry(journal, name).getByText('Tracked', { exact: true })).toBeVisible();
  await expect(button).toBeDisabled();
  await how(journal.getByRole('button', { name: 'Close' }));
  await expect(journal).toHaveCount(0);
}

/** The shell's Quest markers setting chosen, from the pause screen and back into play. */
export async function markersSetting(page: Page, on: boolean, how: (button: Locator) => Promise<void>): Promise<void> {
  await how(page.getByRole('button', { name: 'Pause' }));
  await how(pauseDialog(page).getByRole('button', { name: 'Settings' }));
  const screens = shellScreens(page);
  const choice = screens.locator(`[data-key="markers-${on ? 'on' : 'off'}"]`);
  await how(choice);
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await how(screens.getByRole('button', { name: 'Back' }));
  await how(pauseDialog(page).getByRole('button', { name: 'Resume' }));
  await expect(pauseDialog(page)).toHaveCount(0);
}

/** The Map screen's pins: each one's kind, objective and place as the page puts it. */
export async function pins(map: Locator): Promise<{ kind: string; objective: string | null; at: number[] }[]> {
  return map.locator('[data-pin]').evaluateAll((all) =>
    all.map((pin) => ({
      kind: pin.getAttribute('data-pin') ?? '',
      objective: pin.getAttribute('data-objective'),
      at: [Number(pin.getAttribute('data-x')), Number(pin.getAttribute('data-z'))],
    })),
  );
}
