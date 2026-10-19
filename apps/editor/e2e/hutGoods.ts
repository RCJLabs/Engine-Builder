/**
 * The gate's e2e, its first part: the hut's coins, rope and bread, the guides' guild and the
 * village, the speakers, and the store, which sells by the village's standing. Each made with
 * Records' forms and compared with the fixture as it lands.
 */
import type { Page } from '@playwright/test';
import { addTo, choose, landed, made } from './hutHelpers.ts';

async function makeFaction(page: Page, short: string, name: string): Promise<void> {
  const faction = await made(page, 'faction', 'Faction', short, name);
  await faction.getByLabel(/^Lowest/).fill('-10');
  await faction.getByLabel(/^Highest/).fill('10');
  await landed(page, `records/faction/${short.toLowerCase()}.json`);
}

export async function makeGoods(page: Page): Promise<void> {
  const coins = await made(page, 'resource', 'Resource', 'Coins');
  await coins.getByLabel(/^Starts at/).fill('30');
  await landed(page, 'records/resource/coins.json');
  for (const [short, value] of [
    ['Rope', '8'],
    ['Bread', '2'],
  ] as const) {
    const item = await made(page, 'item', 'Item', short);
    await item.getByLabel(/^Value/).fill(value);
    await landed(page, `records/item/${short.toLowerCase()}.json`);
  }
  await makeFaction(page, 'Guild', 'The guides’ guild');
  await makeFaction(page, 'Village', 'The village');
  for (const [short, name] of [
    ['Greta', undefined],
    ['Anselm', undefined],
    ['Climber', 'A climber'],
  ] as const) {
    await made(page, 'speaker', 'Speaker', short, name);
    await landed(page, `records/speaker/${short.toLowerCase()}.json`);
  }
  const store = await made(page, 'shop', 'Shop', 'Store', 'The hut’s store');
  await choose(store, /^Currency/, 'Choose a resource', 'Coins (coins)');
  const stock = store.getByRole('group', { name: /^Stock/ });
  await store.getByRole('button', { name: 'Add Stock', exact: true }).click();
  for (const [n, item, count] of [
    [1, 'Rope (rope)', '2'],
    [2, 'Bread (bread)', '5'],
  ] as const) {
    const line = await addTo(stock, 'Always', n);
    await choose(line, /^Item/, 'Choose an item', item);
    await line.getByRole('textbox', { name: /^Count/ }).fill(count);
  }
  await choose(store, /^Faction/, 'Choose a faction', 'The village (village)');
  await landed(page, 'records/shop/store.json');
}
