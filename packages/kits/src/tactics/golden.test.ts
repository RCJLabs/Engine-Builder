/**
 * The golden battle (M7.5, D87, docs/specs/tactics.md#the-gate): Space-Wrecked's 16 actions on its example
 * ship, fed its own generator through the kit's Rolls, give its 33 lines of example-battle.txt word for word,
 * from 26 draws. Its files are Space-Wrecked's, under test/fixtures/space-wrecked/NOTICE.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Tile } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { arenaOn, KINDS, mulberry, set, shipTiles } from '../../test/tactics.ts';
import { lineOf } from './lines.ts';
import { act, createBattle } from './turns.ts';
import type { Battle, Move, Told } from './types.ts';

const FIXTURES = join(import.meta.dirname, '../../test/fixtures/space-wrecked');

interface Fixture {
  readonly seed: string;
  readonly units: readonly { kind: string; x: number; y: number }[];
  readonly actions: readonly Record<string, unknown>[];
}

const fixture = JSON.parse(readFileSync(join(FIXTURES, 'example-battle.json'), 'utf8')) as Fixture;
const golden = readFileSync(join(FIXTURES, 'example-battle.txt'), 'utf8').trimEnd().split('\n');

/** Space-Wrecked's actions as the kit's, its rows one lower. */
function moveOf(action: Record<string, unknown>): Move {
  if (action.type === 'move') {
    const [x, y] = action.to as [number, number];
    return { type: 'move', unit: action.unit as string, to: [x, y - 1] };
  }
  if (action.type === 'overwatch') return { type: 'watch', unit: action.unit as string };
  if (action.type === 'stabilize')
    return { type: 'steady', unit: action.unit as string, target: action.target as string };
  return action as unknown as Move;
}

function play(): { battle: Battle; told: Told[]; drawn: number[] } {
  const arena = arenaOn(shipTiles());
  const rolls = mulberry(fixture.seed);
  const units = fixture.units.map((u) => set(u.kind, [u.x, u.y - 1]));
  let { battle, told } = createBattle(arena, { battle: 'example', first: 'crew', units });
  told = [...told];
  for (const [index, action] of fixture.actions.entries()) {
    const result = act(arena, battle, moveOf(action), rolls);
    if (!result.ok) throw new Error(`Action ${index} was refused: ${result.error}`);
    battle = result.battle;
    told.push(...result.told);
  }
  return { battle, told, drawn: rolls.drawn };
}

describe('the golden battle', () => {
  const { battle, told, drawn } = play();
  const name = (id: string) =>
    `${KINDS[(battle.units.find((u) => u.id === id) as { actor: string }).actor]?.name} ${id}`;

  it("tells Space-Wrecked's 33 lines, word for word", () => {
    const lines = told.map((t) => lineOf(t, { name, place: ([c, r]: Tile) => `(${c}, ${r + 1})` }));
    expect(lines).toEqual(golden);
    expect(lines).toHaveLength(33);
  });

  it('draws 26 times: three a hit and one a miss', () => {
    expect(drawn).toHaveLength(26);
    const shots = told.filter((t) => t.type === 'shot');
    expect(shots.reduce((sum, shot) => sum + (shot.hit ? 3 : 1), 0)).toBe(26);
  });

  it('ends with the crew the winner and every boarder dead', () => {
    expect(battle.winner).toBe('crew');
    expect(battle.units.filter((u) => u.side === 'foes').map((u) => u.status)).toEqual(['dead', 'dead', 'dead']);
    expect(battle.units.find((u) => u.id === 'c1')?.hp).toBe(2);
  });
});
