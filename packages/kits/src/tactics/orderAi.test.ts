/**
 * A bot's orders (M7.5, D87, docs/specs/tactics.md#the-gate), held to space-wrecked's tests/orderAi.test.js
 * case by case: the crew's AI gives its order first where a plain rule says to; the foes have none.
 */
import { edgeKey, type PackTiles } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { arenaOn, room, set } from '../../test/tactics.ts';
import { aiAction } from './ai.ts';
import { fieldOf, unitOf } from './field.ts';
import { dartOdds } from './odds.ts';
import { GOOD, orderAction } from './orderAi.ts';
import { createBattle, type Setting } from './turns.ts';
import type { Battle, Team, Unit } from './types.ts';

function fight(tiles: PackTiles, units: readonly Setting[], first: Team = 'crew') {
  const arena = arenaOn(tiles);
  return { arena, battle: createBattle(arena, { battle: 'test', first, units }).battle };
}

const who = (battle: Battle, id: string) => unitOf(battle, id) as Unit;

function tweak(battle: Battle, changes: Record<string, Partial<Record<keyof Unit, unknown>>>): Battle {
  for (const [id, fields] of Object.entries(changes)) Object.assign(who(battle, id), fields);
  return battle;
}

describe("a bot's orders", () => {
  it('Patch: a downed ally beside first; a hurt one only when no shot is worth taking', () => {
    const { arena, battle } = fight(room(8, 2).tiles(), [
      set('medic', [0, 0]),
      set('marine', [1, 0]),
      set('pirate', [4, 1]),
    ]);
    const asks = () => orderAction(arena, battle, who(battle, 'c1'));
    expect(asks()).toBeNull();
    tweak(battle, { c2: { status: 'down', hp: 0 } });
    expect(asks()).toEqual({ type: 'order', unit: 'c1', target: 'c2' });
    tweak(battle, { c2: { status: 'active', hp: 4 } });
    expect(asks()).toBeNull();
    tweak(battle, { c1: { aim: 0 } });
    expect(asks()).toEqual({ type: 'order', unit: 'c1', target: 'c2' });
    tweak(battle, { c2: { hp: who(battle, 'c2').most - 1 } });
    expect(asks()).toBeNull();
  });

  it('Hustle: fresh, with a foe in sight but no good shot from where it stands, once', () => {
    const made = () => fight(room(6, 1).tiles(), [set('pilot', [0, 0]), set('pirate', [5, 0])]);
    const { arena, battle } = made();
    const asks = (b: Battle) => orderAction(arena, b, who(b, 'c1'));
    expect(asks(battle)).toBeNull();
    tweak(battle, { c1: { aim: 0 } });
    expect(asks(battle)).toEqual({ type: 'order', unit: 'c1' });
    expect(asks(tweak(made().battle, { c1: { aim: 0, ap: 1 } }))).toBeNull();
    const blind = fight(room(6, 1).wall(2, 0, 'e').tiles(), [set('pilot', [0, 0]), set('pirate', [5, 0])]);
    tweak(blind.battle, { c1: { aim: 0 } });
    expect(orderAction(blind.arena, blind.battle, who(blind.battle, 'c1'))).toBeNull();
    expect(asks(tweak(battle, { c1: { uses: 0 } }))).toBeNull();
  });

  it('Mark: fresh, the foe in sight with the fewest hp, not one marked already', () => {
    const { arena, battle } = fight(room(8, 2).tiles(), [
      set('scout', [0, 0]),
      set('pirate', [6, 0]),
      set('pirate', [6, 1]),
    ]);
    const asks = () => orderAction(arena, battle, who(battle, 'c1'));
    tweak(battle, { e2: { hp: 2 } });
    expect(asks()).toEqual({ type: 'order', unit: 'c1', target: 'e2' });
    tweak(battle, { e2: { mark: { aim: 15, turns: 2 } } });
    expect(asks()).toEqual({ type: 'order', unit: 'c1', target: 'e1' });
    tweak(battle, { c1: { ap: 1 } });
    expect(asks()).toBeNull();
  });

  it('Sedate: the awake foe in sight with the most hp, at good odds', () => {
    const { arena, battle } = fight(room(6, 2).tiles(), [
      set('xenobiologist', [0, 0]),
      set('pirate', [3, 0]),
      set('brute', [3, 1]),
    ]);
    const asks = () => orderAction(arena, battle, who(battle, 'c1'));
    const brute = who(battle, 'e2');
    expect(brute.hp).toBeGreaterThan(who(battle, 'e1').hp);
    expect(dartOdds(arena, battle, fieldOf(arena, battle), who(battle, 'c1'), brute).hit).toBeGreaterThanOrEqual(GOOD);
    expect(asks()).toEqual({ type: 'order', unit: 'c1', target: 'e2' });
    tweak(battle, { e2: { asleep: true } });
    expect(asks()).toEqual({ type: 'order', unit: 'c1', target: 'e1' });
    tweak(battle, { c1: { aim: 0 } });
    expect(asks()).toBeNull();
  });

  it('Kit out: fresh, an ally beside first, then itself', () => {
    const { arena, battle } = fight(room(8, 2).tiles(), [
      set('quartermaster', [0, 0]),
      set('marine', [1, 0]),
      set('pirate', [7, 1]),
    ]);
    const asks = () => orderAction(arena, battle, who(battle, 'c1'));
    expect(asks()).toEqual({ type: 'order', unit: 'c1', target: 'c2' });
    tweak(battle, { c2: { kitted: true } });
    expect(asks()).toEqual({ type: 'order', unit: 'c1', target: 'c1' });
    tweak(battle, { c1: { kitted: true } });
    expect(asks()).toBeNull();
  });

  it('Suppress: when its own best shot is poor, the foe with the best shot at the crew', () => {
    const units = [set('marine', [0, 0]), set('medic', [0, 2]), set('pirate', [4, 0]), set('brute', [7, 2])];
    const { arena, battle } = fight(room(8, 3).tiles(), units);
    const asks = () => orderAction(arena, battle, who(battle, 'c1'));
    expect(asks()).toBeNull();
    tweak(battle, { c1: { aim: 0 } });
    expect(asks()).toEqual({ type: 'order', unit: 'c1', target: 'e1' });
    tweak(battle, { e1: { suppressed: -30 } });
    expect(asks()).toEqual({ type: 'order', unit: 'c1', target: 'e2' });
  });

  it('Weld: fresh and hurt, the door the nearest foe comes through, within 6 steps and out of sight', () => {
    const tiles = room(10, 2).wall(1, 0, 'e', 'door').wall(1, 1, 'e').tiles();
    const at = (c: number) => fight(tiles, [set('engineer', [1, 0]), set('medic', [1, 1]), set('pirate', [c, 0])]);
    const asks = ({ arena, battle }: ReturnType<typeof at>) => orderAction(arena, battle, who(battle, 'c1'));
    const hurt = (made: ReturnType<typeof at>) => {
      tweak(made.battle, { c2: { hp: 4 } });
      return made;
    };
    expect(asks(at(6))).toBeNull();
    expect(asks(hurt(at(6)))).toEqual({ type: 'order', unit: 'c1', side: 'e' });
    const self = at(6);
    tweak(self.battle, { c1: { hp: 4 } });
    expect(asks(self)).toEqual({ type: 'order', unit: 'c1', side: 'e' });
    expect(asks(hurt(at(9)))).toBeNull();
    const seen = hurt(at(6));
    seen.battle.doors = [edgeKey([1, 0], 'e')];
    expect(asks(seen)).toBeNull();
    const behind = fight(tiles, [set('engineer', [2, 0]), set('pirate', [6, 0])]);
    tweak(behind.battle, { c1: { hp: 4 } });
    expect(asks(behind)).toBeNull();
  });

  it("gives a crew member's order first; the foes have none, so their AI plays as before", () => {
    const mine = fight(room(6, 1).tiles(), [set('pilot', [0, 0]), set('pirate', [5, 0])]);
    tweak(mine.battle, { c1: { aim: 0 } });
    expect(aiAction(mine.arena, mine.battle)).toEqual({ type: 'order', unit: 'c1' });
    const theirs = fight(room(6, 1).tiles(), [set('pilot', [0, 0]), set('pirate', [5, 0])], 'foes');
    expect(orderAction(theirs.arena, theirs.battle, who(theirs.battle, 'e1'))).toBeNull();
    expect(aiAction(theirs.arena, theirs.battle).type).not.toBe('order');
  });
});
