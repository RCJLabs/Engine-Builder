/**
 * M4.3's gate (D53), on desktop: the hut played inside its shell at /play/. A game in a slot, saved
 * every step, continued after a reload to the same state, its code brought into a fresh browser; a
 * save that won't load gone back from to its backup and set aside; a crash that offers the save as
 * stored; the same Daily in two browsers; and pause and settings. The update prompt has no spec: a
 * service worker's script fetch never reaches Playwright's routing in Chromium (tried, M4.3), so no
 * test can make a new version arrive.
 */
import { readFileSync } from 'node:fs';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { expectFits, game, newGame, shellScreens, topScreen } from './hutScreens.ts';
import { hutGame } from './inputHelpers.ts';
import { damageSave, openSaves, openTitle, pauseDialog, play, seen, storedSave } from './playShellHelpers.ts';

test.use({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });

/** A fresh browser with the same game file open at its title. */
async function freshPage(browser: Browser, file: string): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'],
    baseURL: test.info().project.use.baseURL,
  });
  const page = await context.newPage();
  await openTitle(page, file);
  return page;
}

test('a game saved every step, continued after a reload, and brought by its code into a fresh browser', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  const file = hutGame();
  await openTitle(page, file);
  const screens = shellScreens(page);
  await expect(screens.getByText('A season above the tree line')).toBeVisible();
  await expect(screens.getByRole('button', { name: /^Continue/ })).toHaveCount(0);
  await expectFits(page);
  await newGame(page);
  await play(page, 3);
  const before = await seen(page);
  // Saved after the last step: the slot's save is that step's.
  expect(JSON.parse((await storedSave(page, 'slot-1')) ?? '{}').summary).toMatchObject({ turn: 3 });

  await page.reload();
  await openTitle(page, file);
  const going = screens.getByRole('button', { name: /^Continue/ });
  await expect(going).toHaveText(/^ContinueSlot 1 · Day \d+ · \d+ coins$/);
  await going.click();
  expect(await seen(page)).toEqual(before);
  // New over the slot asks first, naming what it holds.
  await page.getByRole('button', { name: 'Pause' }).click();
  await pauseDialog(page).getByRole('button', { name: 'Quit to title' }).click();
  await screens.getByRole('button', { name: 'New game' }).click();
  const slot = screens.getByRole('button', { name: /^Slot 1/ });
  await expect(slot).toContainText(/Day \d+ · \d+ coins/);
  await slot.click();
  await expect(screens.getByRole('button', { name: /^Press again to replace Slot 1/ })).toBeVisible();
  await screens.getByRole('button', { name: 'Back' }).click();
  await screens.getByRole('button', { name: /^Continue/ }).click();
  expect(await seen(page)).toEqual(before);

  await openSaves(page, 'pause');
  await screens.getByRole('button', { name: 'Copy code' }).click();
  await expect(screens.getByRole('status').first()).toContainText('Slot 1’s code is copied.');
  const code = await page.evaluate(() => navigator.clipboard.readText());
  expect(code).toMatch(/^EB1\.the-hut\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);

  const fresh = await freshPage(browser, file);
  const freshErrors = watchErrors(fresh);
  const there = await openSaves(fresh, 'title');
  await expect(there.getByText('No saves yet.')).toBeVisible();
  await there.getByLabel('A save code').fill(code);
  await there.getByRole('button', { name: 'Use the code' }).click();
  await there.getByRole('button', { name: 'Put it in Slot 2' }).click();
  await expect(there.getByText('It is in Slot 2 now.')).toBeVisible();
  await there.getByRole('button', { name: 'Load Slot 2' }).click();
  expect(await seen(fresh)).toEqual(before);
  await expect(fresh.getByText('The hut · Slot 2')).toBeVisible();
  // Brought in again over it, the slot asks first.
  await openSaves(fresh, 'pause');
  await there.getByLabel('A save code').fill(code);
  await there.getByRole('button', { name: 'Use the code' }).click();
  await there.getByRole('button', { name: 'Put it in Slot 2' }).click();
  await expect(there.getByRole('button', { name: 'Press again to replace Slot 2' })).toBeVisible();
  await there.getByRole('button', { name: 'Back' }).click();
  await pauseDialog(fresh).getByRole('button', { name: 'Resume' }).click();
  // Another game's code is refused, naming whose it is, before anything is unpacked.
  await openSaves(fresh, 'pause');
  await there.getByLabel('A save code').fill(code.replace('EB1.the-hut.', 'EB1.the-hostel.'));
  await there.getByRole('button', { name: 'Use the code' }).click();
  await expect(there.getByText(/mistyped|another|not "the-hut"/)).toBeVisible();
  await fresh.context().close();
  expect(freshErrors).toEqual([]);
  expect(errors).toEqual([]);
});

