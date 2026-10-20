/**
 * M4.6's gate on desktop (D56). The drift, a slice of Space-Wrecked's sector run, without its map
 * and its way in: the kind made with New kind and the sector's rules made in the World panel with
 * forms, each landing as the fixture holds it; the check over 300 seeds holding every rule, one
 * broken on purpose to open its first bad seed, then mended; its bots run in the editor as `eb sim`
 * runs them; and a player who flies it to the exit through the map widget, every jump's cost on its
 * button. Then the valley, drawn by hand in Dirtbag's style with forms, a place dragged and the drag
 * undone, a tap opening its row, and its drives run as `eb sim` runs them.
 */
import { execFileSync } from 'node:child_process';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, watchErrors } from './checks.ts';
import { game, topScreen } from './hutScreens.ts';
import { pick, showLogic, stored } from './kitHelpers.ts';
import { REPO } from './ludus.ts';
import {
  DRIFT,
  expectMapLaidOut,
  fixtureJson,
  flyHome,
  importFolder,
  showWorld,
  startDrift,
  VALLEY,
  without,
} from './mapHelpers.ts';

test.use({ viewport: { width: 1280, height: 900 } });

const KIND = 'Choose a node kind';

async function addEffect(scope: Locator, label: string): Promise<Locator> {
  const effects = scope.getByRole('group', { name: 'Effects (optional)', exact: true });
  await effects.getByLabel('Effect to add to Effects', { exact: true }).selectOption({ label });
  await effects.getByRole('button', { name: 'Add effect to Effects', exact: true }).click();
  return effects;
}

/** A move's id, label, reach, cost in supplies and what it does to heat. */
async function fillMove(page: Page, move: Locator, id: string, label: string, supplies: number, heat: number) {
  await move.getByLabel('Id', { exact: true }).fill(id);
  await move.getByLabel('Label', { exact: true }).fill(label);
  await move.getByRole('button', { name: 'Add to Cost' }).click();
  await page
    .getByRole('dialog', { name: 'Add to Cost' })
    .getByRole('option', { name: /^Supplies/ })
    .click();
  await move.getByLabel('Cost: supplies', { exact: true }).fill(String(supplies));
  const effects = await addEffect(move, 'Add to a flag');
  await effects.getByRole('combobox', { name: 'Flag', exact: true }).selectOption('heat');
  await effects.getByRole('textbox', { name: 'By', exact: true }).fill(String(heat));
}

/** An item added to a list in `scope`, as its group. */
async function addTo(scope: Locator, list: string, n: number): Promise<Locator> {
  await scope.getByRole('button', { name: `Add to ${list}`, exact: true }).click();
  const item = scope.getByRole('group', { name: `${list}, item ${n}`, exact: true });
  await expect(item).toBeVisible();
  return item;
}

/** A placed-first rule: a kind, how many, none two in a layer. */
async function placeRule(page: Page, layers: Locator, n: number, kind: RegExp, count: number) {
  const rule = await addTo(layers, 'Placed first', n);
  await pick(page, rule, /^Kind/, KIND, kind);
  await rule.getByRole('textbox', { name: 'At least', exact: true }).fill(String(count));
  await rule.getByRole('textbox', { name: 'At most', exact: true }).fill(String(count));
  await rule.getByLabel(/^Apart/).check();
}

/** The sector's rules, filled in the form New layered map opened. */
async function makeSector(page: Page, map: Locator): Promise<void> {
  const sector = fixtureJson(DRIFT, 'records/map/sector.json') as { description: string };
  await map.getByLabel('Name', { exact: true }).fill('The sector');
  await map.getByLabel('Description (optional)').fill(sector.description);
  const layers = map.getByRole('group', { name: 'Layers (optional)', exact: true });
  await layers.getByRole('textbox', { name: 'Layers', exact: true }).fill('7');
  const widths = layers.getByRole('group', { name: 'Nodes in a layer', exact: true });
  await widths.getByRole('textbox', { name: 'At least', exact: true }).fill('2');
  await widths.getByRole('textbox', { name: 'At most', exact: true }).fill('3');
  await pick(page, layers, /^Start /, KIND, /^Way in/);
  await pick(page, layers, /^End /, KIND, /^Jump point/);
  await layers.getByRole('textbox', { name: 'Extra link (optional)', exact: true }).fill('35');
  await placeRule(page, layers, 1, /^Station/, 2);
  await placeRule(page, layers, 2, /^Nebula/, 1);
  const mix: [RegExp, number][] = [
    [/^Empty space/, 2],
    [/^Derelict/, 2],
    [/^Distress call/, 2],
    [/^Trader/, 1],
    [/^Hazard/, 2],
    [/^Hostile ship/, 2],
  ];
  for (const [i, [kind, weight]] of mix.entries()) {
    const entry =
      i === 0 ? layers.getByRole('group', { name: 'Mix, item 1', exact: true }) : await addTo(layers, 'Mix', i + 1);
    await pick(page, entry, /^Kind/, KIND, kind);
    await entry.getByRole('textbox', { name: 'Weight', exact: true }).fill(String(weight));
  }
  await fillMove(page, map.getByRole('group', { name: 'Moves, item 1', exact: true }), 'jump', 'Jump', 1, 2);
  const long = await addTo(map, 'Moves', 2);
  await long.getByRole('textbox', { name: 'Reach (optional)', exact: true }).fill('2');
  await fillMove(page, long, 'long', 'Long jump', 3, -10);
}

