/**
 * M4.9's gate (D59), what its specs share: the Play panel's Debug region under the hut in play, a
 * section of it opened by a click or a tap, the log's lines, and the loads quest edited by its
 * form so Replay has something to find.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { FOLDER } from './hutHelpers.ts';
import { stored } from './kitHelpers.ts';
import { openRecord } from './ludus.ts';

export type Press = (target: Locator) => Promise<void>;
export const click: Press = (target) => target.click();
export const tap: Press = (target) => target.tap();

export const debugRegion = (page: Page): Locator => page.getByRole('region', { name: 'Debug' });

/** A section of the Debug region, opened: the others close as it does. */
export async function openPart(page: Page, title: string, press: Press = click): Promise<Locator> {
  const part = debugRegion(page)
    .locator('details.debug-part')
    .filter({
      has: page.locator('summary', { hasText: new RegExp(`^${title}$`) }),
    });
  if (!(await part.evaluate((details) => (details as HTMLDetailsElement).open))) {
    const summary = part.locator('summary').first();
    await summary.scrollIntoViewIfNeeded();
    await press(summary);
  }
  await expect(part).toHaveAttribute('open', '');
  return part;
}

/** The log's lines, each as the panel shows it: number, label and tags. */
export async function logLines(page: Page): Promise<string[]> {
  const lines = debugRegion(page).locator('.debug-line-head');
  return lines.evaluateAll((heads) =>
    heads.map((head) => [...head.children].map((part) => part.textContent?.trim() ?? '').join(' ')),
  );
}

/** The Debug region's status line. */
export const debugSaid = (page: Page): Locator => debugRegion(page).getByRole('status');

/** The loads quest done after one load instead of five, by its form: an edit for Replay to find. */
export async function oneLoad(page: Page): Promise<void> {
  const form = await openRecord(page, 'Quest', 'loads');
  await form.getByRole('textbox', { name: /^Times/ }).fill('1');
  const times = async () => {
    const quest = (await stored(page, FOLDER, 'records/quest/loads.json')) as {
      stages?: { objectives?: { count?: { to?: number } }[] }[];
    } | null;
    return quest?.stages?.[0]?.objectives?.[0]?.count?.to;
  };
  await expect.poll(times).toBe(1);
}
