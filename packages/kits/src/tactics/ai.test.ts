/**
 * The AI in whole numbers (M7.5, D87, docs/specs/tactics.md#the-gate), held to space-wrecked's
 * tests/ai.test.js case by case on rooms made a tile and an edge at a time.
 */
import { BLOCKS_SIGHT, FULL_COVER, HALF_COVER, type PackTiles, type Tile } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { arenaOn, mulberry, room, set } from '../../test/tactics.ts';
import { aiAction, bestPlan, harm, OPEN_SHOT, plansFor } from './ai.ts';
import { coverAt, fieldOf, unitOf } from './field.ts';
import { act, createBattle, type Setting } from './turns.ts';
import type { Battle, Move, Told, Unit } from './types.ts';

/** Space-Wrecked's full cover, a locker: it blocks sight too. */
const LOCKER = FULL_COVER | BLOCKS_SIGHT;

/** A battle on a small map where the foes, played by the AI, move first. */
function foesFirst(tiles: PackTiles, units: readonly Setting[]) {
  const arena = arenaOn(tiles);
  return { arena, battle: createBattle(arena, { battle: 'test', first: 'foes', units }).battle };
}

/** The AI's whole turn for its first unit: its actions and what they told, and the battle after. */
function aiTurn(arena: ReturnType<typeof arenaOn>, start: Battle) {
  let battle = start;
  const rolls = mulberry(1);
  const id = (battle.units.find((u) => u.side === battle.side && u.ap > 0) as Unit).id;
  const actions: Move[] = [];
  const told: Told[] = [];
  while (!battle.winner && battle.side === 'foes' && (unitOf(battle, id) as Unit).ap > 0) {
    const action = aiAction(arena, battle);
    const result = act(arena, battle, action, rolls);
    if (!result.ok) throw new Error(result.error);
    actions.push(action);
    told.push(...result.told);
    battle = result.battle;
  }
  return { actions, told, battle };
}

const at = (battle: Battle, id: string): Tile => (unitOf(battle, id) as Unit).at;
const coverOf = (arena: ReturnType<typeof arenaOn>, battle: Battle, id: string, from: string) =>
  coverAt(fieldOf(arena, battle), at(battle, id), at(battle, from));

