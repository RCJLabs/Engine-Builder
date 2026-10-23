/**
 * M4.8's gate (D58), on desktop: the hut heard in the Play panel and at /play/, as its page's hook
 * tells it. No context until the first press; the hut's ambience and music at the start, the
 * storm's ambience while its screen is up, the rain as its condition comes to hold, quiet once
 * the hut is shut; each feedback
 * line's sound as its beat comes and its buzz caught from `navigator.vibrate`. Sound at 0 makes no
 * context, Music at 0 sets its bus to 0, a hidden page suspends. Above a sound's form, Play plays
 * it, Start from and Paste ZzFX fill it; above an ambience's and a music's, Play plays them through
 * the game's own player, a condition ticked to hear it as if it held.
 */
import { expect, test } from '@playwright/test';
import { buzzes, catchBuzzes, gather, heard, setHidden, setVolume } from './audioHelpers.ts';
import { expectNoAxeIssues, expectNothingOffscreen, smallTargets, watchErrors } from './checks.ts';
import { HUT } from './hutHelpers.ts';
import { game, newGame, nextPress, press, shellScreens, showPlay, topScreen } from './hutScreens.ts';
import { hutGame } from './inputHelpers.ts';
import { newRecord, stored } from './kitHelpers.ts';
import { openRecord } from './ludus.ts';
import { importFolder } from './mapHelpers.ts';
import { openTitle, pauseDialog } from './playShellHelpers.ts';

test.use({ viewport: { width: 1280, height: 900 }, actionTimeout: 20_000 });

test('the hut heard in the Play panel: nothing before a press, its beds, the storm’s, each line’s sound and buzz', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await catchBuzzes(page);
  await importFolder(page, HUT, 'the-hut', 'The hut');
  const panel = await showPlay(page);
  await panel.getByRole('button', { name: 'Run its scripts' }).click();
  await panel.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(shellScreens(page).getByRole('button', { name: 'New game' })).toBeVisible();
  // Open at its title, nothing pressed in it yet: the player is there, its context isn't.
  expect(await heard(page)).toMatchObject({ context: 'none', buses: {} });

  await newGame(page);
  await expect
    .poll(() => heard(page))
    .toMatchObject({
      context: 'running',
      ambience: 'hut',
      music: 'hut',
      // The rain waits for day 4; the door comes now and then; the stem plays at its gain.
      levels: { 'layer/0': 1, 'layer/1': 0, 'then/0': 1, 'stem/0': 0.7 },
      buses: { master: 0.8, music: 0.6, ambience: 0.7, effects: 1, interface: 0.6 },
      // The player sets each layer and the stem to its level, the stem once its file is decoded.
      gains: { 'layer/0': 1, 'layer/1': 0, 'stem/0': 0.7 },
    });

  const all = new Set<string>();
  await press(page, topScreen(page).getByRole('button', { name: 'Carry a load up' }));
  // The line's sound and its buzz, and the theme's click for the press itself.
  await expect
    .poll(async () => [...(await gather(page, all))])
    .toEqual(expect.arrayContaining(['sound:click', 'sound:load', 'buzz:knock']));
  expect(await buzzes(page)).toContainEqual([30]);
  // Each through its bus: the click the interface's, the load the effects'.
  const played = (await heard(page))?.played ?? [];
  expect(played).toContainEqual(expect.objectContaining({ kind: 'sound', id: 'click', bus: 'interface' }));
  expect(played).toContainEqual(expect.objectContaining({ kind: 'sound', id: 'load', bus: 'effects' }));

  let stormHeard = false;
  let rainHeard = false;
  for (let turn = 0; turn < 60; turn++) {
    const next = await nextPress(page);
    if (!next) break;
    if (next.title === 'An event') {
      // The storm's screen names its own ambience; the hut's music, named below it, plays on.
      await expect
        .poll(() => heard(page))
        .toMatchObject({ ambience: 'storm', music: 'hut', gains: { 'layer/2': 1, 'stem/0': 0.7 } });
      stormHeard = true;
    }
    await press(page, next.button);
    await gather(page, all);
    if (next.title === 'An event' && !(await game(page).getByRole('dialog').isVisible()))
      await expect.poll(async () => (await heard(page))?.ambience).toBe('hut');
    // The rain comes in once its condition holds, from day 4.
    const now = await heard(page);
    if (now?.ambience === 'hut' && now.levels['layer/1'] === 1 && now.gains?.['layer/1'] === 1) rainHeard = true;
  }
  expect(stormHeard).toBe(true);
  expect(rainHeard).toBe(true);
  await expect(topScreen(page).getByText('The hut is closed for the winter.')).toBeVisible();
  // The closed hut's screen names no ambience or music: the season ends in quiet.
  await expect.poll(() => heard(page)).toMatchObject({ context: 'running', levels: {} });
  expect((await heard(page))?.ambience).toBeUndefined();
  await gather(page, all);
  expect([...all]).toEqual(
    expect.arrayContaining(['sound:coin', 'sound:chime', 'buzz:double', 'sound:door', 'buzz:thud']),
  );
  // One buzz a step, the heaviest of its lines': the thud as the hut shuts.
  expect(await buzzes(page)).toContainEqual([70]);
  expect(errors).toEqual([]);
});

