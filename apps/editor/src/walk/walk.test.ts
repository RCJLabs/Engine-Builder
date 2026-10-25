/**
 * The trail walked headless (M5.8, D70, docs/specs/movement.md#the-gate): its pack built from the
 * fixture, its spaces read as the page reads them, and Rapier stepping the character through them
 * in Node, as on the page. Each of the gate's walks, without a view.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import RAPIER from '@dimforge/rapier3d-compat';
import { compileWithGame, memorySource } from '@eb/compiler';
import type { PackWorld } from '@eb/core';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Vec3 } from '../spaces/vec.ts';
import { heightAt } from '../terrain/grid.ts';
import { shotOf } from './cameras.ts';
import type { Intent } from './controls.ts';
import { BODY, createWalker, type Walker } from './physics.ts';
import { spawnOf } from './solids.ts';
import { walkSpace } from './world.ts';
import { inZone, stepZones, type ZoneState } from './zones.ts';

const TRAIL = join(import.meta.dirname, '../../../../tools/cli/test/fixtures/trail');

function filesOf(root: string): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files[relative(root, path).split('\\').join('/')] = readFileSync(path);
    }
  };
  walk(root);
  return files;
}

let world: PackWorld;
beforeAll(async () => {
  await RAPIER.init();
  const compiled = await compileWithGame(memorySource(filesOf(TRAIL)));
  if (!compiled.pack?.world) throw new Error('The trail has no world');
  world = compiled.pack.world;
}, 30_000);

const STILL: Intent = { move: [0, 0], run: false, jump: false, look: [0, 0] };
const forward = (more: Partial<Intent> = {}): Intent => ({ ...STILL, move: [0, 1], ...more });

function trail(name = 'trailhead') {
  const space = walkSpace(world, name);
  if (!space) throw new Error(`No space ${name}`);
  const walker = createWalker(RAPIER, { solids: space.parts.solids, spawn: spawnOf(space.parts.spawns) }, space.ground);
  const groundAt = (x: number, z: number) => {
    const g = space.ground;
    if (!g) return 0;
    return heightAt({ ...g, high: 0, paint: new Uint8Array(), foliage: new Uint8Array() } as never, x, z);
  };
  return { space, walker, groundAt };
}

/** `seconds` of fixed steps with one intent, facing `yaw`. */
function walkFor(walker: Walker, seconds: number, intent: Intent, yaw = 0) {
  for (let i = 0; i < Math.round(seconds * 60); i++) walker.step(intent, yaw);
}

const near = (a: number, b: number, by: number) => Math.abs(a - b) <= by;

