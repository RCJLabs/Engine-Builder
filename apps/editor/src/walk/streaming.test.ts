/**
 * The moor walked headless (M5.10, D72, docs/specs/streaming.md#the-gate): its pack built from the
 * fixture, its space read as the page reads it, and Rapier stepping the character with the walk's
 * rings worked out after each step, as the stage does: along the road to the cairn and the chest,
 * and carried corner to corner across the whole moor.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import RAPIER from '@dimforge/rapier3d-compat';
import { compileWithGame, memorySource } from '@eb/compiler';
import type { PackWorld } from '@eb/core';
import { beforeAll, describe, expect, it } from 'vitest';
import { apart, cellOf, cellsOf, KEPT, NEAR } from './cells.ts';
import type { Intent } from './controls.ts';
import { facing } from './interact.ts';
import { createWalker, topOf, type Walker } from './physics.ts';
import { spawnOf } from './solids.ts';
import { applyRing, createStreamer, type Ring } from './streamer.ts';
import { type WalkSpace, walkSpace } from './world.ts';
import { inZone } from './zones.ts';

const MOOR = join(import.meta.dirname, '../../../../tools/cli/test/fixtures/moor');

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
let moor: WalkSpace;
beforeAll(async () => {
  await RAPIER.init();
  const compiled = await compileWithGame(memorySource(filesOf(MOOR)));
  if (!compiled.pack?.world) throw new Error('The moor has no world');
  world = compiled.pack.world;
  moor = walkSpace(world, 'moor') as WalkSpace;
}, 60_000);

const STILL: Intent = { move: [0, 0], run: false, jump: false, use: false, attack: false, look: [0, 0] };
const VIEW = 250;

/** The moor as the stage starts it: the ring around the spawn built first, its solids in the walker. */
function start() {
  const streamer = createStreamer(moor.parts, moor.streamed.footprints, VIEW);
  const spawn = spawnOf(moor.parts.spawns);
  const at = spawn?.at ?? [0, 0, 0];
  const first = streamer.at(at[0], at[2], new Set()) as Ring;
  const walker = createWalker(RAPIER, { solids: first.solids, spawn }, moor.ground);
  let ring = first;
  const step = (intent: Intent, yaw: number) => {
    walker.step(intent, yaw);
    const [x, , z] = walker.feet();
    const next = streamer.at(x, z, new Set());
    if (next) {
      applyRing(walker, next);
      ring = next;
    }
  };
  return { walker, streamer, first, step, ring: () => ring };
}

const solidsNear = (near: ReadonlySet<string>) => moor.parts.solids.filter((s) => near.has(topOf(s.path))).length;

/** What the spec asks of every ring: all of the 3×3 built, nothing built past the 5×5, and bodies only for what is built. */
function holds(ring: Ring, walker: Walker) {
  const here = ring.cell;
  for (const f of moor.streamed.footprints) {
    const closest = Math.min(...cellsOf(f).map((c) => apart(c, here)));
    if (closest <= NEAR) expect(ring.near.has(f.id), `${f.id} near`).toBe(true);
    if (closest > KEPT) expect(ring.near.has(f.id), `${f.id} past the kept ring`).toBe(false);
  }
  expect(walker.bodies()).toBe(solidsNear(ring.near));
}

describe('the moor', () => {
  it('is a kilometre across with over a thousand objects, and the start builds only the ring around the spawn', () => {
    expect(moor.space.terrain?.size).toBe(257);
    expect(moor.space.objects.length).toBeGreaterThan(1000);
    const { walker, first } = start();
    holds(first, walker);
    expect(first.cell).toEqual(cellOf(32, 40));
    expect(first.near.size).toBeLessThan(moor.space.objects.length / 10);
    expect(walker.bodies()).toBeLessThan(moor.parts.solids.length / 10);
    // The cairn stands two cells north: its zone isn't heard yet; the far ones are drawn.
    expect(first.zones.map((z) => z.path)).toEqual([]);
    expect(first.far.length).toBeGreaterThan(first.near.size);
  });

  it('walks the road north to the cairn, each crossing building the next ring, the ground under it every step', () => {
    const { walker, step, ring, first } = start();
    for (let i = 0; i < 30; i++) step(STILL, 0);
    const cells = [first.cell];
    let heard: number | null = null;
    let entered: number | null = null;
    for (let i = 0; i < 60 * 40 && walker.feet()[2] > -126; i++) {
      step({ ...STILL, move: [0, 1], run: true }, 0);
      const now = ring();
      if (now.cell !== cells[cells.length - 1]) {
        cells.push(now.cell);
        holds(now, walker);
      }
      const zone = now.zones.find((z) => z.path === 'cairn-zone');
      const [x, y, z] = walker.feet();
      if (heard === null && zone) heard = z;
      if (entered === null && zone && inZone(zone, { feet: [x, y, z], height: 1.8, radius: 0.35 })) entered = z;
      expect(walker.grounded() || i < 5, `on the ground at z ${z.toFixed(1)}`).toBe(true);
    }
    // Two cells crossed: at z 0 and at z −64.
    expect(cells.map((c) => c[1])).toEqual([0, -1, -2]);
    // The cairn's cell came near as the walk crossed into the cell before it, at z 0, 118 m short of it.
    expect(heard).toBeGreaterThan(-0.5);
    expect(heard).toBeLessThan(0);
    expect(entered).toBeLessThan(-115);
    expect(walker.feet()[2]).toBeLessThan(-125);
  });

  it('offers the chest once it is built, and not before', () => {
    const { walker, step, ring, first } = start();
    expect(first.uses.map((u) => u.path)).toEqual([]);
    for (let i = 0; i < 60 * 40 && walker.feet()[2] > -126.5; i++) step({ ...STILL, move: [0, 1], run: true }, 0);
    for (let i = 0; i < 30; i++) step(STILL, 0);
    expect(ring().uses.map((u) => u.path)).toEqual(['chest']);
    expect(facing(ring().uses, walker.feet(), 0, new Set())?.path).toBe('chest');
  });

  it('carried corner to corner, holds every ring to the spec, and never builds more than a ring holds', () => {
    const { walker, streamer } = start();
    let most = 0;
    for (const [from, to] of [
      [
        [-480, -480],
        [480, 480],
      ],
      [
        [480, -480],
        [-480, 480],
      ],
    ] as const) {
      const steps = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 4);
      for (let i = 0; i <= steps; i++) {
        const [x, z] = [from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps];
        walker.teleport([x, 200, z]);
        const next = streamer.at(x, z, new Set());
        if (!next) continue;
        applyRing(walker, next);
        holds(next, walker);
        most = Math.max(most, next.near.size);
      }
    }
    // A ring is at most the 5×5 kept: never the moor.
    expect(most).toBeLessThan(moor.space.objects.length / 4);
  });
});
