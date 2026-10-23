/**
 * M4.8's part of the gate (D58): the hut's audio made in the editor alone. Its theme imported in
 * the Assets panel with its provenance; its sounds pasted in, voice by voice, as ZzFX's designer
 * copies them; its two ambiences and its music made with their forms. Each is compared with the
 * fixture as it lands, before the screens, the theme and the feedback name them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { addTo, choose, HUT, landed } from './hutHelpers.ts';
import { newRecord } from './kitHelpers.ts';
import { showAssets } from './ludus.ts';

/** Each sound's voices as ZzFX's designer copies them, and when each voice after the first starts. */
const SOUNDS: Record<string, { voices: string[]; at?: string; bus?: string }> = {
  Load: {
    voices: ['zzfx(...[.8,.1,70,.01,,.18,,,-2])', 'zzfx(...[.4,,600,,,.12,4,,,,,,,.8,,,,,,,-1200])'],
    at: '0.05',
  },
  Coin: { voices: ['zzfx(...[.6,,1200,,.04,.15,5,,,,400,.05])'] },
  Chime: { voices: ['zzfx(...[.7,0,660,.01,,.6])', 'zzfx(...[.7,0,880,.01,,.8])'], at: '0.12' },
  Door: { voices: ['zzfx(...[.9,,55,,,.4,2,,-1,,,,,.3,,,,,,,-600])'] },
  Click: { voices: ['zzfx(...[.5,,1800,,,.03,1])'], bus: 'interface' },
};

async function importTheme(page: Page): Promise<void> {
  const panel = await showAssets(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    panel.getByRole('button', { name: 'Import files' }).click(),
  ]);
  const buffer = readFileSync(join(HUT, 'assets/audio/hut-theme.wav'));
  await chooser.setFiles([{ name: 'hut-theme.wav', mimeType: 'audio/wav', buffer }]);
  const form = panel.getByRole('region', { name: /^Import / });
  await expect(form).toContainText('assets/audio/hut-theme.wav');
  await form.getByLabel('Licence').selectOption('own');
  await form
    .getByLabel('Where it came from')
    .fill("Rendered for the hut by the engine's own ZzFX port (tools/cli/test/fixtures/hut-theme.ts)");
  await form.getByLabel('Date').fill('2026-10-23');
  await form.getByRole('button', { name: 'Import 1 file' }).click();
  await expect(form).toHaveCount(0);
  await landed(page, 'assets/assets.json');
}

async function makeSound(page: Page, name: string): Promise<void> {
  const { voices, at, bus } = SOUNDS[name] as (typeof SOUNDS)[string];
  const form = await newRecord(page, 'sound', 'Sound', name);
  const preview = form.getByRole('region', { name: 'How it sounds' });
  await expect(preview).toContainText('No voices yet');
  for (const [n, zzfx] of voices.entries()) {
    await preview.getByLabel('ZzFX', { exact: true }).fill(zzfx);
    await preview.getByRole('button', { name: 'Paste as a new voice' }).click();
    await expect(form.getByRole('group', { name: `Voices, item ${n + 1}`, exact: true })).toBeVisible();
  }
  if (at !== undefined)
    await form
      .getByRole('group', { name: 'Voices, item 2', exact: true })
      .getByRole('textbox', { name: /^Starts at/ })
      .fill(at);
  if (bus !== undefined) await form.getByLabel(/^Bus/).selectOption(bus);
  await expect(preview).toContainText(/\d\.\d\d s · peak \d\.\d\d as played/);
  await landed(page, `records/sound/${name.toLowerCase()}.json`);
}

/** A layer's fields, each set as a person would: its kind, then whichever of the rest it has. */
async function layer(form: Locator, n: number, fields: Record<string, string>): Promise<Locator> {
  const item = await addTo(form, 'Layers', n);
  for (const [label, value] of Object.entries(fields)) {
    if (['Kind', 'Colour', 'Filter', 'Shape'].includes(label))
      await item.getByLabel(new RegExp(`^${label}`)).selectOption(value);
    else await item.getByRole('textbox', { name: new RegExp(`^${label}`) }).fill(value);
  }
  return item;
}

async function makeAmbiences(page: Page): Promise<void> {
  const hut = await newRecord(page, 'ambience', 'Ambience', 'Hut');
  await layer(hut, 1, { Colour: 'brown', Filter: 'lowpass', Frequency: '450', Gain: '0.5', Sway: '0.4' });
  const wind = await layer(hut, 2, {
    Colour: 'pink',
    Filter: 'bandpass',
    Frequency: '1600',
    Gain: '0.25',
    Sway: '0.6',
  });
  await wind.getByLabel(/^Plays while/).fill('time.day >= 4');
  const door = await addTo(hut, 'Now and then', 1);
  await choose(door, /^Sound/, 'Choose a sound', 'Door (door)');
  await door.getByRole('textbox', { name: /^At least every/ }).fill('25');
  await door.getByRole('textbox', { name: /^At most every/ }).fill('50');
  await expect(hut.getByRole('region', { name: 'How it plays' })).toContainText('Layer 2, as if “time.day >= 4” holds');
  await landed(page, 'records/ambience/hut.json');

  const storm = await newRecord(page, 'ambience', 'Ambience', 'Storm');
  await layer(storm, 1, { Colour: 'white', Filter: 'highpass', Frequency: '2500', Gain: '0.3', Sway: '0.8' });
  await layer(storm, 2, { Colour: 'brown', Filter: 'lowpass', Frequency: '200', Gain: '0.7', Sway: '0.5' });
  await layer(storm, 3, { Kind: 'drone', Shape: 'saw', Frequency: '41', Gain: '0.1' });
  await landed(page, 'records/ambience/storm.json');
}

async function makeMusic(page: Page): Promise<void> {
  const music = await newRecord(page, 'music', 'Music', 'Hut');
  const stem = await addTo(music, 'Stems', 1);
  await choose(stem, /^File/, 'Choose an audio file', 'audio/hut-theme.wav');
  await stem.getByRole('textbox', { name: /^Gain/ }).fill('0.7');
  await music.getByRole('textbox', { name: /^Fade/ }).fill('2');
  await landed(page, 'records/music/hut.json');
}

export async function makeAudio(page: Page): Promise<void> {
  await importTheme(page);
  for (const name of Object.keys(SOUNDS)) await makeSound(page, name);
  await makeAmbiences(page);
  await makeMusic(page);
}