test('a save that won’t load goes back to its backup, and is set aside to save out and delete', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  const file = hutGame();
  await openTitle(page, file);
  await newGame(page);
  await play(page, 3);
  const before = await seen(page);
  await damageSave(page, 'slot-1');
  await page.reload();
  await openTitle(page, file);
  const screens = shellScreens(page);
  // Its summary still reads, so Continue offers it; the save itself doesn't load.
  await screens.getByRole('button', { name: /^Continue/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'its backup did' })).toBeVisible();
  // The backup is the save before the last step's.
  expect(Number((await seen(page)).turn)).toBe(Number(before.turn) - 1);
  await openSaves(page, 'pause');
  const aside = screens.getByRole('region', { name: 'Set aside' });
  await expect(aside.getByText('Slot 1: The save is not JSON')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    aside.getByRole('button', { name: 'Save file' }).click(),
  ]);
  expect(readFileSync(await download.path(), 'utf8')).toBe('{"torn');
  const forget = aside.getByRole('button', { name: 'Delete' });
  await forget.click();
  await expect(aside.getByRole('button', { name: 'Press again to delete' })).toBeVisible();
  await aside.getByRole('button', { name: 'Press again to delete' }).click();
  await expect(aside).toHaveCount(0);
  // The slot in play can't be deleted; another can, on a second press.
  await expect(screens.getByRole('button', { name: 'Delete' }).first()).toBeDisabled();
  expect(errors).toEqual([]);
});

test('a crash covers the page and gives the save exactly as stored', async ({ page }) => {
  const errors = watchErrors(page);
  const file = hutGame();
  await openTitle(page, file);
  await newGame(page);
  await play(page, 1);
  await page.evaluate(() => setTimeout(() => Promise.reject(new Error('A planted failure'))));
  const crash = page.getByRole('alertdialog', { name: 'The game stopped' });
  await expect(crash).toBeVisible();
  await expect(crash).toContainText('A planted failure');
  await expect(crash.getByRole('heading', { name: 'The game stopped' })).toBeFocused();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    crash.getByRole('button', { name: 'Save file' }).click(),
  ]);
  expect(readFileSync(await download.path(), 'utf8')).toBe(await storedSave(page, 'slot-1'));
  // Everything behind it is out of reach.
  await expect(page.locator('#player')).toHaveAttribute('inert', '');
  await expectFits(page);
  expect(errors.filter((e) => !e.includes('A planted failure'))).toEqual([]);
});

test('the Daily is the same game in two browsers on the same day, and goes on from its slot', async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const day = new Date('2026-10-20T09:30:00');
  await page.clock.setFixedTime(day);
  const file = hutGame();
  await openTitle(page, file);
  const daily = shellScreens(page).getByRole('button', { name: /^Daily 292/ });
  await expect(daily).toContainText('Today’s game, the same for everyone');
  await daily.click();
  await play(page, 3);
  const mine = await storedSave(page, 'daily');

  const fresh = await freshPage(browser, file);
  await fresh.clock.setFixedTime(day);
  await fresh.reload();
  await openTitle(fresh, file);
  await shellScreens(fresh)
    .getByRole('button', { name: /^Daily 292/ })
    .click();
  await play(fresh, 3);
  // The same seed and the same steps at the same times: the same save, byte for byte.
  expect(await storedSave(fresh, 'daily')).toBe(mine);
  await fresh.context().close();

  // Back at the title the same day, the Daily goes on from its slot.
  await page.getByRole('button', { name: 'Pause' }).click();
  await pauseDialog(page).getByRole('button', { name: 'Quit to title' }).click();
  await expect(shellScreens(page).getByRole('button', { name: /^Daily 292/ })).toContainText('Go on · Day');
  await shellScreens(page)
    .getByRole('button', { name: /^Daily 292/ })
    .click();
  expect((await seen(page)).turn).toBe('3');
});

