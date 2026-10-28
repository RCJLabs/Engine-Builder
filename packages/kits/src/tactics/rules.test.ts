/**
 * The tactics kit's rules, one test each (M7.5, D87, docs/specs/tactics.md#the-gate), after space-wrecked's
 * tests/battle.test.js and odds.test.js: the walk with doors and overwatch, each part of the odds, damage,
 * down and out, the turns, and refusals.
 */
import { BLOCKS_SIGHT, FULL_COVER, HALF_COVER, type PackTiles } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { arenaOn, fixed, room, set } from '../../test/tactics.ts';
import type { Arena, Rolls } from './field.ts';
import { fieldOf, unitOf } from './field.ts';
import { FOES_MOST, playFoes } from './foes.ts';
import { rangeBand, shotOdds } from './odds.ts';
import { act, createBattle, type Setting } from './turns.ts';
import { type Battle, type Move, NUMBERS, type Team, type Told, type Unit } from './types.ts';

function battleOn(tiles: PackTiles, units: readonly Setting[], first: Team = 'crew', options: Partial<Arena> = {}) {
  const arena = { ...arenaOn(tiles), ...options };
  const made = createBattle(arena, { battle: 'test', first, units });
  return { arena, ...made };
}

function run(arena: Arena, battle: Battle, moves: readonly Move[], rolls: Rolls = fixed()) {
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

describe('a battle', () => {
  it('starts on the first side, its units set out with ids by side, full clips and their ap', () => {
    const { battle, told } = battleOn(room(6, 2).tiles(), [
      set('marine', [0, 0]),
      set('pirate', [5, 0]),
      set('medic', [0, 1]),
    ]);
    expect(battle.units.map((u) => u.id)).toEqual(['c1', 'e1', 'c2']);
    expect(who(battle, 'c1')).toMatchObject({ hp: 10, most: 10, ammo: 4, ap: 2, uses: 2, status: 'active' });
    expect(who(battle, 'e1').ap).toBe(0);
    expect(told).toEqual([{ type: 'turn', side: 'crew', round: 1 }]);
  });

  it('leaves the battle it was given as it was, and refuses what the rules refuse, changing nothing', () => {
    const { arena, battle } = battleOn(room(6, 1).tiles(), [set('marine', [0, 0]), set('pirate', [5, 0])]);
    const copy = JSON.parse(JSON.stringify(battle));
    expect(act(arena, battle, { type: 'move', unit: 'c1', to: [2, 0] }, fixed()).ok).toBe(true);
    expect(battle).toEqual(copy);
    for (const move of [
      { type: 'move', unit: 'e1', to: [4, 0] },
      { type: 'move', unit: 'c1', to: [5, 0] },
      { type: 'move', unit: 'c9', to: [1, 0] },
      { type: 'reload', unit: 'c1' },
      { type: 'open', unit: 'c1', side: 'e' },
      { type: 'steady', unit: 'c1', target: 'e1' },
    ] as Move[])
      expect(act(arena, battle, move, fixed()).ok, JSON.stringify(move)).toBe(false);
  });

  it('charges one ap for a move within its mobility and both for a dash', () => {
    const { arena, battle } = battleOn(room(12, 1).tiles(), [set('marine', [0, 0]), set('pirate', [11, 0])]);
    expect(run(arena, battle, [{ type: 'move', unit: 'c1', to: [4, 0] }]).battle.units[0]?.ap).toBe(1);
    const dashed = run(arena, battle, [{ type: 'move', unit: 'c1', to: [5, 0] }]).battle;
    expect(dashed.side).toBe('foes');
    expect(act(arena, battle, { type: 'move', unit: 'c1', to: [9, 0] }, fixed()).ok).toBe(false);
  });

  it('opens a door as a unit walks through it, and it stays open', () => {
    const { arena, battle } = battleOn(room(4, 1).wall(1, 0, 'e', 'door').tiles(), [
      set('marine', [0, 0]),
      set('pirate', [3, 0]),
    ]);
    const { battle: after, told } = run(arena, battle, [{ type: 'move', unit: 'c1', to: [2, 0] }]);
    expect(after.doors).toEqual(['2,0,w']);
    expect(told.map((t) => t.type)).toEqual(['moved', 'opened', 'moved']);
  });
});

describe('overwatch', () => {
  const corridor = () =>
    battleOn(room(8, 1).tiles(), [set('marine', [7, 0]), set('pirate', [0, 0]), set('pirate', [1, 0])], 'foes');

  it('fires once, with its penalty, at the first foe to step into its sight, partway through the walk', () => {
    const tiles = room(8, 3)
      .put(4, 0, FULL_COVER | BLOCKS_SIGHT)
      .put(4, 1, FULL_COVER | BLOCKS_SIGHT)
      .tiles();
    const { arena, battle } = battleOn(tiles, [set('marine', [7, 0]), set('pirate', [2, 0])]);
    const watching = run(arena, battle, [{ type: 'watch', unit: 'c1' }]).battle;
    expect(watching.side).toBe('foes');
    const { battle: after, told } = run(arena, watching, [{ type: 'move', unit: 'e1', to: [4, 2] }], fixed(99));
    const shot = told.find((t) => t.type === 'shot');
    expect(shot).toMatchObject({ unit: 'c1', target: 'e1', watch: true, hit: false });
    const odds = shotOdds(
      arena,
      watching,
      fieldOf(arena, watching),
      who(watching, 'c1'),
      { ...who(watching, 'e1'), at: [4, 2] },
      true,
    );
    expect(odds.hitParts.find((p) => p.why === 'overwatch')?.value).toBe(-NUMBERS.overwatch);
    expect(shot?.chance).toBe(odds.hit);
    expect(told.map((t) => t.type)).toEqual(['moved', 'shot']);
    expect(who(after, 'c1').watch).toBe(false);
    expect(who(after, 'e1').ap).toBe(1);
  });

  it("holds fire while a unit passes through an ally's tile, and a mover that falls stays where it fell", () => {
    const { arena, battle } = corridor();
    Object.assign(who(battle, 'c1'), { watch: true });
    const through = run(arena, battle, [{ type: 'move', unit: 'e1', to: [2, 0] }], fixed(99));
    expect(through.told.map((t) => t.type)).toEqual(['moved', 'shot']);
    expect(through.told[0]?.path).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
    Object.assign(who(battle, 'e2'), { hp: 1 });
    const fell = run(arena, battle, [{ type: 'move', unit: 'e2', to: [3, 0] }], fixed(0, 99, 3));
    expect(who(fell.battle, 'e2')).toMatchObject({ at: [2, 0], status: 'dead' });
  });

  it("ends at the start of its unit's next turn", () => {
    const { arena, battle } = battleOn(room(8, 1).tiles(), [set('marine', [7, 0]), set('pirate', [0, 0])]);
    const after = run(arena, battle, [{ type: 'watch', unit: 'c1' }, { type: 'end' }]).battle;
    expect(who(after, 'c1').watch).toBe(false);
    expect(after.round).toBe(2);
  });
});

describe('the odds', () => {
  it('sees as far as sight reaches, and no further', () => {
    const { arena, battle } = battleOn(room(26, 1).tiles(), [
      set('marine', [0, 0]),
      set('pirate', [20, 0]),
      set('pirate', [21, 0]),
    ]);
    expect(act(arena, battle, { type: 'shoot', unit: 'c1', target: 'e1' }, fixed(99)).ok).toBe(true);
    expect(act(arena, battle, { type: 'shoot', unit: 'c1', target: 'e2' }, fixed(99)).ok).toBe(false);
  });

  it("counts a mark only for the marked unit's foes", () => {
    const { arena, battle } = battleOn(room(6, 1).tiles(), [
      set('marine', [0, 0]),
      set('pirate', [3, 0]),
      set('pirate', [4, 0]),
    ]);
    const grid = fieldOf(arena, battle);
    const marked = { ...who(battle, 'e2'), mark: { aim: 15, turns: 2 } };
    expect(shotOdds(arena, battle, grid, who(battle, 'c1'), marked).hitParts.at(-1)?.why).toBe('marked');
    expect(shotOdds(arena, battle, grid, who(battle, 'e1'), marked).hitParts.some((p) => p.why === 'marked')).toBe(
      false,
    );
  });

  it('puts ranges in bands by whole numbers: close, then mid, then long', () => {
    expect(rangeBand([0, 0], [3, 0], NUMBERS)).toBe('close');
    expect(rangeBand([0, 0], [2, 3], NUMBERS)).toBe('mid');
    expect(rangeBand([0, 0], [7, 0], NUMBERS)).toBe('mid');
    expect(rangeBand([0, 0], [5, 5], NUMBERS)).toBe('long');
  });

  it('adds aim and the gun at range in the open, the target flanked', () => {
    const { arena, battle } = battleOn(room(9, 1).tiles(), [set('marine', [0, 0]), set('pirate', [5, 0])]);
    const odds = shotOdds(arena, battle, fieldOf(arena, battle), who(battle, 'c1'), who(battle, 'e1'));
    expect(odds).toMatchObject({ hit: 80, crit: 40, band: 'mid', cover: 'none', flanked: true });
  });

  it('takes cover, defense, overwatch and suppression off, adds a mark and forgiving, and keeps 0 to 100', () => {
    const tiles = room(9, 1).put(4, 0, HALF_COVER).tiles();
    const { arena, battle } = battleOn(tiles, [set('medic', [0, 0]), set('pirate', [5, 0])], 'crew', {
      forgiving: true,
    });
    const grid = fieldOf(arena, battle);
    const shooter = { ...who(battle, 'c1'), suppressed: -30 };
    const target = { ...who(battle, 'e1'), defense: 5, mark: { aim: 15, turns: 2 } };
    const odds = shotOdds(arena, { misses: { crew: 2, foes: 0 } }, grid, shooter, target, true);
    expect(odds.hitParts.map((p) => [p.why, p.value])).toEqual([
      ['aim', 60],
      ['gun', 0],
      ['cover', -20],
      ['defense', -5],
      ['overwatch', -15],
      ['suppressed', -30],
      ['marked', 15],
      ['forgiving', 20],
    ]);
    expect(odds.hit).toBe(25);
    expect(odds.flanked).toBe(false);
    expect(shotOdds(arena, { misses: { crew: 9, foes: 0 } }, grid, shooter, target).hitParts.at(-1)?.value).toBe(30);
    expect(shotOdds(arena, battle, grid, { ...shooter, aim: 200 }, target).hit).toBe(100);
    expect(shotOdds(arena, battle, grid, { ...shooter, aim: -200 }, target).hit).toBe(0);
    expect(
      shotOdds(arena, { misses: { crew: 2, foes: 3 } }, grid, who(battle, 'e1'), who(battle, 'c1')).hitParts.some(
        (p) => p.why === 'forgiving',
      ),
    ).toBe(false);
  });
});

describe('a shot', () => {
  const duel = () => battleOn(room(6, 1).tiles(), [set('marine', [0, 0]), set('pirate', [3, 0])]);

  it('is rolled at the odds shown: hit, crit, then damage, the roll plus the crit bonus less armor, at least 1', () => {
    const { arena, battle } = duel();
    const { told, battle: after } = run(arena, battle, [{ type: 'shoot', unit: 'c1', target: 'e1' }], fixed(69, 39, 5));
    expect(told[0]).toMatchObject({
      type: 'shot',
      chance: 70,
      roll: 69,
      hit: true,
      critChance: 40,
      critRoll: 39,
      crit: true,
      damage: 7,
    });
    expect(who(after, 'e1').status).toBe('dead');
    expect(who(after, 'c1').ammo).toBe(3);
    const armored = { ...battle, units: battle.units.map((u) => (u.id === 'e1' ? { ...u, armor: 9 } : u)) };
    expect(run(arena, armored, [{ type: 'shoot', unit: 'c1', target: 'e1' }], fixed(0, 99, 3)).told[0]?.damage).toBe(1);
  });

  it('misses at the chance or above, a miss drawing once and counting toward forgiving odds', () => {
    const { arena, battle } = duel();
    const rolls = fixed(70);
    const after = run(arena, battle, [{ type: 'shoot', unit: 'c1', target: 'e1' }], rolls).battle;
    expect(rolls.left).toEqual([]);
    expect(after.misses.crew).toBe(1);
  });

  it('needs a round, and reload fills the clip for one ap', () => {
    const { arena, battle } = duel();
    Object.assign(who(battle, 'c1'), { ammo: 0 });
    expect(act(arena, battle, { type: 'shoot', unit: 'c1', target: 'e1' }, fixed()).ok).toBe(false);
    const after = run(arena, battle, [{ type: 'reload', unit: 'c1' }]).battle;
    expect(who(after, 'c1')).toMatchObject({ ammo: 4, ap: 1 });
  });
});

describe('down and out', () => {
  const ambush = (permadeath = false) =>
    battleOn(room(6, 2).tiles(), [set('marine', [0, 0]), set('medic', [0, 1]), set('brute', [2, 0])], 'foes', {
      permadeath,
    });

  it('puts the crew down at 0 hp to bleed out over their own turns, then out', () => {
    const { arena, battle } = ambush();
    Object.assign(who(battle, 'c1'), { hp: 1 });
    const shot = run(arena, battle, [{ type: 'shoot', unit: 'e1', target: 'c1' }], fixed(0, 99, 4));
    expect(shot.told.find((t) => t.type === 'down')).toEqual({ type: 'down', unit: 'c1', bleed: 3 });
    // The crew's turn starts as the brute's ends: a turn of bleeding already.
    expect(who(shot.battle, 'c1')).toMatchObject({ status: 'down', bleed: 2, hp: 0 });
    const ends = run(arena, shot.battle, [
      { type: 'end' },
      { type: 'end' },
      { type: 'end' },
      { type: 'end' },
      { type: 'end' },
    ]);
    const bled = [...shot.told, ...ends.told].filter((t) => t.type === 'bled').map((t) => t.bleed);
    expect(bled).toEqual([2, 1]);
    expect(who(ends.battle, 'c1').status).toBe('out');
    expect(ends.told.find((t) => t.type === 'out')).toEqual({ type: 'out', unit: 'c1', dead: false });
  });

  it('makes bleeding out death with permadeath', () => {
    const { arena, battle } = ambush(true);
    Object.assign(who(battle, 'c1'), { hp: 1 });
    const shot = run(arena, battle, [{ type: 'shoot', unit: 'e1', target: 'c1' }], fixed(0, 99, 4));
    const ends = run(arena, shot.battle, [
      { type: 'end' },
      { type: 'end' },
      { type: 'end' },
      { type: 'end' },
      { type: 'end' },
    ]);
    expect(who(ends.battle, 'c1').status).toBe('dead');
  });

  it('lets an ally beside steady one down, who bleeds no more', () => {
    const { arena, battle } = ambush();
    Object.assign(who(battle, 'c1'), { hp: 1 });
    const shot = run(arena, battle, [{ type: 'shoot', unit: 'e1', target: 'c1' }], fixed(0, 99, 4));
    const steadied = run(arena, shot.battle, [
      { type: 'steady', unit: 'c2', target: 'c1' },
      { type: 'end' },
      { type: 'end' },
    ]);
    expect(who(steadied.battle, 'c1')).toMatchObject({ status: 'stable', bleed: 0 });
    expect(steadied.told.some((t) => t.type === 'bled')).toBe(false);
  });

  it('kills the foes at 0, and with the last one the crew wins; with every crew member down the foes win', () => {
    const { arena, battle } = battleOn(room(4, 1).tiles(), [set('marine', [0, 0]), set('pirate', [2, 0])]);
    const won = run(arena, battle, [{ type: 'shoot', unit: 'c1', target: 'e1' }], fixed(0, 0, 5));
    expect(won.battle.winner).toBe('crew');
    expect(won.told.map((t) => t.type)).toEqual(['shot', 'dead', 'over']);
    expect(act(arena, won.battle, { type: 'end' }, fixed()).ok).toBe(false);
    const lost = battleOn(room(4, 1).tiles(), [set('marine', [0, 0], { hp: 1 }), set('brute', [2, 0])], 'foes');
    expect(
      run(lost.arena, lost.battle, [{ type: 'shoot', unit: 'e1', target: 'c1' }], fixed(0, 99, 4)).battle.winner,
    ).toBe('foes');
  });
});

describe("the foes' turn", () => {
  it('is played to its end, and ended for them after a hundred actions', () => {
    const { arena, battle } = battleOn(room(8, 1).tiles(), [
      set('marine', [0, 0]),
      set('pirate', [7, 0], { order: 'hustle' }),
    ]);
    const start = act(arena, battle, { type: 'watch', unit: 'c1' }, fixed());
    if (!start.ok) throw new Error(start.error);
    Object.assign(who(start.battle, 'e1'), { uses: 500 });
    const played = playFoes(arena, start.battle, fixed(), () => ({ type: 'order', unit: 'e1' }));
    expect(played.told.filter((t) => t.type === 'ordered')).toHaveLength(FOES_MOST);
    expect(played.battle).toMatchObject({ side: 'crew', round: 2 });
    const refused = playFoes(arena, start.battle, fixed(), () => ({ type: 'reload', unit: 'e1' }));
    expect(refused.told.map((t) => t.type)).toEqual(['ended', 'turn']);
  });
});

describe('turns', () => {
  it("end by themselves once no one has an ap left, and a round is both sides' turns", () => {
    const { arena, battle } = battleOn(room(8, 1).tiles(), [set('marine', [0, 0]), set('pirate', [7, 0])]);
    const { battle: after, told } = run(arena, battle, [{ type: 'watch', unit: 'c1' }]);
    expect(after.side).toBe('foes');
    expect(told.map((t) => t.type)).toEqual(['watched', 'ended', 'turn']);
    const back = run(arena, after, [{ type: 'end' }]).battle;
    expect(back).toMatchObject({ side: 'crew', round: 2 });
    expect(who(back, 'c1').ap).toBe(2);
  });
});
