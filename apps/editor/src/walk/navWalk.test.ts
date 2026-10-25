/**
 * The walk's navigation as plain parts (M6.2, D74): the tapped path's push and its end, the places
 * walk-to sends NPCs, world/npcs-at and when it goes, the outbox keeping the newest, the crowd
 * walking an NPC to its goal through Recast in Node, and an NPC's body moved as its agent walks.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import type { Action } from '@eb/core';
import type { Sent } from '@eb/ui';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { bakedSolids, soupOf } from '../nav/geometry.ts';
import { bakeSoup, openNav, readyNav } from '../nav/lib.ts';
import type { Vec3 } from '../spaces/vec.ts';
import type { Intent } from './controls.ts';
import { createCrowdWalk, type WalkingNpc } from './crowdWalk.ts';
import { objectPlaces } from './goals.ts';
import { AGAIN_MS, createNpcTell, npcsAt } from './npcTell.ts';
import { createOutbox } from './outbox.ts';
import { createWalker } from './physics.ts';
import { ARRIVE_M, pushAlong, pushedElsewhere, tapPathOf, targetOf } from './tapPath.ts';

const still: Intent = { move: [0, 0], run: false, jump: false, use: false, look: [0, 0] };
const near = (a: readonly number[], b: readonly number[], by = 1e-9) =>
  a.every((v, i) => Math.abs(v - (b[i] ?? 0)) < by);

describe('a tapped path', () => {
  it('pushes toward its next corner in the yaw’s frame, past each it reaches, and ends at the last', () => {
    const path = tapPathOf([
      [0, 0, -5],
      [5, 0, -5],
    ]);
    if (!path) throw new Error('No path');
    expect(targetOf(path)).toEqual([5, 0, -5]);
    // Facing −z (yaw 0), the first corner is straight ahead.
    expect(near(pushAlong(path, [0, 0, 0], 0).move, [0, 1])).toBe(true);
    // Turned a quarter left (yaw 90 faces −x), it is to the right.
    expect(near(pushAlong(path, [0, 0, 0], 90).move, [1, 0])).toBe(true);
    // At the first corner, the second, along +x: to the right when facing −z.
    const on = pushAlong(path, [0, 0, -5 + ARRIVE_M / 2], 0);
    expect(on.path?.next).toBe(1);
    expect(near(on.move, [1, 0], 0.05)).toBe(true);
    expect(pushAlong(path, [5, 0, -5], 0)).toEqual({ path: null, move: [0, 0] });
    expect(tapPathOf(null)).toBeNull();
    expect(tapPathOf([])).toBeNull();
  });

  it('gives way to the stick, the keys or a pad', () => {
    expect(pushedElsewhere(still)).toBe(false);
    expect(pushedElsewhere({ ...still, move: [0, 0.2] })).toBe(true);
    expect(pushedElsewhere({ ...still, look: [3, 0] })).toBe(false);
  });
});

describe('objectPlaces', () => {
  it('places each object through its prefab’s place and turn, a placed record’s too', () => {
    const places = objectPlaces(
      {
        name: 'Square',
        objects: [
          { id: 'well', shape: 'box', at: [2, 0, 3] },
          { id: 'stall', prefab: 'stall', at: [10, 0, 0], turn: [0, 90, 0] },
          { id: 'carter', record: 'actor:carter', at: [-4, 0, 1] },
        ],
      },
      new Map([['stall', { name: 'Stall', objects: [{ id: 'counter', shape: 'box', at: [1, 0, 0] }] }]]),
    );
    expect(places.get('well')).toEqual([2, 0, 3]);
    expect(places.get('carter')).toEqual([-4, 0, 1]);
    // A quarter turn about y takes +x to −z.
    expect(near(places.get('stall/counter') ?? [], [10, 0, -1], 1e-9)).toBe(true);
  });
});

const npc = (actor: string, at: Vec3, yaw?: number): WalkingNpc => ({
  actor,
  path: actor,
  at,
  velocity: [0, 0, 0],
  yaw,
  state: 'standing',
});

describe('world/npcs-at', () => {
  it('says each NPC’s feet and yaw as the sim keeps them, and its arrival', () => {
    expect(
      npcsAt(
        'square',
        [npc('carter', [1.234, 0.004, -2], -90), npc('miller', [0, 0, 0])],
        new Map([['carter', 'well']]),
      ),
    ).toEqual({
      type: 'world/npcs-at',
      space: 'square',
      npcs: { carter: { feet: [1.23, 0, -2], yaw: 270, arrived: 'well' }, miller: { feet: [0, 0, 0], yaw: 0 } },
    });
  });

  describe('as the walk tells it', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    function told() {
      const asked: { action: Action; answer: (sent: Sent) => void }[] = [];
      const outbox = createOutbox((action) => new Promise<Sent>((answer) => asked.push({ action, answer })));
      const heard: string[] = [];
      const tell = createNpcTell({ space: 'square', here: () => true }, outbox, (a, g) => heard.push(`${a} ${g}`));
      return { asked, heard, tell };
    }

    it('sends an arrival at once, again a second after the sim refuses it, and hears it taken', async () => {
      const { asked, heard, tell } = told();
      const list = [npc('carter', [3, 0, 3], 45)];
      const arrivals = new Map([['carter', 'well']]);
      tell.frame(list, arrivals, 0);
      expect(asked).toHaveLength(1);
      // On its way, it isn't sent twice.
      tell.frame(list, arrivals, 16);
      expect(asked).toHaveLength(1);
      asked[0]?.answer('refused');
      await vi.advanceTimersByTimeAsync(0);
      tell.frame(list, arrivals, performance.now() + AGAIN_MS / 2);
      expect(asked).toHaveLength(1);
      tell.frame(list, arrivals, performance.now() + AGAIN_MS);
      expect(asked).toHaveLength(2);
      asked[1]?.answer('accepted');
      await vi.advanceTimersByTimeAsync(0);
      expect(heard).toEqual(['carter well']);
      expect(tell.sent().map((s) => s.sent)).toEqual(['refused', 'accepted']);
    });

    it('says the stands every 5 s once one has moved half a metre, and none it was never told of', () => {
      const { asked, tell } = told();
      tell.frame([npc('carter', [0, 0, 0], 0)], new Map(), 0);
      tell.frame([npc('carter', [0.2, 0, 0], 0)], new Map(), 6000);
      expect(asked).toHaveLength(0);
      tell.frame([npc('carter', [1, 0, 0], 0)], new Map(), 6000);
      expect(asked.map((a) => (a.action as unknown as { npcs: object }).npcs)).toEqual([
        { carter: { feet: [1, 0, 0], yaw: 0 } },
      ]);
      tell.stand([], new Map(), 7000);
      expect(asked).toHaveLength(1);
    });
  });

  it('keeps only the newest waiting in the outbox, as world/at', async () => {
    const asked: Action[] = [];
    const box = createOutbox(async (action) => {
      asked.push(action);
      return 'accepted';
    });
    const at = (x: number): Action => ({
      type: 'world/npcs-at',
      space: 'square',
      npcs: { carter: { feet: [x, 0, 0], yaw: 0 } },
    });
    const first = box.post(at(1));
    const second = box.post(at(2));
    expect(await first).toBe('dropped');
    box.pump();
    expect(await second).toBe('accepted');
    expect(asked).toEqual([at(2)]);
  });
});

describe('the crowd’s walk, through Recast in Node', () => {
  beforeAll(async () => {
    await readyNav();
    await RAPIER.init();
  });

  const square = () => {
    const baked = bakeSoup(
      soupOf(
        bakedSolids([
          {
            path: 'cobbles',
            frames: [{ at: [0, -0.2, 0], turn: [0, 0, 0], scale: [30, 0.2, 30] }],
            shape: 'box',
            collider: {},
          },
          { path: 'stall', frames: [{ at: [0, 0, 0], turn: [0, 0, 0], scale: [4, 2, 2] }], shape: 'box', collider: {} },
        ]),
        null,
      ),
    );
    if (!baked.ok) throw new Error(baked.why);
    return openNav(baked.navmesh);
  };
  const places = new Map<string, Vec3>([
    ['well', [0, 0, 8]],
    ['gate', [0, 0, -8]],
  ]);

  it('walks a sent NPC round the stall to its goal, says the arrival once, and keeps one that isn’t built', () => {
    const nav = square();
    const walk = createCrowdWalk(
      nav,
      [
        { path: 'carter', actor: 'carter', placed: [0, 0, -8], radius: 0.3, height: 1.75 },
        { path: 'miller', actor: 'miller', placed: [6, 0, 6], radius: 0.3, height: 1.75 },
      ],
      (path) => places.get(path),
      { miller: { feet: [5, 0, 5], yaw: 30 } },
    );
    walk.present(new Set(['carter', 'miller']));
    walk.told({ carter: { goal: 'well' } });
    expect(walk.list().find((n) => n.actor === 'carter')?.state).toBe('walking');
    let steps = 0;
    for (; steps < 60 * 30 && walk.arrivals().size === 0; steps++) walk.step(1 / 60, [12, 0, 12]);
    expect(walk.arrivals()).toEqual(new Map([['carter', 'well']]));
    const carter = walk.list().find((n) => n.actor === 'carter');
    expect(Math.hypot((carter?.at[0] ?? 9) - 0, (carter?.at[2] ?? 9) - 8)).toBeLessThan(0.5 + 0.35);
    expect(carter?.state).toBe('standing');
    // Heard, the arrival is done; it isn't said again.
    walk.heard('carter', 'well');
    for (let i = 0; i < 60; i++) walk.step(1 / 60, [12, 0, 12]);
    expect(walk.arrivals().size).toBe(0);
    // The miller, where a load stood them, isn't sent: it stands. Not built, it keeps that place.
    const miller = walk.list().find((n) => n.actor === 'miller');
    expect(near(miller?.at ?? [], [5, 0, 5], 0.2)).toBe(true);
    walk.present(new Set(['carter']));
    expect(walk.list().find((n) => n.actor === 'miller')?.state).toBe('away');
    // The carter, no longer built, keeps where it walked to, not where it was placed.
    const there = walk.list().find((n) => n.actor === 'carter')?.at ?? [];
    walk.present(new Set(['miller']));
    const away = walk.list().find((n) => n.actor === 'carter');
    expect(away?.state).toBe('away');
    expect(near(away?.at ?? [], there, 1e-6)).toBe(true);
    walk.free();
    nav.free();
  });

  it('moves an NPC’s kinematic body by its shift, which the camera’s rays then meet there', () => {
    const walker = createWalker(
      RAPIER,
      {
        solids: [
          {
            kind: 'capsule',
            path: 'carter',
            center: [0, 0.9, -3],
            turn: [0, 0, 0, 1],
            radius: 0.3,
            halfHeight: 0.6,
            moves: false,
            npc: true,
          },
        ],
        spawn: undefined,
        at: [0, 0, 0],
      },
      null,
    );
    const ahead = () => walker.clear([0, 0.9, 0], [0, 0, -1], 20);
    expect(ahead()).toBeCloseTo(2.7, 1);
    walker.npcAt('carter', [0, 0, -4]);
    walker.step(still, 0);
    expect(ahead()).toBeCloseTo(6.7, 1);
    walker.free();
  });
});