test('the sector made in the World panel, its 300 seeds held, its bots and a player flying it to the exit', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await importFolder(
    page,
    without(DRIFT, ['records/map/sector.json', 'records/node-kind/way-in.json']),
    'the-drift',
    'The drift',
  );
  const world = await showWorld(page);
  await world.getByRole('button', { name: 'New kind' }).click();
  await world.getByLabel('Name of the new kind').fill('Way in');
  await world.getByRole('button', { name: 'Create' }).click();
  const kind = page.getByRole('region', { name: 'Node kind way-in' });
  const wayIn = fixtureJson(DRIFT, 'records/node-kind/way-in.json') as { description: string };
  await kind.getByLabel('Description (optional)').fill(wayIn.description);
  await expect.poll(() => stored(page, 'drift', 'records/node-kind/way-in.json')).toEqual(wayIn);

  await showWorld(page);
  await world.getByRole('button', { name: 'New layered map' }).click();
  await world.getByLabel('Name of the new layered map').fill('Sector');
  await world.getByRole('button', { name: 'Create' }).click();
  const map = page.getByRole('region', { name: 'Map sector' });
  await makeSector(page, map);
  const sector = fixtureJson(DRIFT, 'records/map/sector.json');
  await expect.poll(() => stored(page, 'drift', 'records/map/sector.json'), { timeout: 15_000 }).toEqual(sector);

  // Every rule held in all 300 seeds, and the map seed 1 makes.
  const preview = map.getByRole('region', { name: 'What The sector makes' });
  const rules = preview.getByRole('listitem');
  await expect(rules).toHaveText([
    '2 station, none two in a layer: kept in 300 of 300',
    '1 nebula, none two in a layer: kept in 300 of 300',
    'Every node is on a way from the start to the end: kept in 300 of 300',
    'No two links cross: kept in 300 of 300',
  ]);
  const board = preview.getByRole('region', { name: 'The sector, seed 1' });
  await expect(board.getByRole('button', { name: /^Way in/ })).toBeVisible();
  await expect(board.getByRole('button', { name: /^Jump point/ })).toBeVisible();
  await preview.getByRole('button', { name: 'Next seed' }).click();
  await expect(preview.getByRole('region', { name: 'The sector, seed 2' })).toBeVisible();
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  // Six stations anywhere in layers of one or two: some seeds can't hold them; the first opens.
  const layers = map.getByRole('group', { name: 'Layers (optional)', exact: true });
  const widths = layers.getByRole('group', { name: 'Nodes in a layer', exact: true });
  const station = layers.getByRole('group', { name: 'Placed first, item 1', exact: true });
  await widths.getByRole('textbox', { name: 'At least', exact: true }).fill('1');
  await widths.getByRole('textbox', { name: 'At most', exact: true }).fill('2');
  await station.getByRole('textbox', { name: 'At most', exact: true }).fill('6');
  await station.getByRole('textbox', { name: 'At least', exact: true }).fill('6');
  await station.getByLabel(/^Apart/).uncheck();
  const broken = rules.filter({ hasText: /^6 station: kept in \d+ of 300; seed \d+ makes [0-5] station/ });
  await expect(broken).toBeVisible();
  const seed = /seed (\d+) makes/.exec((await broken.textContent()) ?? '')?.[1] as string;
  await expect(station.getByText(new RegExp(`^Kept in \\d+ of 300 seeds: seed ${seed} makes`))).toBeVisible();
  await broken.getByRole('button', { name: `Open seed ${seed}` }).click();
  await expect(preview.getByLabel('Seed', { exact: true })).toHaveValue(seed);
  await expect(preview.getByRole('region', { name: `The sector, seed ${seed}` })).toBeVisible();
  await station.getByLabel(/^Apart/).check();
  await station.getByRole('textbox', { name: 'At least', exact: true }).fill('2');
  await station.getByRole('textbox', { name: 'At most', exact: true }).fill('2');
  await widths.getByRole('textbox', { name: 'At most', exact: true }).fill('3');
  await widths.getByRole('textbox', { name: 'At least', exact: true }).fill('2');
  await expect.poll(() => stored(page, 'drift', 'records/map/sector.json'), { timeout: 15_000 }).toEqual(sector);
  await expect(rules.filter({ hasText: 'kept in 300 of 300' })).toHaveCount(4);

  // Its bots play it to the exit in the editor as eb sim plays them.
  const logic = await showLogic(page);
  await logic.getByRole('button', { name: 'Run its scripts' }).click();
  await logic.getByLabel('Bot').selectOption('pilot');
  await logic.getByRole('button', { name: 'Run 20 games' }).click();
  const report = logic.locator('.logic-report');
  await expect(report).toContainText('drift: 20 runs with the pilot policy');
  const cli = execFileSync('node', ['tools/cli/src/cli.ts', 'sim', DRIFT, '--seeds', '20', '--policy', 'pilot'], {
    cwd: REPO,
    encoding: 'utf8',
  });
  expect(`${await report.textContent()}\n`).toBe(cli);

  // A move its condition shuts, a warp the drift never earns: drawn shut, saying why.
  await showWorld(page);
  await page
    .locator('[data-panel="world"]')
    .getByRole('button', { name: /^The sector/ })
    .click();
  const warp = await addTo(map, 'Moves', 3);
  await warp.getByLabel('Id', { exact: true }).fill('warp');
  await warp.getByLabel('Label', { exact: true }).fill('Warp');
  await warp.getByRole('textbox', { name: /^If/ }).fill('maps.entered > 5');
  await expect
    .poll(async () => ((await stored(page, 'drift', 'records/map/sector.json')) as { moves?: unknown[] } | null)?.moves)
    .toHaveLength(3);

  // A player flies it to the exit through the map widget, each jump’s cost and heat on its button.
  await startDrift(page);
  await expectMapLaidOut(page);
  const flown = await flyHome(page, false, {
    atStart: async () => {
      const moves = topScreen(page).locator('.eb-map-picked').getByRole('button');
      await expect(moves.first()).toHaveText(/^(Jump · 1 Supplies · heat \d+ → \d+|Long jump · 3 Supplies.*)$/);
      const shut = moves.filter({ hasText: /^Warp/ });
      await expect(shut).toBeDisabled();
      await expect(topScreen(page).locator('.eb-map-picked')).toContainText('Needs');
      await expectNothingOffscreen(page);
      await expectNoAxeIssues(page);
    },
  });
  expect(flown.presses).toBeGreaterThan(14);
  expect(flown.events).toBeGreaterThan(0);
  await expect(topScreen(page).getByText('The game is over.')).toBeVisible();
  await expect(game(page)).toBeVisible();
  expect(errors).toEqual([]);
});

