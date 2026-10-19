/**
 * The gate's e2e, the hut's quests, one from each mission family left once the storm is the
 * choice event: stocking the hut in steps, the ridge as a timed job, and the loads counted. Made
 * with the quest's form and compared with the fixture as each lands.
 */
import type { Locator, Page } from '@playwright/test';
import { addEffect, addTo, choose, landed, made } from './hutHelpers.ts';
import { standing } from './hutStory.ts';

async function addStage(quest: Locator, n: number, id: string, log: string): Promise<Locator> {
  const stage = await addTo(quest, 'Stages', n);
  await stage.getByLabel('Id', { exact: true }).fill(id);
  await stage.getByLabel(/^Log/).fill(log);
  return stage;
}

async function addObjective(stage: Locator, id: string, text: string): Promise<Locator> {
  const objective = await addTo(stage, 'Objectives', 1);
  await objective.getByLabel('Id', { exact: true }).fill(id);
  await objective.getByLabel(/^Text/).fill(text);
  return objective;
}

/** An objective done once `event` is heard `times` times, with the arguments in `args`. */
async function counted(objective: Locator, event: string, times: string, args: Record<string, string> = {}) {
  await objective.getByRole('button', { name: 'Add Count', exact: true }).click();
  const count = objective.getByRole('group', { name: 'Count (optional)', exact: true });
  await count.getByLabel('Event', { exact: true }).fill(event);
  for (const [key, value] of Object.entries(args)) {
    await count.getByLabel('New key for With').fill(key);
    await count.getByRole('button', { name: 'Add to With' }).click();
    await count.getByLabel(`With: ${key}`, { exact: true }).fill(value);
  }
  await count.getByRole('textbox', { name: /^Times/ }).fill(times);
}

async function coins(stage: Locator, by: string): Promise<void> {
  const pays = await addEffect(stage, 'Effects', 'Add to a resource');
  await choose(pays, /^Resource/, 'Choose a resource', 'Coins (coins)');
  await pays.getByLabel(/^By/).fill(by);
}

async function makeSupplies(page: Page): Promise<void> {
  const quest = await made(page, 'quest', 'Quest', 'Supplies', 'Stock the hut');
  await quest.getByLabel('Starts with the game (optional)', { exact: true }).check();
  const buy = await addStage(quest, 1, 'buy', 'The shelves are bare. A rope from the store comes first.');
  const rope = await addObjective(buy, 'rope', 'Buy a rope');
  await rope.getByLabel(/^Done when/).fill('inventory.count(item: rope) >= 1');
  await buy.getByLabel(/^Then/).fill('ask');
  const ask = await addStage(quest, 2, 'ask', 'Greta will know what else the season needs.');
  await counted(await addObjective(ask, 'greta', 'Talk to Greta'), 'dialogue/ended', '1', { talk: 'greta' });
  await ask.getByLabel(/^Then/).fill('stocked');
  const stocked = await addStage(quest, 3, 'stocked', 'The hut is ready for the season.');
  await standing(stocked, 'Effects', 'The village (village)', '1');
  await landed(page, 'records/quest/supplies.json');
}

async function makeRidge(page: Page): Promise<void> {
  const quest = await made(page, 'quest', 'Quest', 'Guiding', 'The ridge');
  const up = await addStage(quest, 1, 'up', 'You and Anselm take a party up the ridge.');
  await up.getByRole('button', { name: 'Add Job', exact: true }).click();
  const job = up.getByRole('group', { name: 'Job (optional)', exact: true });
  await job.getByLabel('New key for Takes').fill('days');
  await job.getByRole('button', { name: 'Add to Takes' }).click();
  await job.getByLabel('Takes: days', { exact: true }).fill('2');
  for (const [n, chance, text, next] of [
    [1, '70', 'the party tops out', 'topped'],
    [2, '30', 'the weather turns them back', 'turned'],
  ] as const) {
    const outcome = await addTo(job, 'Outcomes', n);
    await outcome.getByRole('textbox', { name: /^Chance/ }).fill(chance);
    await outcome.getByLabel(/^Text/).fill(text);
    await outcome.getByLabel(/^Leads to/).fill(next);
  }
  const topped = await addStage(quest, 2, 'topped', 'The party topped out, and the guild paid you.');
  await coins(topped, '15');
  await standing(topped, 'Effects', 'The guides’ guild (guild)', '2');
  const turned = await addStage(quest, 3, 'turned', 'The weather turned the party back.');
  await turned.getByLabel('Fails (optional)', { exact: true }).check();
  await landed(page, 'records/quest/guiding.json');
}

async function makeLoads(page: Page): Promise<void> {
  const quest = await made(page, 'quest', 'Quest', 'Loads', 'Loads for the village');
  await quest.getByLabel('Starts with the game (optional)', { exact: true }).check();
  const carry = await addStage(quest, 1, 'carry', 'The village needs five loads carried up before the season ends.');
  await counted(await addObjective(carry, 'loads', 'Carry five loads up'), 'hut/carried', '5');
  await carry.getByLabel(/^Then/).fill('thanked');
  await carry.getByRole('textbox', { name: /^Days/ }).fill('9');
  await carry.getByLabel(/^Why it fails/).fill('The season ended first.');
  const thanked = await addStage(quest, 2, 'thanked', 'The village thanked you with coins.');
  await coins(thanked, '10');
  await standing(thanked, 'Effects', 'The village (village)', '2');
  await landed(page, 'records/quest/loads.json');
}

export async function makeQuests(page: Page): Promise<void> {
  await makeSupplies(page);
  await makeRidge(page);
  await makeLoads(page);
}
