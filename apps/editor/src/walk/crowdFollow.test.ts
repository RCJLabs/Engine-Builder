/**
 * The crowd's M6.3 moves (D75, docs/specs/ai.md#the-world-module-at-version-4), through Recast in
 * Node: a follower keeps its distance from the player, one standing with `facing` turns to them,
 * and one built after the walk began starts at its goal, its arrival said at once, or beside the
 * player it follows.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { bakedSolids, soupOf } from '../nav/geometry.ts';
import { bakeSoup, openNav, readyNav } from '../nav/lib.ts';
import type { Vec3 } from '../spaces/vec.ts';
import { type CrowdNpc, createCrowdWalk, type Keep, type NpcTold } from './crowdWalk.ts';
import { yawToward } from './facing.ts';

const across = (a: readonly number[], b: readonly number[]) =>
  Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));
const places = new Map<string, Vec3>([['well', [0, 0, 8]]]);
const npc = (path: string, placed: Vec3): CrowdNpc => ({ path, actor: path, placed, radius: 0.3, height: 1.75 });

function green() {
  const baked = bakeSoup(
    soupOf(
      bakedSolids([
        {
          path: 'cobbles',
          frames: [{ at: [0, -0.2, 0], turn: [0, 0, 0], scale: [30, 0.2, 30] }],
          shape: 'box',
          collider: {},
        },
      ]),
      null,
    ),
  );
  if (!baked.ok) throw new Error(baked.why);
  return openNav(baked.navmesh);
}

function walkOf(
  npcs: CrowdNpc[],
  told: Record<string, NpcTold>,
  begun?: (path: string) => boolean,
  keep?: (actor: string) => Keep,
) {
  const nav = green();
  const walk = createCrowdWalk(nav, npcs, (path) => places.get(path), told, begun, keep);
  const of = (actor: string) => walk.list().find((n) => n.actor === actor);
  const steps = (n: number, feet: Vec3) => {
    for (let i = 0; i < n; i++) walk.step(1 / 60, feet);
  };
  const done = () => {
    walk.free();
    nav.free();
  };
  return { nav, walk, of, steps, done };
}

describe('the crowd’s M6.3 moves, through Recast in Node', () => {
  beforeAll(() => readyNav());

  it('backs a fighter waiting its turn away to its distance as the player comes close (M6.4)', () => {
    const waiting = () => ({ distance: 5, away: true });
    const { walk, of, steps, done } = walkOf([npc('wren', [0, 0, 0])], { wren: { fight: 1 } }, undefined, waiting);
    walk.present(new Set(['wren']));
    const player: Vec3 = [1.5, 0, 0];
    steps(60 * 6, player);
    expect(across(of('wren')?.at ?? [], player)).toBeGreaterThan(4.5);
    done();
  });

  it('walks a follower to within its distance of the player, stands, and sets off again when they go', () => {
    const { walk, of, steps, done } = walkOf([npc('dog', [8, 0, 0])], { dog: { follow: 2 } });
    walk.present(new Set(['dog']));
    const player: Vec3 = [-6, 0, 0];
    steps(60 * 10, player);
    expect(across(of('dog')?.at ?? [], player)).toBeLessThan(2.5);
    expect(of('dog')).toMatchObject({ state: 'standing', follow: 2 });
    // A step's sway within the slack: it stays.
    steps(30, [-6.3, 0, 0]);
    expect(of('dog')?.state).toBe('standing');
    const away: Vec3 = [-6, 0, 10];
    steps(1, away);
    expect(of('dog')?.state).toBe('walking');
    steps(60 * 10, away);
    expect(across(of('dog')?.at ?? [], away)).toBeLessThan(2.5);
    // No longer told to follow, it stops where it is.
    walk.told({});
    expect(of('dog')).toMatchObject({ state: 'standing' });
    expect(of('dog')?.follow).toBeUndefined();
    done();
  });

  it('turns one standing with facing to the player, and leaves one without it as it faced', () => {
    const { walk, of, steps, done } = walkOf([npc('smith', [5, 0, 5]), npc('miller', [-5, 0, 5])], {
      smith: { facing: 'player', feet: [5, 0, 5], yaw: 0 },
      miller: { feet: [-5, 0, 5], yaw: 0 },
    });
    walk.present(new Set(['smith', 'miller']));
    const player: Vec3 = [0, 0, 12];
    steps(2, player);
    const smith = of('smith');
    expect(smith?.facing).toBe(true);
    expect(smith?.yaw).toBeCloseTo(yawToward(smith?.at ?? [0, 0, 0], player), 6);
    expect(of('miller')?.yaw).toBe(0);
    done();
  });

  it('starts one built after the walk began at its goal, its arrival said at once, and one that began where it stood', () => {
    const told = { carter: { goal: 'well' }, crier: { goal: 'well' } };
    const { walk, of, done } = walkOf(
      [npc('carter', [0, 0, -8]), npc('crier', [9, 0, -9])],
      told,
      (path) => path === 'carter',
    );
    walk.present(new Set(['carter', 'crier']));
    expect(across(of('crier')?.at ?? [], [0, 0, 8])).toBeLessThan(0.5);
    expect(of('crier')?.state).toBe('standing');
    expect(walk.arrivals()).toEqual(new Map([['crier', 'well']]));
    // The carter was there as the walk began: it walks from where it stood.
    expect(across(of('carter')?.at ?? [], [0, 0, -8])).toBeLessThan(0.01);
    expect(of('carter')?.state).toBe('walking');
    done();
  });

  it('starts a follower built late beside the player, and one that went and came back at its goal', () => {
    const { walk, of, steps, done } = walkOf(
      [npc('dog', [9, 0, 9]), npc('carter', [0, 0, -8])],
      { dog: { follow: 2 } },
      (path) => path === 'carter',
    );
    walk.present(new Set(['carter']));
    const player: Vec3 = [-4, 0, -4];
    steps(1, player);
    walk.present(new Set(['carter', 'dog']));
    expect(across(of('dog')?.at ?? [], player)).toBeLessThan(0.5);
    // The carter goes from the rings, is sent to the well, and comes back: it is there already.
    walk.present(new Set(['dog']));
    walk.told({ dog: { follow: 2 }, carter: { goal: 'well' } });
    expect(of('carter')?.state).toBe('away');
    walk.present(new Set(['dog', 'carter']));
    expect(across(of('carter')?.at ?? [], [0, 0, 8])).toBeLessThan(0.5);
    expect(walk.arrivals().get('carter')).toBe('well');
    done();
  });
});
