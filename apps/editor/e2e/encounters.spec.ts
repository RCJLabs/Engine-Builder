/**
 * M4.7's gate on desktop (D57). The drift brought in without its broadside, its raider and their
 * encounter, and with the hostile ship's choices fighting nothing: each made with forms, landing as
 * the fixture holds it; how the fight goes read above the encounter's form; the Fight and Run in
 * close given their fights with forms. Flown from the Play panel's seed to its first hostile ship,
 * both choices' odds read as that table, and the fight fought; its bots run in the editor as
 * `eb sim` runs them. Then the pit, a slice of Ludus: a thraex bout made with forms, Spartacus sent
 * from the roster, its table read for him alone, and its lanista run as `eb sim` runs him.
 */
import { execFileSync } from 'node:child_process';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { expectNoAxeIssues, expectNothingOffscreen, watchErrors } from './checks.ts';
import { changed, expectHailedOdds, flyToHostile, hailing, PIT } from './encounterHelpers.ts';
import { game, press, topScreen } from './hutScreens.ts';
import { newRecord, pick, showLogic, stored } from './kitHelpers.ts';
import { openRecord, REPO } from './ludus.ts';
import { DRIFT, fixtureJson, flyHome, importFolder, startDrift } from './mapHelpers.ts';

test.use({ viewport: { width: 1280, height: 900 } });

/** An effect added to a list of effects in `scope`, by its label in the list's select. */
async function addEffect(scope: Locator, list: string, label: string): Promise<Locator> {
  const effects = scope.getByRole('group', { name: list, exact: true });
  await effects.getByLabel(`Effect to add to ${list.replace(/ \(optional\)$/, '')}`, { exact: true }).selectOption({
    label,
  });
  await effects
    .getByRole('button', { name: `Add effect to ${list.replace(/ \(optional\)$/, '')}`, exact: true })
    .click();
  return effects;
}

/** A stat of an actor, added to its Stats and set. */
async function setStat(page: Page, actor: Locator, stat: string, label: string, value: number): Promise<void> {
  await actor.getByRole('button', { name: 'Add to Stats' }).click();
  await page
    .getByRole('dialog', { name: 'Add to Stats' })
    .getByRole('option', { name: `${label} (${stat})` })
    .click();
  await actor.getByLabel(`Stats: ${stat}`, { exact: true }).fill(String(value));
}

/** The broadside, a raider and the raiders: the drift's fight, made with forms. */
async function makeFight(page: Page): Promise<Locator> {
  const broadside = await newRecord(page, 'combat', 'Combat', 'Broadside');
  for (const [field, stat] of [
    ['Health', 'Hull (hull)'],
    ['Hit', 'Gunnery (gunnery)'],
    ['Damage', 'Guns (guns)'],
    ['Armour', 'Plating (plating)'],
  ] as const) {
    await pick(page, broadside, new RegExp(`^${field}( \\(optional\\))? Not chosen`), 'Choose a stat', stat);
  }
  await broadside.getByRole('textbox', { name: 'Rounds (optional)', exact: true }).fill('10');
  await expect
    .poll(() => stored(page, 'drift', 'records/combat/broadside.json'))
    .toEqual(fixtureJson(DRIFT, 'records/combat/broadside.json'));

  const raider = await newRecord(page, 'actor', 'Actor', 'Raider');
  const written = fixtureJson(DRIFT, 'records/actor/raider.json') as { description: string };
  await raider.getByLabel('Description (optional)').fill(written.description);
  await setStat(page, raider, 'hull', 'Hull', 10);
  await setStat(page, raider, 'gunnery', 'Gunnery', 55);
  await setStat(page, raider, 'guns', 'Guns', 3);
  await setStat(page, raider, 'plating', 'Plating', 1);
  await expect.poll(() => stored(page, 'drift', 'records/actor/raider.json')).toEqual(written);

  const raiders = await newRecord(page, 'encounter', 'Encounter', 'Raiders');
  const fixture = fixtureJson(DRIFT, 'records/encounter/raiders.json') as { description: string };
  await raiders.getByLabel('Description (optional)').fill(fixture.description);
  await pick(page, raiders, /^Combat Not chosen/, 'Choose a combat', 'Broadside (broadside)');
  await raiders.getByRole('button', { name: 'Add to Foes', exact: true }).click();
  const foe = raiders.getByRole('group', { name: 'Foes, item 1', exact: true });
  await pick(page, foe, /^Actor Not chosen/, 'Choose an actor', 'Raider (raider)');
  await raiders.getByRole('button', { name: 'Add to Fighters', exact: true }).click();
  await pick(page, raiders, /^Fighters, item 1 Not chosen/, 'Choose an actor', 'Your ship (ship)');
  await raiders.getByRole('textbox', { name: 'Foes break at (%) (optional)', exact: true }).fill('50');
  const win = await addEffect(raiders, 'Win (optional)', 'Add to a resource');
  await pick(page, win, /^Resource Not chosen/, 'Choose a resource', 'Credits (credits)');
  await win.getByRole('textbox', { name: 'By', exact: true }).fill('12');
  const draw = await addEffect(raiders, 'Draw (optional)', 'Add to a flag');
  await draw.getByRole('combobox', { name: 'Flag', exact: true }).selectOption('heat');
  await draw.getByRole('textbox', { name: 'By', exact: true }).fill('5');
  const lose = await addEffect(raiders, 'Lose (optional)', 'Add to a resource');
  await pick(page, lose, /^Resource Not chosen/, 'Choose a resource', 'Supplies (supplies)');
  await lose.getByRole('textbox', { name: 'By', exact: true }).fill('-3');
  await addEffect(raiders, 'Lose (optional)', 'Add to a flag');
  await lose.getByRole('combobox', { name: 'Flag', exact: true }).selectOption('heat');
  await lose.getByRole('textbox', { name: 'By', exact: true }).nth(1).fill('10');
  await expect
    .poll(() => stored(page, 'drift', 'records/encounter/raiders.json'), { timeout: 15_000 })
    .toEqual(fixture);
  return raiders;
}

