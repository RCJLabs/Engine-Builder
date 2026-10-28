/**
 * The battle as the page shows it (M7.5, D87, docs/specs/tactics.md#the-stage): every option optionsOf gives,
 * and no other, under the unit it belongs to; a move's path and action points from the same reach; a shot's
 * odds from the same shotOdds and a dart's from dartOdds; no choices on the foes' turn.
 */
import type { PackTiles } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { arenaOn, room, set } from '../../test/tactics.ts';
import { fieldOf, unitOf } from './field.ts';
import { dartOdds, shotOdds } from './odds.ts';
import { optionsOf } from './options.ts';
import { createBattle, type Setting } from './turns.ts';
import type { Battle, Team, Unit } from './types.ts';
import { battleView, type ChoicesView } from './view.ts';

function battleOn(tiles: PackTiles, units: readonly Setting[], first: Team = 'crew') {
  const arena = arenaOn(tiles);
  return { arena, battle: createBattle(arena, { battle: 'test', first, units }).battle };
}

const who = (battle: Battle, id: string) => unitOf(battle, id) as Unit;

/** How many options a unit's choices stand for. */
const count = (c: ChoicesView) =>
  c.moves.length +
  c.shots.length +
  (c.watch ? 1 : 0) +
  (c.reload ? 1 : 0) +
  c.steady.length +
  c.open.length +
  c.orders.length;

describe('the battle view', () => {
  it('gives each of the crew the options the rules give, and no more, with paths, action points and odds', () => {
    const tiles = room(12, 3).wall(5, 1, 'e', 'door').tiles();
    const { arena, battle } = battleOn(tiles, [
      set('marine', [0, 1], { hp: 5 }),
      set('medic', [1, 1]),
      set('pirate', [4, 1]),
      set('brute', [11, 1]),
    ]);
    const view = battleView(arena, battle);
    expect(view.units.map((u) => [u.id, u.at, u.hp, u.clip])).toEqual([
      ['c1', [0, 1], 5, 4],
      ['c2', [1, 1], 8, 6],
      ['e1', [4, 1], 7, 3],
      ['e2', [11, 1], 11, 3],
    ]);
    expect(view.units[0]?.order).toEqual({ kind: 'suppress', uses: 2 });
    expect(view.choices.map((c) => c.unit)).toEqual(['c1', 'c2']);
    expect(view.choices.map(count).reduce((a, b) => a + b, 0)).toBe(optionsOf(arena, battle).length - 1);

    const [marine, medic] = view.choices as [ChoicesView, ChoicesView];
    // The door on the east of (5, 1) shuts the brute out of sight; the pirate is seen.
    expect(marine.shots.map((s) => s.target)).toEqual(['e1']);
    const odds = shotOdds(arena, battle, fieldOf(arena, battle), who(battle, 'c1'), who(battle, 'e1'));
    expect(marine.shots[0]).toEqual({ target: 'e1', ...odds });
    // Four tiles of mobility: one action point to three tiles east, two to five.
    const step = (c: number) => marine.moves.find((m) => m.to[0] === c && m.to[1] === 0);
    expect(step(3)?.ap).toBe(1);
    expect(step(5)?.ap).toBe(2);
    expect(step(3)?.path[0]).toEqual([0, 1]);
    expect(step(3)?.path.at(-1)).toEqual([3, 0]);
    // The marine's suppression reaches the pirate in sight, the medic's patch the hurt marine beside her.
    expect(marine.orders).toEqual([{ target: 'e1' }]);
    expect(medic.orders).toEqual([{ target: 'c1' }]);
    expect(marine.watch && !marine.reload).toBe(true);
  });

  it('gives a dart its odds from dartOdds, the order’s aim among them', () => {
    const { arena, battle } = battleOn(room(6, 1).tiles(), [set('xenobiologist', [0, 0]), set('pirate', [4, 0])]);
    const [xeno] = battleView(arena, battle).choices as [ChoicesView];
    const dart = dartOdds(arena, battle, fieldOf(arena, battle), who(battle, 'c1'), who(battle, 'e1'));
    expect(xeno.orders).toEqual([{ target: 'e1', odds: dart }]);
  });

  it('gives no choices on the foes’ turn, and none to a unit that is down', () => {
    const units = [set('marine', [0, 0]), set('medic', [1, 0]), set('pirate', [4, 0])];
    const theirs = battleOn(room(6, 1).tiles(), units, 'foes');
    expect(battleView(theirs.arena, theirs.battle).choices).toEqual([]);
    const { arena, battle } = battleOn(room(6, 1).tiles(), units);
    const down = structuredClone(battle);
    Object.assign(down.units[0] as Unit, { status: 'down', hp: 0, ap: 0 });
    expect(battleView(arena, down).choices.map((c) => c.unit)).toEqual(['c2']);
    expect(battleView(arena, down).choices[0]?.orders).toEqual([{ target: 'c1' }]);
  });
});
