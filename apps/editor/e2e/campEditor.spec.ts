/**
 * M6.4's gate in the editor (D76, docs/specs/combat.md#the-gate): a bandit armed and given an attack
 * behaviour with forms alone, at 1280 and 390 wide, and fought. The camp comes in with Crow wearing
 * nothing and doing nothing; a club made an item with a Weapon group; an Ambush behaviour whose one
 * step is Attack the player, made in the outline; Crow given it, and W150 saying Crow fights with its
 * fists until the club is worn in its hand; and in Play, Crow comes at the hero with the club and is
 * struck until it falls.
 */
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import {
  CAMP,
  fallenOf,
  fightUntil,
  fought,
  hands,
  hitsBy,
  importCamp,
  keySteer,
  playCamp,
  touchSteer,
} from './campHelpers.ts';
import { watchErrors } from './checks.ts';
import { press } from './componentHelpers.ts';
import { choose } from './hutHelpers.ts';
import { fixtureZip, newRecord, stored } from './kitHelpers.ts';
import { openRecord } from './ludus.ts';
import { settled } from './walkHelpers.ts';

const FOLDER = 'camp';
const FISTS = '"crow" attacks wearing no weapon, so it fights with its fists';

/** The camp as a zip with Crow unarmed and idle: no wears, no behaviour. */
function campUnarmed(): string {
  const dir = mkdtempSync(join(tmpdir(), 'camp-'));
  cpSync(CAMP, dir, { recursive: true });
  const path = join(dir, 'records/actor/crow.json');
  const crow = JSON.parse(readFileSync(path, 'utf8'));
  delete crow.wears;
  delete crow.behaviour;
  writeFileSync(path, JSON.stringify(crow, null, 2));
  return fixtureZip(dir, 'camp');
}

/** The club, the ambush and Crow armed and given it, each with its form. */
async function armCrow(page: Page, touch: boolean): Promise<void> {
  await test.step('Ambush made in the outline: its one step, Attack the player', async () => {
    const ambush = await newRecord(page, 'behaviour', 'Behaviour', 'Ambush');
    const steps = ambush.getByRole('list', { name: 'Steps' });
    await expect(steps.getByRole('button', { name: 'Nothing yet: choose what it does' })).toBeVisible();
    await ambush.getByLabel('Kind', { exact: true }).selectOption({ label: 'Attack the player' });
    await press(ambush.getByRole('button', { name: /^(Use this|Change kind)$/ }), touch);
    await expect(steps.getByRole('button', { name: 'Attack the player' })).toBeVisible();
    await expect
      .poll(() => stored(page, FOLDER, 'records/behaviour/ambush.json'))
      .toEqual({ name: 'Ambush', do: { attack: 'player' } });
  });

  await test.step('Crow given it, and W150: it would fight with its fists', async () => {
    const crow = await openRecord(page, 'actor', 'crow');
    await choose(crow, /^Behaviour/, 'Choose a behaviour', 'Ambush (ambush)');
    await expect.poll(() => stored(page, FOLDER, 'records/actor/crow.json')).toMatchObject({ behaviour: 'ambush' });
    // A problem that comes up while its field has focus shows once the field is left.
    await page.keyboard.press('Tab');
    await expect(crow.getByText(FISTS)).toBeVisible();
  });

  await test.step('a club made a weapon with its Weapon group, worn in the hand', async () => {
    const club = await newRecord(page, 'item', 'Item', 'Club');
    await choose(club, /^Worn in/, 'Choose a slot', 'Hand (hand)');
    await press(club.getByRole('button', { name: 'Add Weapon' }), touch);
    const weapon = club.getByRole('group', { name: /^Weapon/ });
    await weapon.getByLabel(/^Kind/).selectOption('melee');
    const damage = weapon.getByRole('textbox', { name: /^Damage/ });
    await damage.fill('3');
    await damage.press('Enter');
    await expect
      .poll(() => stored(page, FOLDER, 'records/item/club.json'))
      .toEqual({ name: 'Club', slot: 'hand', weapon: { kind: 'melee', damage: 3 } });
  });

  await test.step('the club worn in Crow’s hand, and W150 gone', async () => {
    const crow = await openRecord(page, 'actor', 'crow');
    await press(crow.getByRole('button', { name: 'Add to Wears' }), touch);
    await press(page.getByRole('dialog', { name: 'Add to Wears' }).getByRole('option', { name: /Hand/ }), touch);
    await choose(crow, /^Wears: hand Not chosen/, 'Choose an item', 'Club (club)');
    await expect
      .poll(() => stored(page, FOLDER, 'records/actor/crow.json'))
      .toMatchObject({ behaviour: 'ambush', wears: { hand: 'club' } });
    await expect(crow.getByText(FISTS)).toHaveCount(0);
  });
}

for (const [width, height, touch] of [
  [1280, 800, false],
  [390, 844, true],
] as const) {
  test.describe(`a bandit armed in the editor, ${width} wide`, () => {
    test.use({ viewport: { width, height }, ...(touch ? { hasTouch: true, isMobile: true } : {}) });

    test('Crow given a club and an ambush with forms alone, then fought', async ({ page }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      await importCamp(page, touch, campUnarmed());
      await armCrow(page, touch);
      await test.step('played: Crow comes at the hero with the club, and falls to the sword', async () => {
        const camp = await playCamp(page, touch);
        if (!touch) await camp.focus();
        await settled(page);
        const fingers = touch ? await hands(page) : null;
        const steer = fingers ? touchSteer(page, camp, fingers) : keySteer(page, camp);
        // Sent to attack from the start, Crow is the first engaged.
        await expect.poll(async () => (await fought(page)).engaged).toContain('crow');
        // Standing still, the hero takes Crow's first blow: struck with the club, as the sim heard it.
        await expect
          .poll(async () => hitsBy(await fought(page), 'crow').map((h) => h.action.weapon), { timeout: 60_000 })
          .toContain('club');
        if (!touch) await page.keyboard.down('KeyF');
        try {
          await fightUntil(page, steer, (seen) => fallenOf(seen.fight).includes('crow'));
        } finally {
          if (!touch) await page.keyboard.up('KeyF');
          await fingers?.close();
        }
        expect(hitsBy(await fought(page), 'hero').some((h) => h.action.on === 'crow')).toBe(true);
      });
      expect(errors).toEqual([]);
    });
  });
}