/** The hostile ship's Fight and Run in close, given their fights with forms. */
async function giveFights(page: Page): Promise<void> {
  const hostile = await openRecord(page, 'event', 'hostile');
  const fight = hostile.getByRole('group', { name: 'Choices, item 1', exact: true });
  const fights = await addEffect(fight, 'Effects (optional)', 'Fight');
  await pick(page, fights, /^Encounter Not chosen/, 'Choose an encounter', 'Raiders (raiders)');
  const close = hostile.getByRole('group', { name: 'Choices, item 2', exact: true });
  const closing = await addEffect(close, 'Effects (optional)', 'Fight');
  await pick(page, closing, /^Encounter Not chosen/, 'Choose an encounter', 'Raiders (raiders)');
  await closing.getByRole('textbox', { name: 'Hit (optional)', exact: true }).fill('15');
  await closing.getByRole('textbox', { name: 'Damage (optional)', exact: true }).fill('1');
  await closing.getByRole('textbox', { name: 'Armour (optional)', exact: true }).fill('-1');
  await expect
    .poll(() => stored(page, 'drift', 'records/event/hostile.json'), { timeout: 15_000 })
    .toEqual(fixtureJson(DRIFT, 'records/event/hostile.json'));
}

/** The hostile ship as the gate brings it in: its choices fight nothing yet. */
function unfought(): unknown {
  const hostile = fixtureJson(DRIFT, 'records/event/hostile.json') as { choices: { effects?: { effect: string }[] }[] };
  const choices = hostile.choices.map((choice) => {
    const kept = (choice.effects ?? []).filter((effect) => effect.effect !== 'fight');
    const { effects: _, ...rest } = choice;
    return kept.length > 0 ? { ...rest, effects: kept } : rest;
  });
  return { ...hostile, choices };
}

/** The editor's run of 20 games against eb sim's, for a project's bot. */
async function runsAsCli(page: Page, folder: string, game: string, bot: string): Promise<void> {
  const logic = await showLogic(page);
  // The Play panel may have run the scripts already: then the Bot is there at once.
  const run = logic.getByRole('button', { name: 'Run its scripts' });
  await expect(run.or(logic.getByLabel('Bot'))).toBeVisible();
  if (await run.isVisible()) await run.click();
  await logic.getByLabel('Bot').selectOption(bot);
  await logic.getByRole('button', { name: 'Run 20 games' }).click();
  const report = logic.locator('.logic-report');
  await expect(report).toContainText(`${game}: 20 runs with the ${bot} policy`);
  const cli = execFileSync('node', ['tools/cli/src/cli.ts', 'sim', folder, '--seeds', '20', '--policy', bot], {
    cwd: REPO,
    encoding: 'utf8',
  });
  expect(`${await report.textContent()}\n`).toBe(cli);
}

