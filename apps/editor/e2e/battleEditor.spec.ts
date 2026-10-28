/**
 * M7.5's gate in the editor (D87, docs/specs/tactics.md#the-gate), at 1280 and 390 wide: the boarding fight comes
 * in with no battle and an alarm that does nothing, and the battle is made with forms alone. Its rules picked, its
 * Space chosen from the project's spaces and each unit's At from that space's objects; E096 in Problems while Oren
 * is posted where Ines stands, gone once he has a post of his own; the alarm's Interact given Start a battle. Each
 * file as the forms wrote it; and in Play the alarm starts the battle, the crew's turn ends and the boarders come on.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { smallTargets, watchErrors } from './checks.ts';
import { press, showInspector, showOutliner } from './componentHelpers.ts';
import { barButton, battle, crewTurn, FIGHT, startFight } from './fightHelpers.ts';
import { importZip } from './hollowsHelpers.ts';
import { addEffect, addTo, choose } from './hutHelpers.ts';
import { showPlay } from './hutScreens.ts';
import { fixtureZip, newRecord, stored } from './kitHelpers.ts';
import { outlinerRow, showScene } from './spaceHelpers.ts';

const FOLDER = 'fight';
const STANDS = '“bridge-1” is on tile 9, 1, where “ines” already stands';

type Space = { objects: { id: string; components?: { interact?: Record<string, unknown> } }[] };

/** The fight as a zip with no battle, its alarm sounding and doing nothing yet. */
function fightBare(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fight-'));
  cpSync(FIGHT, dir, { recursive: true });
  rmSync(join(dir, 'records/battle/boarders.json'));
  const file = join(dir, 'spaces/deck.json');
  const deck = JSON.parse(readFileSync(file, 'utf8')) as Space;
  const alarm = deck.objects.find((o) => o.id === 'alarm')?.components?.interact;
  if (!alarm) throw new Error('The deck has no alarm');
  alarm.effects = [];
  writeFileSync(file, `${JSON.stringify(deck, null, 2)}\n`);
  return fixtureZip(dir, FOLDER);
}

async function showProblems(page: Page, touch: boolean): Promise<Locator> {
  await press(page.getByRole('tab', { name: /^Problems/ }), touch);
  const panel = page.locator('[data-panel="problems"]');
  await expect(panel.getByRole('heading', { name: 'Problems' })).toBeVisible();
  return panel;
}

/** A unit added to the crew or the foes: its actor picked and its post chosen from the space's objects. */
async function post(form: Locator, side: 'Crew' | 'Foes', n: number, actor: string, at: string): Promise<Locator> {
  const item = await addTo(form, side, n);
  await choose(item, /^Actor/, 'Choose an actor', actor);
  await item.getByLabel(/^At/).selectOption(at);
  return item;
}

async function makeBattle(page: Page, touch: boolean): Promise<void> {
  await test.step('the battle made with forms: rules, space, posts from its objects, E096 while two share one', async () => {
    const form = await newRecord(page, 'battle', 'Battle', 'Boarders');
    await choose(form, /^Rules/, 'Choose a battle rules', 'Boarding (boarding)');
    await form.getByLabel(/^Space/).selectOption('deck');
    await post(form, 'Crew', 1, 'Ines, the marine (ines)', 'bridge-1');
    await post(form, 'Crew', 2, 'Oren, the engineer (oren)', 'bridge-1');
    await expect((await showProblems(page, touch)).getByText(STANDS)).toBeVisible();
    const again = await battleForm(page, touch);
    await again.getByRole('group', { name: 'Crew, item 2', exact: true }).getByLabel(/^At/).selectOption('bridge-2');
    await expect((await showProblems(page, touch)).getByText(STANDS)).toHaveCount(0);
    const form2 = await battleForm(page, touch);
    await post(form2, 'Foes', 1, 'Pirate (pirate)', 'hatch-1');
    await post(form2, 'Foes', 2, 'Pirate brute (brute)', 'hatch-3');
    await press(form2.getByLabel(/^Foes press on/), touch);
    await expect
      .poll(() => stored(page, FOLDER, 'records/battle/boarders.json'))
      .toEqual({
        name: 'Boarders',
        rules: 'boarding',
        space: 'deck',
        crew: [
          { actor: 'ines', at: 'bridge-1' },
          { actor: 'oren', at: 'bridge-2' },
        ],
        foes: [
          { actor: 'pirate', at: 'hatch-1' },
          { actor: 'brute', at: 'hatch-3' },
        ],
        press: true,
      });
    if (touch) expect(await smallTargets(page, '[data-panel="inspector"]')).toEqual([]);
  });
}