/** A drawn node's fields. */
async function fillNode(page: Page, node: Locator, id: string, kind: RegExp, x: number, y: number, name?: string) {
  await node.getByLabel('Id', { exact: true }).fill(id);
  if (name !== undefined) await node.getByLabel('Name (optional)', { exact: true }).fill(name);
  await pick(page, node, /^Kind/, KIND, kind);
  await node.getByRole('textbox', { name: 'Across', exact: true }).fill(String(x));
  await node.getByRole('textbox', { name: 'Down', exact: true }).fill(String(y));
}

/** A road's ends, hours and cash. */
async function fillRoad(page: Page, road: Locator, from: string, to: string, hours: number, cash?: number) {
  await road.getByLabel('From', { exact: true }).fill(from);
  await road.getByLabel('To', { exact: true }).fill(to);
  const takes = road.getByRole('group', { name: 'Takes (optional)', exact: true });
  await takes.getByLabel('New key for Takes').fill('hours');
  await takes.getByRole('button', { name: 'Add to Takes' }).click();
  await takes.getByLabel('Takes: hours', { exact: true }).fill(String(hours));
  if (cash === undefined) return;
  await road.getByRole('button', { name: 'Add to Cost' }).click();
  await page.getByRole('dialog', { name: 'Add to Cost' }).getByRole('option', { name: /^Cash/ }).click();
  await road.getByLabel('Cost: cash', { exact: true }).fill(String(cash));
}