test('at /play/: Sound at 0 makes no context, Music at 0 its bus, and a hidden page suspends', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await catchBuzzes(page);
  const file = hutGame();
  await openTitle(page, file);
  const screens = shellScreens(page);
  await screens.getByRole('button', { name: 'Settings' }).click();
  await setVolume(page, 'Sound', 'Off');
  // The press on Settings started the context; Sound at 0 suspends it.
  await expect.poll(async () => (await heard(page))?.context).toBe('suspended');
  await screens.getByRole('button', { name: 'Back' }).click();

  // Kept across a reload: with Sound off, presses make no context and play no sound, but still buzz.
  await page.reload();
  await openTitle(page, file);
  await newGame(page);
  await press(page, topScreen(page).getByRole('button', { name: 'Carry a load up' }));
  await expect.poll(async () => (await heard(page))?.played.map((p) => `${p.kind}:${p.id}`)).toEqual(['buzz:knock']);
  expect((await heard(page))?.context).toBe('none');

  await page.getByRole('button', { name: 'Pause' }).click();
  await pauseDialog(page).getByRole('button', { name: 'Settings' }).click();
  // Raising Sound is itself a press: the context starts, at the level set.
  await setVolume(page, 'Sound', '10');
  await expect.poll(() => heard(page)).toMatchObject({ context: 'running', buses: { master: 0.1, music: 0.6 } });
  await setVolume(page, 'Music', 'Off');
  await expect.poll(async () => (await heard(page))?.buses).toMatchObject({ master: 0.1, music: 0, ambience: 0.7 });
  await expectNothingOffscreen(page);
  expect(await smallTargets(page, '.eb-shell-screens')).toEqual([]);
  await expectNoAxeIssues(page);
  await screens.getByRole('button', { name: 'Back' }).click();
  await pauseDialog(page).getByRole('button', { name: 'Resume' }).click();

  await setHidden(page, true);
  await expect.poll(async () => (await heard(page))?.context).toBe('suspended');
  await setHidden(page, false);
  await expect.poll(async () => (await heard(page))?.context).toBe('running');
  await press(page, topScreen(page).getByRole('button', { name: 'Carry a load up' }));
  await expect.poll(async () => (await heard(page))?.played.some((p) => p.id === 'load')).toBe(true);
  // Back at the title nothing plays: no ambience, no music.
  await page.getByRole('button', { name: 'Pause' }).click();
  await pauseDialog(page).getByRole('button', { name: 'Quit to title' }).click();
  await expect.poll(() => heard(page)).toMatchObject({ levels: {}, gains: {} });
  expect((await heard(page))?.ambience).toBeUndefined();
  expect(errors).toEqual([]);
});

test('above a sound’s form: Play, Start from and Paste ZzFX; above an ambience’s and a music’s: Play, a condition held', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await importFolder(page, HUT, 'the-hut', 'The hut');
  const load = await openRecord(page, 'Sound', 'load');
  const sounds = load.getByRole('region', { name: 'How it sounds' });
  await expect(sounds.locator('.sound-note')).toHaveText(/^0\.\d\d s · peak 0\.\d\d as played$/);
  await sounds.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => (await heard(page))?.played.at(-1)).toMatchObject({ kind: 'sound', id: 'load' });
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  const zap = await newRecord(page, 'sound', 'Sound', 'Zap');
  const preview = zap.getByRole('region', { name: 'How it sounds' });
  await expect(preview.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await preview.getByLabel('Start from').selectOption('Laser');
  const voices = async () =>
    ((await stored(page, 'the-hut', 'records/sound/zap.json')) as { voices?: unknown[] })?.voices;
  await expect.poll(voices).toEqual([expect.objectContaining({ shape: 'saw' })]);
  // A preset is drawn from its ranges each time: Laser again is another laser.
  const first = await voices();
  await preview.getByLabel('Start from').selectOption('Laser');
  await expect.poll(voices).not.toEqual(first);
  expect(await voices()).toEqual([expect.objectContaining({ shape: 'saw' })]);
  await expect(preview.locator('.sound-note')).toHaveText(/ s · peak /);

  const zzfx = preview.getByLabel('ZzFX', { exact: true });
  await zzfx.fill('zzfx(...[1,,loud])');
  await preview.getByRole('button', { name: 'Paste as a new voice' }).click();
  await expect(preview.getByRole('alert')).toHaveText(/isn’t a ZzFX sound/);
  await zzfx.fill('zzfx(...[.5,,1800,,,.03,1])');
  await preview.getByRole('button', { name: 'Paste as a new voice' }).click();
  await expect(preview.getByRole('alert')).toHaveCount(0);
  await expect
    .poll(voices)
    .toEqual([
      expect.objectContaining({ shape: 'saw' }),
      { volume: 0.5, frequency: 1800, release: 0.03, shape: 'triangle' },
    ]);
  // One step of undo takes the pasted voice back out.
  await page.getByRole('button', { name: /^Undo: Paste a ZzFX voice/ }).click();
  await expect.poll(async () => (await voices())?.length).toBe(1);

  const hut = await openRecord(page, 'Ambience', 'hut');
  const loop = hut.getByRole('region', { name: 'How it plays' });
  await loop.getByRole('button', { name: 'Play', exact: true }).click();
  await expect
    .poll(() => heard(page))
    .toMatchObject({ context: 'running', ambience: 'hut', levels: { 'layer/0': 1, 'layer/1': 0, 'then/0': 1 } });
  await loop.getByLabel('Layer 2, as if “time.day >= 4” holds').check();
  await expect.poll(async () => (await heard(page))?.levels).toMatchObject({ 'layer/1': 1 });
  await expectNoAxeIssues(page);
  await loop.getByRole('button', { name: 'Stop' }).click();
  await expect.poll(async () => (await heard(page))?.context).toBe('none');

  const music = await openRecord(page, 'Music', 'hut');
  await music.getByRole('region', { name: 'How it plays' }).getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(() => heard(page)).toMatchObject({ context: 'running', music: 'hut', levels: { 'stem/0': 0.7 } });
  expect(errors).toEqual([]);
});