/** The battle's form again, as the Records panel or the phone's inspector shows it. */
async function battleForm(page: Page, touch: boolean): Promise<Locator> {
  const handle = page.locator('.sheet-handle');
  if (touch && (await handle.isVisible()) && (await handle.getAttribute('aria-expanded')) === 'false')
    await handle.tap();
  const tab = page.getByRole('tab', { name: 'Inspector', exact: true });
  if ((await tab.isVisible()) && (await tab.getAttribute('aria-selected')) !== 'true') await press(tab, touch);
  const form = page.getByRole('region', { name: 'Battle boarders' });
  await expect(form).toBeVisible();
  return form;
}

async function alarmStartsIt(page: Page, touch: boolean): Promise<void> {
  await test.step('the alarm’s Interact given Start a battle: Boarders', async () => {
    const panel = await showScene(page);
    await press(panel.getByRole('button', { name: /^The boarding fight \(deck\)/ }), touch);
    await press(outlinerRow(await showOutliner(page, touch), 'The alarm'), touch);
    const form = await showInspector(page, touch);
    await expect(form.getByRole('heading', { name: 'The alarm (alarm)', exact: true })).toBeVisible();
    const effect = await addEffect(form, 'Effects', 'Start a battle');
    await choose(effect, /^Battle/, 'Choose a battle', 'Boarders (boarders)');
    await expect
      .poll(
        async () =>
          ((await stored(page, FOLDER, 'spaces/deck.json')) as Space | null)?.objects.find((o) => o.id === 'alarm')
            ?.components?.interact?.effects,
      )
      .toEqual([{ effect: 'start-battle', battle: 'boarders' }]);
  });
}

for (const [width, height, touch] of [
  [1280, 800, false],
  [390, 844, true],
] as const) {
  test.describe(`a battle made in the editor, ${width} wide`, () => {
    test.use({ viewport: { width, height }, ...(touch ? { hasTouch: true, isMobile: true } : {}) });

    test('the boarders’ battle made with forms alone, then fought', async ({ page }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      await importZip(page, fightBare(), 'The boarding fight', touch);
      await makeBattle(page, touch);
      await alarmStartsIt(page, touch);

      await test.step('played: the alarm starts it, the crew end their turn and the boarders come on', async () => {
        const panel = await showPlay(page);
        await press(panel.getByRole('button', { name: 'Run its scripts' }), touch);
        const play = panel.getByRole('button', { name: 'Play', exact: true });
        await expect(play).toBeEnabled();
        await press(play, touch);
        await startFight(page, touch);
        await press(page.getByRole('button', { name: 'Sound the alarm' }), touch);
        const seen = await crewTurn(page);
        expect(seen.view?.units.map((u) => u.id)).toEqual(['c1', 'c2', 'e1', 'e2']);
        await press(barButton(page, 'end'), touch);
        await press(barButton(page, 'confirm'), touch);
        const after = await crewTurn(page);
        expect(after.view?.round).toBe(2);
        const moved = after.view?.units.filter(
          (u) => u.side === 'foes' && u.at.join() !== seen.view?.units.find((b) => b.id === u.id)?.at.join(),
        );
        expect(moved?.length).toBeGreaterThan(0);
        expect((await battle(page))?.sent.at(-1)?.sent).toBe('accepted');
      });
      expect(errors).toEqual([]);
    });
  });
}
