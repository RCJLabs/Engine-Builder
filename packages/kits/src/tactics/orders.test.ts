/**
 * Each of the seven orders (M7.5, D87, docs/specs/tactics.md#the-gate), after space-wrecked's
 * tests/orders.test.js: what it does, what it costs, how long it lasts, and what it can't reach.
 */
import type { PackTiles } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { arenaOn, fixed, room, set } from '../../test/tactics.ts';
import { fieldOf, type Rolls, reachOf, sees, unitOf } from './field.ts';
import { shotOdds } from './odds.ts';
import { orderTargets } from './orders.ts';
import { act, createBattle, type Setting } from './turns.ts';
import type { Battle, Move, Told, Unit } from './types.ts';

function battleOn(tiles: PackTiles, units: readonly Setting[]) {
  const arena = arenaOn(tiles);
  return { arena, battle: createBattle(arena, { battle: 'test', first: 'crew', units }).battle };
}

type Made = ReturnType<typeof battleOn>;

function run({ arena, battle }: Made, moves: readonly Move[], rolls: Rolls = fixed()) {
  let now = battle;
  const told: Told[] = [];
  for (const move of moves) {
    const result = act(arena, now, move, rolls);
    if (!result.ok) throw new Error(result.error);
    now = result.battle;
    told.push(...result.told);
  }
  return { battle: now, told };
}

const who = (battle: Battle, id: string) => unitOf(battle, id) as Unit;