test('pause by Escape, settings kept across a reload, and quitting to a title that continues', async ({ page }) => {
  const errors = watchErrors(page);
  const file = hutGame();
  await openTitle(page, file);
  await newGame(page);
  await play(page, 1);
  // Escape with nothing open to close pauses; Escape again resumes, focus back in the game.
  await topScreen(page).locator('button:enabled').first().focus();
  await page.keyboard.press('Escape');
  const paused = pauseDialog(page);
  await expect(paused).toBeVisible();
  await expect(paused.getByRole('heading', { name: 'Paused' })).toBeFocused();
  await expect(game(page)).toHaveAttribute('inert', '');
  await expectFits(page);
  await page.keyboard.press('Escape');
  await expect(paused).toHaveCount(0);
  await expect(game(page).locator(':focus')).toHaveCount(1);

  await page.getByRole('button', { name: 'Pause' }).click();
  await paused.getByRole('button', { name: 'Settings' }).click();
  const screens = shellScreens(page);
  const larger = screens.getByRole('button', { name: 'Larger' });
  const size = () => game(page).evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  const was = await size();
  await larger.click();
  await expect(larger).toHaveAttribute('aria-pressed', 'true');
  expect(await size()).toBeCloseTo(was * 1.4, 1);
  await screens.getByRole('button', { name: 'Less' }).click();
  await expect(page.locator('.eb-shell')).toHaveAttribute('data-motion', 'less');
  await expectFits(page);
  await screens.getByRole('button', { name: 'Back' }).click();
  await paused.getByRole('button', { name: 'Quit to title' }).click();
  await expect(screens.getByRole('button', { name: /^Continue/ })).toBeVisible();

  await page.reload();
  await openTitle(page, file);
  await expect(page.locator('.eb-shell')).toHaveAttribute('data-motion', 'less');
  await screens.getByRole('button', { name: /^Continue/ }).click();
  expect(await size()).toBeCloseTo(was * 1.4, 1);
  expect(errors).toEqual([]);
});

test('a slow write holds the next step until it lands, and a failed one says so as play goes on', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  // Writes that land late, or fail with a full disk, on the page's word.
  await page.addInitScript(() => {
    const hooks = window as unknown as { slowWrites: boolean; fullDisk: boolean };
    hooks.slowWrites = false;
    hooks.fullDisk = false;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (hooks.fullDisk) throw new DOMException('The disk is full', 'QuotaExceededError');
      const request = put.apply(this, args);
      if (hooks.slowWrites) {
        const tx = this.transaction;
        const set = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete')?.set;
        Object.defineProperty(tx, 'oncomplete', {
          configurable: true,
          set(done: (event: Event) => void) {
            set?.call(tx, (event: Event) => setTimeout(() => done(event), 800));
          },
        });
      }
      return request;
    };
  });
  const file = hutGame();
  await openTitle(page, file);
  await newGame(page);
  await page.evaluate(() => {
    (window as unknown as { slowWrites: boolean }).slowWrites = true;
  });
  await play(page, 1);
  // The step's view came only once its save had landed: the slot holds that step.
  const { turn } = await seen(page);
  expect(JSON.parse((await storedSave(page, 'slot-1')) ?? '{}').summary.turn).toBe(Number(turn));

  await page.evaluate(() => {
    const hooks = window as unknown as { slowWrites: boolean; fullDisk: boolean };
    hooks.slowWrites = false;
    hooks.fullDisk = true;
  });
  await play(page, 1);
  await expect(page.getByRole('status').filter({ hasText: /^Not saved: / })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { fullDisk: boolean }).fullDisk = false;
  });
  await play(page, 1);
  await expect(page.getByRole('status').filter({ hasText: /^Not saved: / })).toHaveCount(0);
  expect(JSON.parse((await storedSave(page, 'slot-1')) ?? '{}').summary.turn).toBe(Number((await seen(page)).turn));
  expect(errors).toEqual([]);
});