describe('the AI', () => {
  it('takes cover to shoot: behind a crate rather than in the open', () => {
    const { arena, battle } = foesFirst(room(9, 5).put(4, 1, HALF_COVER).tiles(), [
      set('marine', [8, 2]),
      set('pirate', [2, 2]),
    ]);
    const turn = aiTurn(arena, battle);
    expect(turn.actions[0]?.type).toBe('move');
    expect(coverOf(arena, turn.battle, 'e1', 'c1')).toEqual({ cover: 'half', flanked: false });
    expect(turn.actions.at(-1)).toEqual({ type: 'shoot', unit: 'e1', target: 'c1' });
  });

  it('takes the best cover it can shoot from: a locker before a crate', () => {
    const tiles = room(12, 6).put(6, 1, HALF_COVER).put(5, 3, LOCKER).tiles();
    const { arena, battle } = foesFirst(tiles, [set('marine', [11, 1]), set('pirate', [4, 3])]);
    const turn = aiTurn(arena, battle);
    expect(turn.actions[0]).toEqual({ type: 'move', unit: 'e1', to: [5, 4] });
    expect(coverOf(arena, turn.battle, 'e1', 'c1').cover).toBe('full');
    expect(turn.actions.at(-1)).toEqual({ type: 'shoot', unit: 'e1', target: 'c1' });
  });

  it("flanks: round the marine's crate to a spot with cover of its own", () => {
    const tiles = room(9, 4).put(5, 2, HALF_COVER).put(6, 0, HALF_COVER).tiles();
    const { arena, battle } = foesFirst(tiles, [set('marine', [6, 2]), set('pirate', [4, 1])]);
    expect(coverOf(arena, battle, 'c1', 'e1').cover).toBe('half');
    const turn = aiTurn(arena, battle);
    expect(turn.actions[0]).toEqual({ type: 'move', unit: 'e1', to: [7, 0] });
    expect(coverOf(arena, turn.battle, 'c1', 'e1').flanked).toBe(true);
    expect(coverOf(arena, turn.battle, 'e1', 'c1').cover).toBe('half');
    const shot = turn.told.find((t) => t.type === 'shot');
    expect(shot?.target).toBe('c1');
    expect(shot?.cover).toBe('none');
  });

  it('picks the target it can do most harm to: the one in the open', () => {
    const tiles = room(9, 5).put(6, 3, HALF_COVER).tiles();
    const { arena, battle } = foesFirst(tiles, [set('marine', [7, 1]), set('marine', [7, 3]), set('pirate', [3, 2])]);
    expect(aiTurn(arena, battle).told.find((t) => t.type === 'shot')?.target).toBe('c1');
  });

  it('counts a hit that would kill as worth more than the damage alone', () => {
    const { arena, battle } = foesFirst(room(9, 3).tiles(), [set('marine', [5, 1]), set('pirate', [1, 1])]);
    const [marine, pirate] = battle.units as [Unit, Unit];
    const grid = fieldOf(arena, battle);
    expect(harm(arena, battle, grid, pirate, { ...marine, hp: 1 })).toBeGreaterThan(
      harm(arena, battle, grid, pirate, marine),
    );
  });

  it('moves up and watches with no shot in reach: the overwatch fallback', () => {
    const tiles = room(12, 4).put(6, 0, LOCKER).put(6, 1, LOCKER).put(6, 2, LOCKER).tiles();
    const { arena, battle } = foesFirst(tiles, [set('marine', [8, 0]), set('pirate', [2, 1])]);
    const turn = aiTurn(arena, battle);
    expect(turn.actions.map((a) => a.type)).toEqual(['move', 'watch']);
  });

  it('pushes on with the foe far off and out of sight, instead of watching', () => {
    const tiles = room(20, 4).put(12, 0, LOCKER).put(12, 1, LOCKER).put(12, 2, LOCKER).tiles();
    const { arena, battle } = foesFirst(tiles, [set('marine', [16, 0]), set('pirate', [1, 1])]);
    const turn = aiTurn(arena, battle);
    expect(turn.actions.map((a) => a.type)).toEqual(['move']);
    expect(at(turn.battle, 'e1')[0]).toBeGreaterThanOrEqual(7);
  });

  it('breaches: opens the door beside it and shoots through, drawing no overwatch fire', () => {
    const tiles = room(10, 3).wall(4, 0, 'e').wall(4, 1, 'e', 'door').wall(4, 2, 'e').tiles();
    const { arena, battle } = foesFirst(tiles, [set('marine', [8, 1]), set('pirate', [4, 1])]);
    (battle.units[0] as Unit).watch = true;
    const turn = aiTurn(arena, battle);
    expect(turn.actions[0]).toEqual({ type: 'open', unit: 'e1', side: 'e' });
    expect(turn.actions[1]).toEqual({ type: 'shoot', unit: 'e1', target: 'c1' });
    expect(turn.told.filter((t) => t.type === 'shot' && t.watch)).toHaveLength(0);
  });

  it('reloads an empty gun first', () => {
    const { arena, battle } = foesFirst(room(6, 3).tiles(), [set('marine', [5, 1]), set('pirate', [1, 1])]);
    (battle.units[1] as Unit).ammo = 0;
    expect(aiAction(arena, battle)).toEqual({ type: 'reload', unit: 'e1' });
  });

  it('plans the same each time and changes nothing by planning', () => {
    const { arena, battle } = foesFirst(room(9, 5).put(4, 1, HALF_COVER).tiles(), [
      set('marine', [8, 2]),
      set('pirate', [2, 2]),
    ]);
    const copy = JSON.parse(JSON.stringify(battle)) as Battle;
    expect(aiAction(arena, battle)).toEqual(aiAction(arena, copy));
    expect(battle).toEqual(copy);
  });

  it('allows a plan in the open only with no covered plan, or for a shot worth the risk', () => {
    const { arena, battle } = foesFirst(room(9, 5).put(4, 1, HALF_COVER).tiles(), [
      set('marine', [8, 2]),
      set('pirate', [2, 2]),
    ]);
    const plans = plansFor(arena, battle, battle.units[1] as Unit);
    const plan = bestPlan(plans);
    const covered = plans.filter((p) => p.exposed.length === 0);
    if (plan.exposed.length > 0) expect(covered.length === 0 || plan.attack >= OPEN_SHOT).toBe(true);
    expect(plans.length).toBeGreaterThan(20);
  });
});
