/**
 * M4.8's gate on phones (D58), upright at 360 and 390 px and held sideways: at /play/, the hut's
 * settings turned up and down by touch, each volume's buttons in reach with no target under 44 px
 * and nothing axe finds, the bus following; in the editor, a sound's preview played and varied by
 * touch in the inspector's sheet, in reach.
 */
import { expect, type Page, test } from '@playwright/test';
import { heard, setVolume } from './audioHelpers.ts';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { HUT } from './hutHelpers.ts';
import { newGame, shellScreens } from './hutScreens.ts';
import { hutGame } from './inputHelpers.ts';
import { stored } from './kitHelpers.ts';
import { recordLink, recordsTable } from './ludus.ts';
import { importFolder } from './mapHelpers.ts';
import { openTitle, pauseDialog } from './playShellHelpers.ts';

async function expectInReach(page: Page, scope: string): Promise<void> {
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, scope)).toEqual([]);
  await expectNoAxeIssues(page);
}

for (const viewport of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test.describe(`the hut's audio, phone ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true, actionTimeout: 20_000 });

    test('the volumes turned by touch at /play/, in reach, each bus following', async ({ page }) => {
      test.setTimeout(120_000);
      const errors = watchErrors(page);
      await openTitle(page, hutGame(), (b) => b.tap());
      await newGame(page, (b) => b.tap());
      await expect.poll(async () => (await heard(page))?.context).toBe('running');
      await page.getByRole('button', { name: 'Pause' }).tap();
      await pauseDialog(page).getByRole('button', { name: 'Settings' }).tap();
      const tap = (b: ReturnType<Page['getByRole']>) => b.tap();
      await setVolume(page, 'Music', '50', tap);
      await setVolume(page, 'Effects', '70', tap);
      await expect
        .poll(async () => (await heard(page))?.buses)
        .toMatchObject({ master: 0.8, music: 0.3, effects: 0.7, interface: 0.42 });
      const music = shellScreens(page).getByRole('group', { name: 'Music', exact: true });
      await music.getByRole('button', { name: 'Music louder' }).scrollIntoViewIfNeeded();
      await expectInReach(page, '.eb-shell-screens');
      await setVolume(page, 'Ambience', 'Off', tap);
      await expect(shellScreens(page).getByRole('button', { name: 'Ambience quieter' })).toBeDisabled();
      await expect.poll(async () => (await heard(page))?.buses).toMatchObject({ ambience: 0 });
      expect(errors).toEqual([]);
    });

    test('a sound’s preview played and varied by touch in the inspector’s sheet', async ({ page }) => {
      test.setTimeout(120_000);
      const errors = watchErrors(page);
      await importFolder(page, HUT, 'the-hut', 'The hut');
      await page.getByRole('tab', { name: 'Records' }).tap();
      await page.getByLabel('Type', { exact: true }).selectOption('sound');
      await recordLink(recordsTable(page, 'Sound'), 'coin').tap();
      const form = page.getByRole('region', { name: 'Sound coin' });
      const preview = form.getByRole('region', { name: 'How it sounds' });
      await preview.getByRole('button', { name: 'Play', exact: true }).tap();
      await expect.poll(async () => (await heard(page))?.played.at(-1)).toMatchObject({ kind: 'sound', id: 'coin' });
      await expectInReach(page, '[data-panel="inspector"]');
      const was = await stored(page, 'the-hut', 'records/sound/coin.json');
      await preview.getByRole('button', { name: 'Vary' }).tap();
      await expect.poll(() => stored(page, 'the-hut', 'records/sound/coin.json')).not.toEqual(was);
      // Its shape stays a square: Vary moves numbers only.
      expect(await stored(page, 'the-hut', 'records/sound/coin.json')).toMatchObject({
        voices: [expect.objectContaining({ shape: 'square' })],
      });
      expect(errors).toEqual([]);
    });
  });
}