describe('the orders', () => {
  it("Suppress: a foe in sight shoots at −30 until its side's turn ends; it ends the turn and uses a round", () => {
    const made = battleOn(room(6, 1).tiles(), [set('marine', [0, 0]), set('pirate', [4, 0])]);
    const { battle, told } = run(made, [{ type: 'order', unit: 'c1', target: 'e1' }]);
    expect(told[0]).toEqual({ type: 'ordered', kind: 'suppress', unit: 'c1', target: 'e1', aim: -30 });
    expect(who(battle, 'c1')).toMatchObject({ ammo: 3, uses: 1 });
    expect(battle.side).toBe('foes');
    const odds = shotOdds(made.arena, battle, fieldOf(made.arena, battle), who(battle, 'e1'), who(battle, 'c1'));
    expect(odds.hitParts.find((p) => p.why === 'suppressed')?.value).toBe(-30);
    expect(who(run({ ...made, battle }, [{ type: 'end' }]).battle, 'e1').suppressed).toBeNull();
  });

  it('Weld: the door beside shut and held for 3 rounds, this one counted; no one walks, sees or opens it through', () => {
    const tiles = room(6, 1).wall(1, 0, 'e', 'door').tiles();
    const made = battleOn(tiles, [set('engineer', [1, 0]), set('pirate', [4, 0])]);
    const opened = run(made, [{ type: 'open', unit: 'c1', side: 'e' }]).battle;
    expect(opened.doors).toEqual(['2,0,w']);
    const { battle, told } = run({ ...made, battle: opened }, [{ type: 'order', unit: 'c1', side: 'e' }]);
    expect(told[0]).toMatchObject({ type: 'ordered', kind: 'weld', side: 'e', until: 3 });
    expect(battle.doors).toEqual([]);
    expect(battle.welds).toEqual([{ key: '2,0,w', until: 3 }]);
    const grid = fieldOf(made.arena, battle);
    expect(sees(made.arena, grid, [4, 0], [1, 0])).toBe(false);
    expect(reachOf(made.arena, battle, who(battle, 'e1'), 9).has('1,0')).toBe(false);
    expect(act(made.arena, { ...battle, side: 'foes' }, { type: 'open', unit: 'e1', side: 'w' }, fixed()).ok).toBe(
      false,
    );
    const ends: Move[] = Array.from({ length: 6 }, () => ({ type: 'end' }));
    const later = run({ ...made, battle }, ends);
    expect(later.battle.round).toBe(4);
    expect(later.battle.welds).toEqual([]);
    expect(later.told.filter((t) => t.type === 'unwelded')).toEqual([{ type: 'unwelded', key: '2,0,w' }]);
  });

  it('Patch: an ally beside gets 3 hp back, up to their most; one down gets up with 3 and no ap', () => {
    const made = battleOn(room(6, 2).tiles(), [
      set('medic', [0, 0]),
      set('marine', [1, 0], { hp: 4 }),
      set('pirate', [5, 1]),
    ]);
    const healed = run(made, [{ type: 'order', unit: 'c1', target: 'c2' }]);
    expect(healed.told[0]).toMatchObject({ kind: 'patch', hp: 7, healed: 3, up: false });
    Object.assign(who(made.battle, 'c2'), { hp: 0, status: 'down', bleed: 2 });
    const up = run(made, [{ type: 'order', unit: 'c1', target: 'c2' }]).battle;
    expect(who(up, 'c2')).toMatchObject({ hp: 3, status: 'active', bleed: 0, ap: 0 });
    Object.assign(who(made.battle, 'c2'), { hp: 10, status: 'active' });
    expect(orderTargets(made.arena, made.battle, who(made.battle, 'c1'))).toEqual([]);
  });

  it('Hustle: one more ap this turn, once a fight, costing none, a move still at most a dash', () => {
    const made = battleOn(room(14, 1).tiles(), [set('pilot', [0, 0]), set('pirate', [13, 0])]);
    const { battle } = run(made, [{ type: 'order', unit: 'c1' }]);
    expect(who(battle, 'c1')).toMatchObject({ ap: 3, uses: 0 });
    expect(act(made.arena, battle, { type: 'move', unit: 'c1', to: [11, 0] }, fixed()).ok).toBe(false);
    expect(who(run({ ...made, battle }, [{ type: 'move', unit: 'c1', to: [10, 0] }]).battle, 'c1').ap).toBe(1);
    expect(act(made.arena, battle, { type: 'order', unit: 'c1' }, fixed()).ok).toBe(false);
  });

  it("Mark: the crew's shots at a marked foe +15 until the crew's next turn ends; it takes one ap", () => {
    const made = battleOn(room(8, 2).tiles(), [set('scout', [0, 0]), set('marine', [0, 1]), set('pirate', [6, 0])]);
    const marked = run(made, [{ type: 'order', unit: 'c1', target: 'e1' }]).battle;
    expect(who(marked, 'e1').mark).toEqual({ aim: 15, turns: 2 });
    expect(who(marked, 'c1').ap).toBe(1);
    const grid = fieldOf(made.arena, marked);
    expect(shotOdds(made.arena, marked, grid, who(marked, 'c2'), who(marked, 'e1')).hitParts.at(-1)).toEqual({
      why: 'marked',
      value: 15,
    });
    const ends: Move[] = [{ type: 'end' }, { type: 'end' }];
    expect(who(run({ ...made, battle: marked }, ends).battle, 'e1').mark).toEqual({ aim: 15, turns: 1 });
    expect(who(run({ ...made, battle: marked }, [...ends, { type: 'end' }]).battle, 'e1').mark).toBeNull();
  });

  it("Sedate: a dart at the shot's odds; a hit sleeps the foe through its next turn, and it wakes", () => {
    const made = battleOn(room(6, 2).tiles(), [set('xenobiologist', [0, 0]), set('brute', [3, 1])]);
    Object.assign(who(made.battle, 'e1'), { watch: true });
    const darted = run(made, [{ type: 'order', unit: 'c1', target: 'e1' }], fixed(0));
    expect(darted.told[0]).toMatchObject({ kind: 'sedate', hit: true, roll: 0 });
    expect(darted.told.map((t) => t.type)).toEqual(['ordered', 'ended', 'turn', 'asleep']);
    expect(who(darted.battle, 'e1')).toMatchObject({ asleep: true, ap: 0 });
    expect(who(darted.battle, 'c1').ammo).toBe(3);
    const woke = run({ ...made, battle: darted.battle }, [{ type: 'end' }]);
    expect(woke.told.find((t) => t.type === 'woke')).toEqual({ type: 'woke', unit: 'e1' });
    const missed = run(made, [{ type: 'order', unit: 'c1', target: 'e1' }], fixed(99));
    expect(missed.battle.misses.crew).toBe(1);
  });

  it('Kit out: itself or an ally beside, a full clip and 1 armor for the fight, once each', () => {
    const made = battleOn(room(8, 2).tiles(), [
      set('quartermaster', [0, 0]),
      set('marine', [1, 0]),
      set('pirate', [7, 1]),
    ]);
    Object.assign(who(made.battle, 'c2'), { ammo: 1 });
    const { battle, told } = run(made, [{ type: 'order', unit: 'c1', target: 'c2' }]);
    expect(told[0]).toMatchObject({ kind: 'kit', armor: 1, ammo: 4 });
    expect(who(battle, 'c2')).toMatchObject({ armor: 2, ammo: 4, kitted: true });
    expect(orderTargets(made.arena, battle, who(battle, 'c1'))).toEqual(['c1']);
  });

  it("is the crew's: a foe has none, and none is left once its uses are spent", () => {
    const made = battleOn(room(6, 1).tiles(), [set('marine', [0, 0]), set('pirate', [4, 0])]);
    expect(orderTargets(made.arena, made.battle, who(made.battle, 'e1'))).toEqual([]);
    Object.assign(who(made.battle, 'c1'), { uses: 0 });
    expect(act(made.arena, made.battle, { type: 'order', unit: 'c1', target: 'e1' }, fixed()).ok).toBe(false);
  });
});
