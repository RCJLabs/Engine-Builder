/**
 * M4.3's gate (D53), what its specs share: the hut opened at /play/ to its title; the state a
 * player sees, to compare one game with another; the shell's own screens; and a save's slot read
 * or damaged in the page's IndexedDB, where @eb/platform keeps it.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { game, nextPress, press, shellScreens } from './hutScreens.ts';

/** The hut's game file at /play/, opened by a button pressed with `how`, at its title. */
export async function openTitle(page: Page, file: string, how: (b: Locator) => Promise<void> = (b) => b.click()) {
  if (!page.url().endsWith('/play/')) await page.goto('play/');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    how(page.getByRole('button', { name: /^Open (a game file|another game)$/ })),
  ]);
  await chooser.setFiles(file);
  await expect(shellScreens(page).getByRole('heading', { level: 2, name: 'The hut' })).toBeVisible();
}

/** What a player sees of the game now: its step, the hut's top line, and the screens up. */
export async function seen(page: Page): Promise<{ turn: string | null; top: string; screens: string[] }> {
  await expect(game(page)).not.toHaveAttribute('data-busy', 'true');
  return {
    turn: await game(page).getAttribute('data-turn'),
    top: await game(page).locator('.eb-screen').first().locator('.eb-top').innerText(),
    screens: await game(page).locator('.eb-screen h2').allTextContents(),
  };
}

/** `steps` presses, each the next a keeper would make (nextPress): the same in any game of the same seed. */
export async function play(page: Page, steps: number, touch = false): Promise<void> {
  for (let step = 0; step < steps; step++) {
    const next = await nextPress(page);
    if (!next) return;
    await press(page, next.button, touch);
  }
}

/** The pause dialog, and a screen opened from it. */
export const pauseDialog = (page: Page): Locator => shellScreens(page).getByRole('dialog', { name: 'Paused' });

export async function openSaves(page: Page, from: 'title' | 'pause'): Promise<Locator> {
  const screens = shellScreens(page);
  if (from === 'pause') {
    await page.getByRole('button', { name: 'Pause' }).click();
    await pauseDialog(page).getByRole('button', { name: 'Saves' }).click();
  } else await screens.getByRole('button', { name: 'Saves' }).click();
  await expect(screens.getByRole('heading', { level: 2, name: 'Saves' })).toBeVisible();
  return screens;
}

const SLOT_KEY = (slot: string) => `eb/the-hut/play/slot/${slot}`;

/** A slot's save as the page's IndexedDB holds it ('kv', @eb/platform's store). */
export function storedSave(page: Page, slot: string): Promise<string | undefined> {
  return page.evaluate(
    (key) =>
      new Promise<string | undefined>((resolve, reject) => {
        const open = indexedDB.open('eb');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction('kv').objectStore('kv').get(key);
          get.onsuccess = () => {
            open.result.close();
            resolve(get.result as string | undefined);
          };
        };
      }),
    SLOT_KEY(slot),
  );
}

/** Writes over a slot's save with text that isn't one, as a torn write or a bad disk would. */
export function damageSave(page: Page, slot: string): Promise<void> {
  return page.evaluate(
    (key) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('eb');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const done = open.result.transaction('kv', 'readwrite');
          done.objectStore('kv').put('{"torn', key);
          done.oncomplete = () => {
            open.result.close();
            resolve();
          };
        };
      }),
    SLOT_KEY(slot),
  );
}
