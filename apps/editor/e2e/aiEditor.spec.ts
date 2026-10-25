/**
 * M6.3's gate in the editor (D75, docs/specs/ai.md#the-gate): the guard's behaviour made in a
 * behaviour's outline alone, at 1280 and 390 wide, and played. The village comes in without it; a new
 * behaviour is given to the guard, so its points are the village's objects; in the outline, the first
 * that holds of three steps (Only when suspicious, face the player; Only from 20 to 6, patrol two
 * corners of the walls; work at the gate), each made by Add, Wrap, Up and the step's own fields, each
 * a step of undo; and in Play, the guard keeps the gate by day and walks the walls once Wait has
 * jumped the clock to the evening.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { watchErrors } from './checks.ts';
import { press } from './componentHelpers.ts';
import { choose } from './hutHelpers.ts';
import { game } from './hutScreens.ts';
import { fixtureZip, newRecord, stored } from './kitHelpers.ts';
import { openRecord } from './ludus.ts';
import { clockOf, doingOf, importVillage, playVillage, VILLAGE } from './villageHelpers.ts';

const FOLDER = 'village';
const SUSPICIOUS = 'ai.level(actor: @self) == suspicious';

/** The village as a zip, without the guard's behaviour: the guard has none, and no record holds one. */
function villageWithoutWatch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'village-'));
  cpSync(VILLAGE, dir, { recursive: true });
  rmSync(join(dir, 'records/behaviour/guards-watch.json'));
  const guard = JSON.parse(readFileSync(join(dir, 'records/actor/guard.json'), 'utf8'));
  delete guard.behaviour;
  writeFileSync(join(dir, 'records/actor/guard.json'), JSON.stringify(guard, null, 2));
  return fixtureZip(dir, 'village');
}

/** The outline's parts in a behaviour's form. */
function outline(form: Locator, touch: boolean) {
  const steps = form.getByRole('list', { name: 'Steps' });
  const bar = form.getByRole('group', { name: 'Change the steps' });
  const row = (name: string | RegExp) => steps.getByRole('button', { name });
  return {
    steps,
    row,
    choose: (name: string | RegExp) => press(row(name), touch),
    kind: async (label: string) => {
      await form.getByLabel('Kind', { exact: true }).selectOption({ label });
      await press(form.getByRole('button', { name: /^(Use this|Change kind)$/ }), touch);
    },
    add: async (label: string, where: 'Add inside' | 'Add after') => {
      await bar.getByLabel('Add', { exact: true }).selectOption({ label });
      await press(bar.getByRole('button', { name: where }), touch);
    },
    act: (name: 'Up' | 'Down' | 'Unwrap' | 'Remove') => press(bar.getByRole('button', { name, exact: true }), touch),
    wrap: async (label: string) => {
      await bar.getByLabel('Wrap in', { exact: true }).selectOption({ label });
      await press(bar.getByRole('button', { name: 'Wrap', exact: true }), touch);
    },
  };
}

/** The guard's watch, made in the outline alone. */
async function makeWatch(page: Page, touch: boolean): Promise<void> {
  await newRecord(page, 'behaviour', 'Behaviour', 'Watch');
  const guard = await openRecord(page, 'actor', 'guard');
  await choose(guard, /^Behaviour/, 'Choose a behaviour', 'Watch (watch)');
  await expect.poll(() => stored(page, FOLDER, 'records/actor/guard.json')).toMatchObject({ behaviour: 'watch' });
  const form = await openRecord(page, 'behaviour', 'watch');
  const o = outline(form, touch);
  await expect(o.row('Nothing yet: choose what it does')).toBeVisible();

  await test.step('the first that holds, and its last step: work at the gate', async () => {
    await o.kind('The first that holds');
    await o.choose('Wait 10 minutes');
    await o.kind('Work');
    await form.getByLabel('At', { exact: true }).selectOption('gate');
    await expect(o.row('Work at gate')).toHaveAttribute('aria-current', 'true');
  });

  await test.step('the night: a patrol of two corners, wrapped in Only when, its hours, moved up', async () => {
    await o.add('Patrol', 'Add after');
    await form.getByRole('combobox', { name: 'Points, item 1' }).selectOption('wall-ne');
    await press(form.getByRole('button', { name: 'Add to Points', exact: true }), touch);
    await form.getByRole('combobox', { name: 'Points, item 2' }).selectOption('wall-se');
    await expect(o.row('Patrol wall-ne, wall-se')).toBeVisible();
    await o.wrap('Only when');
    await expect(o.row('Always')).toHaveAttribute('aria-current', 'true');
    await press(form.getByRole('button', { name: 'Add hours' }), touch);
    for (const [label, hour] of [
      ['From hour', '20'],
      ['To hour', '6'],
    ] as const) {
      const box = form.getByRole('textbox', { name: label });
      await box.fill(hour);
      await box.press('Enter');
    }
    await expect(o.row('Only 20 to 6')).toBeVisible();
    await o.act('Up');
  });

  await test.step('first of all: Only when suspicious, face the player', async () => {
    await o.add('Only when', 'Add after');
    await o.act('Up');
    await form.getByRole('textbox', { name: /^If/ }).fill(SUSPICIOUS);
    await form.getByRole('textbox', { name: /^If/ }).press('Tab');
    await expect(o.row(`Only if ${SUSPICIOUS}`)).toBeVisible();
    await o.choose('Wait 10 minutes');
    await o.kind('Face the player');
  });

  await expect
    .poll(() => stored(page, FOLDER, 'records/behaviour/watch.json'))
    .toEqual({
      name: 'Watch',
      do: {
        first: [
          { do: { face: 'player' }, if: SUSPICIOUS },
          { do: { patrol: ['wall-ne', 'wall-se'] }, hours: [20, 6] },
          { work: 'gate' },
        ],
      },
    });
  await expect(o.steps.getByText(/\d+ problems?$/)).toHaveCount(0);
  expect(await o.steps.getByRole('button').allTextContents()).toEqual([
    'The first that holds',
    `Only if ${SUSPICIOUS}`,
    'Face the player',
    'Only 20 to 6',
    'Patrol wall-ne, wall-se',
    'Work at gate',
  ]);
}

for (const [width, height, touch] of [
  [1280, 800, false],
  [390, 844, true],
] as const) {
  test.describe(`a behaviour made in the outline, ${width} wide`, () => {
    test.use({ viewport: { width, height }, ...(touch ? { hasTouch: true, isMobile: true } : {}) });

    test('the guard’s watch made step by step, then played: the gate by day, the walls by night', async ({ page }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      await importVillage(page, touch, villageWithoutWatch());
      await makeWatch(page, touch);
      await test.step('played: the gate by day, the walls once Wait has made it evening', async () => {
        await playVillage(page, touch);
        await expect.poll(() => doingOf(page)).toMatch(/Bram: work, unaware$/);
        await press(game(page).getByRole('button', { name: 'Wait 12 hours' }), touch);
        await expect.poll(() => clockOf(page)).toMatch(/^22:/);
        await expect.poll(() => doingOf(page)).toMatch(/Bram: patrol, unaware$/);
      });
      expect(errors).toEqual([]);
    });
  });
}