test('the drift’s fight made with forms, its table read, and fought at the first hostile ship', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  const without = changed(
    DRIFT,
    ['records/combat/broadside.json', 'records/actor/raider.json', 'records/encounter/raiders.json'],
    { 'records/event/hostile.json': unfought() },
  );
  await importFolder(page, without, 'the-drift', 'The drift');
  const raiders = await makeFight(page);

  // How the fight goes, above the form: the ship the encounter names, at full hull.
  const table = raiders.getByRole('region', { name: 'How the fight goes' });
  await expect(table.getByText('Your ship, at full health, as the game works it out.')).toBeVisible();
  await expect(table.locator('.fight-head')).toHaveText(['Win 67%', 'Draw 16%', 'Lose 17%']);
  await expect(table.locator('.fight-then')).toHaveText([
    '0 to 10 Hull lost, none fall',
    '0 to 12 Hull lost, 0 to 1 fall',
    '12 Hull lost, 1 falls',
  ]);
  // A second raider in line moves the odds at once.
  await raiders
    .getByRole('group', { name: 'Foes, item 1', exact: true })
    .getByRole('textbox', { name: 'How many (optional)' })
    .fill('2');
  await expect(table.locator('.fight-head').first()).not.toHaveText('Win 67%');
  await raiders
    .getByRole('group', { name: 'Foes, item 1', exact: true })
    .getByRole('textbox', { name: 'How many (optional)' })
    .fill('');
  await expect(table.locator('.fight-head')).toHaveText(['Win 67%', 'Draw 16%', 'Lose 17%']);
  await expect
    .poll(() => stored(page, 'drift', 'records/encounter/raiders.json'))
    .toEqual(fixtureJson(DRIFT, 'records/encounter/raiders.json'));
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  await giveFights(page);

  // Flown from the Play panel's seed to its first hostile ship: the odds on its buttons are the table's.
  await startDrift(page);
  const presses = await flyToHostile(page);
  expect(presses).toBeLessThan(20);
  await expectHailedOdds(page);
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);
  await press(page, hailing(page).getByRole('listitem').getByRole('button').first());
  await expect(hailing(page).getByRole('heading', { name: 'Hostile ship' })).toHaveCount(0);
  const flown = await flyHome(page);
  expect(flown.presses).toBeGreaterThan(5);
  await expect(topScreen(page).getByText('The game is over.')).toBeVisible();
  await expect(game(page)).toBeVisible();

  await runsAsCli(page, DRIFT, 'drift', 'pilot');
  expect(errors).toEqual([]);
});

test('the pit’s thraex bout made with forms, Spartacus sent from the roster, its lanista run as eb sim runs him', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  const event = fixtureJson(PIT, 'records/event/thraex.json') as { choices: Record<string, unknown>[] };
  const unsent = {
    ...event,
    choices: event.choices.map((c) => (c.id === 'spartacus' ? { ...c, effects: undefined } : c)),
  };
  await importFolder(
    page,
    changed(PIT, ['records/encounter/thraex.json'], {
      'records/event/thraex.json': JSON.parse(JSON.stringify(unsent)),
    }),
    'the-pit',
    'The pit',
  );
  const bout = await newRecord(page, 'encounter', 'Encounter', 'Thraex');
  await bout.getByLabel('Name (optional)', { exact: true }).fill('A thraex');
  await pick(page, bout, /^Combat Not chosen/, 'Choose a combat', 'A bout (bout)');
  await bout.getByRole('button', { name: 'Add to Foes', exact: true }).click();
  await pick(
    page,
    bout.getByRole('group', { name: 'Foes, item 1', exact: true }),
    /^Actor Not chosen/,
    'Choose an actor',
    'A thraex (thraex)',
  );
  await bout.getByRole('textbox', { name: 'Foes break at (%) (optional)', exact: true }).fill('80');
  const win = await addEffect(bout, 'Win (optional)', 'Add to a resource');
  await pick(page, win, /^Resource Not chosen/, 'Choose a resource', 'Denarii (denarii)');
  await win.getByRole('textbox', { name: 'By', exact: true }).fill('30');
  const falls = bout.getByRole('group', { name: 'Falls (optional)', exact: true });
  await falls.getByRole('button', { name: 'Add Falls', exact: true }).click();
  await pick(page, falls, /^Status/, 'Choose a status', 'Injured (injured)');
  await expect
    .poll(() => stored(page, 'pit', 'records/encounter/thraex.json'), { timeout: 15_000 })
    .toEqual(fixtureJson(PIT, 'records/encounter/thraex.json'));

  // As written it fights the roster's start; picked, Spartacus alone, as the bout will send him.
  const table = bout.getByRole('region', { name: 'How the fight goes' });
  await expect(table.getByText('Crixus, Spartacus, at full health, as the game works it out.')).toBeVisible();
  await table.getByLabel('Who fights').selectOption({ label: 'Spartacus alone' });
  await expect(table.getByText('Spartacus, at full health, as the game works it out.')).toBeVisible();
  await expect(table.locator('.fight-head')).toHaveText([/^Win \d+%$/, /^Draw \d+%$/, /^Lose \d+%$/]);

  const offer = await openRecord(page, 'event', 'thraex');
  const send = offer.getByRole('group', { name: 'Choices, item 2', exact: true });
  const fight = await addEffect(send, 'Effects (optional)', 'Fight');
  await pick(page, fight, /^Encounter Not chosen/, 'Choose an encounter', 'A thraex (thraex)');
  await fight.getByRole('button', { name: 'Add to Fighters', exact: true }).click();
  await pick(page, fight, /^Fighters, item 1 Not chosen/, 'Choose an actor', 'Spartacus (spartacus)');
  await expect.poll(() => stored(page, 'pit', 'records/event/thraex.json'), { timeout: 15_000 }).toEqual(event);
  await expectNothingOffscreen(page);
  await expectNoAxeIssues(page);

  await runsAsCli(page, PIT, 'pit', 'lanista');
  expect(errors).toEqual([]);
});
