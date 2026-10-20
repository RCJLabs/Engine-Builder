/**
 * M4.5's gate (D55), the screens it makes: ui/journal.json and ui/hut.json, each from a blank
 * screen in the designer alone, typing no JSON, as a person would make them; and the frame's check
 * that nothing it draws reaches past the game's box. Shared by the desktop and phone specs.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { act, add, hit, newBlank, pick, tick, type } from './designerHelpers.ts';

/** A box ticked or not, pressed as the device presses. */
async function setBox(box: Locator, on: boolean): Promise<void> {
  if ((await box.isChecked()) !== on) await hit(box);
  await (on ? expect(box).toBeChecked() : expect(box).not.toBeChecked());
}

/** ui/journal.json, from a blank screen: a modal of three tabs, two lists and a log, and a Close. */
export async function makeJournal(page: Page): Promise<Locator> {
  const region = await newBlank(page, 'journal');
  await pick(region, 'Screen');
  await type(region, /^Title/, 'Journal');
  await tick(region, 'Modal: drawn over the screen below (optional)');
  // The blank's main is a stack with a title: the journal's is tabs.
  await pick(region, 'Main: Stack');
  await act(region, 'Delete');
  await pick(region, 'Main: empty');
  await add(region, 'Tabs');
  await act(region, 'Add tab');
  await act(region, 'Add tab');
  for (const [n, label] of ['Quests', 'Bag', 'Log'].entries()) {
    await pick(region, `Tab Tab ${n + 1}`);
    await type(region, 'Label', label);
  }
  await pick(region, 'Tab Quests');
  await add(region, 'List');
  await region.getByLabel('Lists').selectOption('journal');
  await type(region, /^When empty/, 'Nothing in the journal yet.');
  await pick(region, 'Item: Text');
  await act(region, 'Delete');
  await pick(region, 'Item: empty');
  await add(region, 'Panel');
  for (const [text, style] of [
    ['{.name}', 'heading'],
    ['{.log}', ''],
    ['{.objectives}', 'caption'],
  ] as const) {
    await pick(region, 'Item: Panel');
    await add(region, 'Text');
    await type(region, 'Text', text);
    if (style) await region.getByLabel(/^Style/).selectOption(style);
  }
  await pick(region, 'Tab Bag');
  await add(region, 'List');
  await region.getByLabel('Lists').selectOption('bag');
  await type(region, /^When empty/, 'The bag is empty.');
  await pick(region, 'Item: Text');
  await type(region, 'Text', '{.name} ×{.count}');
  await pick(region, 'Tab Log');
  await add(region, 'Log');
  await type(region, /^Lines/, '20');
  await type(region, /^Label/, 'The season so far');
  await type(region, /^When empty/, 'Nothing yet.');
  // The blank's Close stays, its words changed, in a row of its own at the end.
  await pick(region, 'Bottom: Button');
  await act(region, 'Wrap in stack');
  await region.getByLabel(/^Direction/).selectOption('row');
  await region.getByLabel(/^Justify/).selectOption('end');
  await pick(region, 'Button');
  await type(region, 'Label', 'Close the journal');
  return region;
}

/** A button added to the selected grid: its label, style, the action it takes and its arguments. */
export async function button(
  region: Locator,
  label: string,
  take: string,
  extra: { primary?: boolean; who?: string } = {},
) {
  await pick(region, 'Grid');
  await add(region, 'Button');
  await type(region, 'Label', label);
  if (extra.primary) await region.getByLabel(/^Style/).selectOption('primary');
  await region.getByLabel('Action to take').selectOption(take);
  if (extra.who) {
    await hit(region.getByRole('button', { name: 'Add argument' }));
    await type(region, 'Argument 1 name', 'who');
    await type(region, 'Argument 1 value', extra.who);
  }
}

/** The grid's columns at a device's breakpoint alone, the frame turned to it first. */
export async function columnsAt(region: Locator, device: string, turned: boolean, breakpoint: string, columns: string) {
  await region.getByLabel('Device').selectOption({ label: device });
  const turn = region.getByRole('button', { name: 'Turn' });
  if ((await turn.getAttribute('aria-pressed')) !== String(turned)) await hit(turn);
  await expect(region.getByTestId('designer-breakpoint')).toContainText(`lays out as ${breakpoint}`);
  await setBox(region.getByLabel(`Change layout at ${breakpoint} only`), true);
  await type(region, new RegExp(`^Columns at ${breakpoint}`), columns);
}

