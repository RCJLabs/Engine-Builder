/**
 * The gate's e2e, the hut's talks and its storm: Greta's talk and Anselm's, made with the talk's
 * form, Anselm's opening only while the ridge waits and starting it; and the storm, a choice
 * event whose search is rolled. Each compared with the fixture as it lands.
 */
import type { Locator, Page } from '@playwright/test';
import { addEffect, addTo, choose, landed, made } from './hutHelpers.ts';

async function addLine(talk: Locator, n: number, id: string, text: string): Promise<Locator> {
  const line = await addTo(talk, 'Lines', n);
  await line.getByLabel('Id', { exact: true }).fill(id);
  await line.getByLabel(/^Text/).fill(text);
  return line;
}

async function addOption(line: Locator, n: number, id: string, label: string, next?: string): Promise<Locator> {
  const option = await addTo(line, 'Options', n);
  await option.getByLabel('Id', { exact: true }).fill(id);
  await option.getByLabel('Label', { exact: true }).fill(label);
  if (next !== undefined) await option.getByLabel(/^Leads to/).fill(next);
  return option;
}

/** A standing changed by `by`, as an effect in `scope`'s list `list`. */
export async function standing(scope: Locator, list: string, faction: string, by: string): Promise<void> {
  const effect = await addEffect(scope, list, 'Change a standing');
  await choose(effect, /^Faction/, 'Choose a faction', faction);
  await effect.getByLabel(/^By/).fill(by);
}

export async function makeGreta(page: Page): Promise<void> {
  const talk = await made(page, 'talk', 'Talk', 'Greta');
  await choose(talk, /^Speaker/, 'Choose a speaker', 'Greta (greta)');
  const start = await addTo(talk, 'Starts', 1);
  await start.getByLabel(/^Line/).fill('hello');
  const hello = await addLine(
    talk,
    1,
    'hello',
    'The season up here is short. Rope and bread first; the guides come after.',
  );
  await addOption(hello, 1, 'guild', 'Ask about the guild', 'guild');
  const village = await addOption(hello, 2, 'village', 'Ask about the village', 'village');
  await village.getByLabel(/^Once/).check();
  await standing(village, 'Effects', 'The village (village)', '1');
  await addOption(hello, 3, 'thanks', 'Thank her');
  await addLine(talk, 2, 'guild', 'Anselm leads their parties. Feed them, and the guild pays.');
  await addLine(talk, 3, 'village', 'Carry their loads up, and the village remembers.');
  await landed(page, 'records/talk/greta.json');
}

/** Anselm's talk: made once the ridge is, since taking the party starts it. */
export async function makeAnselm(page: Page): Promise<void> {
  const talk = await made(page, 'talk', 'Talk', 'Anselm');
  await choose(talk, /^Speaker/, 'Choose a speaker', 'Anselm (anselm)');
  const waiting = await addTo(talk, 'Starts', 1);
  await waiting.getByLabel(/^If/).fill('quests.state(quest: guiding) == waiting');
  await waiting.getByLabel(/^Line/).fill('ask');
  const busy = await addTo(talk, 'Starts', 2);
  await busy.getByLabel(/^Line/).fill('busy');
  const ask = await addLine(talk, 1, 'ask', 'A party wants the ridge. Will you take them up with me?');
  const take = await addOption(ask, 1, 'take', 'Take them up', 'set');
  const starts = await addEffect(take, 'Effects', 'Start a quest');
  await choose(starts, /^Quest/, 'Choose a quest', 'The ridge (guiding)');
  await addOption(ask, 2, 'not-now', 'Not now');
  await addLine(talk, 2, 'set', 'Two days, then. Bring the rope.');
  await addLine(talk, 3, 'busy', 'Good luck with the season.');
  await landed(page, 'records/talk/anselm.json');
}

export async function makeStorm(page: Page): Promise<void> {
  const storm = await made(page, 'event', 'Event', 'Storm', 'A storm');
  await storm
    .getByLabel(/^Text/)
    .fill('A storm comes over the col in the afternoon, and a party is still out on the ridge.');
  const search = await addTo(storm, 'Choices', 1);
  await search.getByLabel('Id', { exact: true }).fill('search');
  await search.getByLabel('Label', { exact: true }).fill('Go out and look for them');
  const found = await addTo(search, 'Outcomes', 1);
  await found.getByRole('textbox', { name: /^Chance/ }).fill('60');
  await found.getByLabel(/^Result/).fill('You find them below the col and bring them in.');
  await standing(found, 'Effects', 'The guides’ guild (guild)', '2');
  const lost = await addTo(search, 'Outcomes', 2);
  await lost.getByRole('textbox', { name: /^Chance/ }).fill('40');
  await lost.getByLabel(/^Result/).fill('The snow drives you back alone.');
  const lamp = await addTo(storm, 'Choices', 2);
  await lamp.getByLabel('Id', { exact: true }).fill('lamp');
  await lamp.getByLabel('Label', { exact: true }).fill('Keep a lamp in the window');
  await lamp.getByLabel(/^Result/).fill('They find their own way in at midnight.');
  await standing(lamp, 'Effects', 'The guides’ guild (guild)', '1');
  await landed(page, 'records/event/storm.json');
}