test('the valley drawn by hand in the World panel, a place dragged and undone, its drives run as eb sim runs them', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errors = watchErrors(page);
  await importFolder(page, without(VALLEY, ['records/map/valley.json']), 'the-valley', 'The valley');
  const world = await showWorld(page);
  await world.getByRole('button', { name: 'New drawn map' }).click();
  await world.getByLabel('Name of the new drawn map').fill('Valley');
  await world.getByRole('button', { name: 'Create' }).click();
  const map = page.getByRole('region', { name: 'Map valley' });
  const valley = fixtureJson(VALLEY, 'records/map/valley.json') as { description: string };
  await map.getByLabel('Name', { exact: true }).fill('The valley');
  await map.getByLabel('Description (optional)').fill(valley.description);
  const item = (list: string, n: number) => map.getByRole('group', { name: `${list}, item ${n}`, exact: true });
  await fillNode(page, item('Nodes', 1), 'van', /^Home/, 10, 85, 'The van');
  await fillNode(page, item('Nodes', 2), 'town', /^Town/, 35, 70);
  await fillNode(page, await addTo(map, 'Nodes', 3), 'slab', /^Crag/, 60, 45, 'The slab');
  await fillNode(page, await addTo(map, 'Nodes', 4), 'boulders', /^Crag/, 30, 25, 'The boulders');
  await fillNode(page, await addTo(map, 'Nodes', 5), 'tower', /^Crag/, 85, 15, 'The tower');
  await map.getByLabel('Start (optional)', { exact: true }).fill('van');
  await fillRoad(page, item('Roads', 1), 'van', 'town', 1);
  await fillRoad(page, await addTo(map, 'Roads', 2), 'town', 'slab', 2, 3);
  await fillRoad(page, await addTo(map, 'Roads', 3), 'van', 'slab', 4);
  await fillRoad(page, await addTo(map, 'Roads', 4), 'slab', 'tower', 1);
  await fillRoad(page, await addTo(map, 'Roads', 5), 'town', 'boulders', 3, 4);
  await fillRoad(page, await addTo(map, 'Roads', 6), 'boulders', 'tower', 2);
  const move = item('Moves', 1);
  await move.getByLabel('Id', { exact: true }).fill('drive');
  await move.getByLabel('Label', { exact: true }).fill('Drive');
  const file = 'records/map/valley.json';
  await expect.poll(() => stored(page, 'valley', file), { timeout: 15_000 }).toEqual(valley);

  // The van dragged up the board lands somewhere new, one step, which Undo takes back.
  const board = map.getByRole('region', { name: 'The valley', exact: true });
  const van = board.locator('[data-node="van"]');
  await van.scrollIntoViewIfNeeded();
  const [from, box] = [await van.boundingBox(), await board.boundingBox()];
  if (!from || !box) throw new Error('No van to drag');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        ((await stored(page, 'valley', file)) as (typeof valley & { nodes: { x: number }[] }) | null)?.nodes[0]?.x,
    )
    .toBeGreaterThan(30);
  await page.getByRole('button', { name: /^Undo: Move van to \d+, \d+ in valley$/ }).click();
  await expect.poll(() => stored(page, 'valley', file)).toEqual(valley);

  // A tap opens the place's row of the form.
  await board.locator('[data-node="tower"]').click();
  await expect(item('Nodes', 5).getByLabel('Id', { exact: true })).toBeFocused();
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  const logic = await showLogic(page);
  await logic.getByRole('button', { name: 'Run its scripts' }).click();
  await logic.getByRole('button', { name: 'Run 20 games' }).click();
  const report = logic.locator('.logic-report');
  await expect(report).toContainText('valley: 20 runs with the random policy');
  const cli = execFileSync('node', ['tools/cli/src/cli.ts', 'sim', VALLEY, '--seeds', '20'], {
    cwd: REPO,
    encoding: 'utf8',
  });
  expect(`${await report.textContent()}\n`).toBe(cli);
  expect(errors).toEqual([]);
});