/** ui/hut.json, from a blank screen: the day and coins on top, the season, the hut's words, six buttons and the log. */
export async function makeHut(page: Page): Promise<Locator> {
  const region = await newBlank(page, 'hut');
  await pick(region, 'Screen');
  await type(region, /^Title/, 'The hut');
  await tick(region, 'hut');
  await pick(region, 'Top: empty');
  await add(region, 'Stack');
  await region.getByLabel(/^Direction/).selectOption('row');
  await region.getByLabel(/^Justify/).selectOption('between');
  await tick(region, 'Wrap (optional)');
  for (const text of ['Day {time.day} of 10', '{economy.amount(resource: coins)} coins']) {
    await pick(region, 'Top: Stack');
    await add(region, 'Text');
    await type(region, 'Text', text);
    await region.getByLabel(/^Style/).selectOption('heading');
  }
  await pick(region, 'Main: Stack');
  await type(region, /^Gap/, '2');
  // The blank's title text goes: the hut's main starts with the season.
  await pick(region, 'Text', 2);
  await act(region, 'Delete');
  await pick(region, 'Main: Stack');
  await add(region, 'Progress bar');
  await type(region, 'Value', '{time.day}');
  await type(region, 'Label', 'The season');
  await pick(region, 'Main: Stack');
  await add(region, 'Panel');
  for (const [text, style] of [
    [
      'Keep the hut through the season: carry loads up from the village, keep the store, and see to the guides.',
      'body',
    ],
    [
      'The guides’ guild: {factions.standing(faction: guild)}. The village: {factions.standing(faction: village)}.',
      'caption',
    ],
  ] as const) {
    await pick(region, 'Panel');
    await add(region, 'Text');
    await type(region, 'Text', text);
    await region.getByLabel(/^Style/).selectOption(style);
  }
  await pick(region, 'Main: Stack');
  await add(region, 'Grid');
  await type(region, 'Columns', '1');
  await type(region, /^Gap/, '1');
  await columnsAt(region, 'Phone, 390 × 844', true, 'landscape', '2');
  await columnsAt(region, 'Tablet, 820 × 1180', false, 'tablet', '2');
  await columnsAt(region, 'Desktop, 1280 × 800', false, 'desktop', '3');
  await setBox(region.getByLabel('Change layout at desktop only'), false);
  await button(region, 'Carry a load up', 'hut/carry', { primary: true });
  await button(region, 'Rest a day', 'hut/rest');
  await button(region, 'Open the store', 'hut/store');
  await button(region, 'Visit Greta', 'hut/visit', { who: 'greta' });
  await button(region, 'Visit Anselm', 'hut/visit', { who: 'anselm' });
  await button(region, 'Close the hut for the winter', 'hut/close', { primary: true });
  await type(region, /^Shows when/, 'time.day >= 10');
  await pick(region, 'Main: Stack');
  await add(region, 'Log');
  await type(region, /^Lines/, '3');
  await type(region, /^Label/, 'Lately');
  await type(region, /^When empty/, 'Nothing has happened yet.');
  await pick(region, 'Bottom: Button');
  await act(region, 'Wrap in stack');
  await region.getByLabel(/^Direction/).selectOption('row');
  await region.getByLabel(/^Justify/).selectOption('end');
  await pick(region, 'Button', 6);
  await type(region, 'Label', 'Journal');
  await region.getByLabel('It', { exact: true }).selectOption('open');
  await region.getByLabel('Screen to open').selectOption('journal');
  return region;
}

/** Nothing the frame draws reaches past the game's own box, side to side. */
export async function expectFrameFits(region: Locator): Promise<void> {
  const past = await region.getByTestId('designer-frame').evaluate((frame) => {
    const game = frame.querySelector('.eb-game')?.getBoundingClientRect();
    if (!game) return ['no game'];
    return [...frame.querySelectorAll('.eb-game *')]
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && (box.left < game.left - 1 || box.right > game.right + 1))
      .map(({ element }) => `${element.tagName.toLowerCase()}.${element.className}`);
  });
  expect(past).toEqual([]);
}