describe('the trailhead walked', () => {
  it('starts at its spawn point, on the ground, and walks the path at 2.5 m/s, its feet on the drawn ground', () => {
    const { walker, groundAt } = trail();
    walkFor(walker, 0.2, STILL);
    const [x0, y0, z0] = walker.feet();
    expect(near(x0, 0, 1e-4) && near(z0, 20, 1e-4)).toBe(true);
    expect(near(y0, groundAt(0, 20), 0.05)).toBe(true);
    expect(walker.grounded()).toBe(true);
    walkFor(walker, 2, forward());
    const [x, y, z] = walker.feet();
    expect(near(x, 0, 0.01)).toBe(true);
    // 2 s at 2.5 m/s up a gentle slope: 5 m, give or take the first step's start.
    expect(near(z0 - z, 5, 0.15)).toBe(true);
    expect(near(y, groundAt(x, z), 0.05)).toBe(true);
    walkFor(walker, 1, forward({ run: true }));
    expect(near(z - walker.feet()[2], 5, 0.15)).toBe(true);
  });

  it('stops at the boulder’s face', () => {
    const { walker, groundAt } = trail();
    walker.teleport([-4, groundAt(-4, 16), 16]);
    walkFor(walker, 3, forward());
    // The boulder's near face is at z 12.6; the capsule stops its radius short.
    expect(near(walker.feet()[2], 12.6 + BODY.radius, 0.06)).toBe(true);
  });

  it('can’t climb the bank, steeper than 40°', () => {
    const { walker, groundAt } = trail();
    walker.teleport([9, groundAt(9, 0), 0]);
    // Facing +x: yaw -90.
    walkFor(walker, 4, forward(), -90);
    const [x, y] = walker.feet();
    expect(x).toBeLessThan(12.6);
    expect(y).toBeLessThan(groundAt(12, 0) + 0.9);
  });

  it('is stopped by the step, 0.8 m tall, and jumps onto it', () => {
    const { walker, groundAt } = trail();
    walker.teleport([4, groundAt(4, 15.5), 15.5]);
    walkFor(walker, 2, forward());
    expect(near(walker.feet()[2], 13 + BODY.radius, 0.06)).toBe(true);
    walkFor(walker, 0.1, forward({ jump: true }));
    walkFor(walker, 1, forward());
    const [, y, z] = walker.feet();
    expect(z).toBeLessThan(13);
    expect(near(y, 2.02, 0.05)).toBe(true);
  });

  it('pushes the loose crate, which moves; the still boulder doesn’t', () => {
    const { walker, groundAt } = trail();
    const before = walker.moving().find((m) => m.path === 'loose-crate')?.at as Vec3;
    expect(before).toBeDefined();
    walker.teleport([-4, groundAt(-4, 7), 7]);
    walkFor(walker, 3, forward());
    const after = walker.moving().find((m) => m.path === 'loose-crate')?.at as Vec3;
    expect(before[2] - after[2]).toBeGreaterThan(0.5);
    expect(walker.moving().map((m) => m.path)).toEqual(['loose-crate']);
  });

  it('walks up the path into the cairn’s zone, entered once, through its prefab', () => {
    const { space, walker } = trail();
    expect(space.parts.zones.map((z) => z.path)).toEqual(['cairn/zone']);
    let states: ReadonlyMap<string, ZoneState> = new Map();
    const sent: string[] = [];
    for (let i = 0; i < 20 * 60; i++) {
      walker.step(forward(), 0);
      const body = { feet: walker.feet(), height: BODY.height, radius: BODY.radius };
      const inside = new Set(space.parts.zones.filter((z) => inZone(z, body)).map((z) => z.path));
      const step = stepZones(states, inside);
      states = step.states;
      sent.push(...step.send);
      if (sent.length > 0 && inside.size === 0) break;
    }
    expect(sent).toEqual(['cairn/zone']);
  });

  it('puts the character back at its spawn when it falls far below the ground', () => {
    const { walker } = trail();
    walker.teleport([0, -70, 0]);
    walkFor(walker, 0.05, STILL);
    const [x, , z] = walker.feet();
    expect(near(x, 0, 1e-4) && near(z, 20, 1e-4)).toBe(true);
  });

  it('pulls the third-person camera in against the wall behind', () => {
    const { walker, groundAt } = trail();
    walker.teleport([-6.5, groundAt(-6.5, 20), 20]);
    walkFor(walker, 0.1, STILL);
    // Facing +x, the camera is behind at -x, through the wall at x -7.75.
    const shot = shotOf('third', walker.feet(), -90, -15, walker.clear);
    expect(shot.distance).toBeLessThan(1.5);
    expect(shot.distance).toBeGreaterThanOrEqual(0.6);
    const open = shotOf('third', walker.feet(), 90, -15, walker.clear);
    expect(open.distance).toBe(4);
  });
});

describe('the bothy walked', () => {
  it('starts in first person on its floor, and stops at the north wall', () => {
    const { space, walker } = trail('bothy');
    expect(spawnOf(space.parts.spawns)?.view).toBe('first');
    expect(space.ground).toBeNull();
    walkFor(walker, 0.2, STILL);
    expect(near(walker.feet()[1], 0, 0.05)).toBe(true);
    walkFor(walker, 4, forward());
    // The north wall's inner face is at z -3.
    expect(near(walker.feet()[2], -3 + BODY.radius, 0.06)).toBe(true);
  });

  it('walks its flat floor at 2.5 m/s every step, never catching on it, at any heading near north', () => {
    const caught: string[] = [];
    for (let k = 0; k <= 20; k++) {
      const yaw = -0.5 + k * 0.05;
      const { walker } = trail('bothy');
      walkFor(walker, 0.5, STILL);
      // From the door to short of the north wall, 1 m before it.
      for (let i = 0; i < 300 && walker.feet()[2] > -2; i++) {
        walker.step(forward(), yaw);
        const [vx, , vz] = walker.velocity();
        if (Math.hypot(vx, vz) < 2.4) caught.push(`yaw ${yaw.toFixed(2)} at z ${walker.feet()[2].toFixed(3)}`);
      }
      expect(walker.feet()[2]).toBeLessThanOrEqual(-2);
      walker.free();
    }
    expect(caught).toEqual([]);
  });
});
