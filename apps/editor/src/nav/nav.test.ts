/**
 * Navigation in Node (M6.2, D74): a square with stalls baked through Recast as the editor bakes it,
 * the same bytes twice, a path round a stall, and a crowd that walks twelve round each other and
 * no one into a stall. The geometry's triangles each face out of their solid.
 */
import type { NavSolid } from '@eb/compiler';
import { beforeAll, describe, expect, it } from 'vitest';
import { cross, dot, sub, type Vec3 } from '../spaces/vec.ts';
import { bakedSolids, type Soup, soupOf } from './geometry.ts';
import { bakeSoup, NPC_SPEED, openNav, readyNav } from './lib.ts';

const frame = (at: Vec3, scale: Vec3 = [1, 1, 1], turn: Vec3 = [0, 0, 0]) => ({ at, turn, scale });
const stalls: Vec3[] = [
  [-5, 0, 0],
  [0, 0, -4],
  [5, 0, 3],
];
const listed: NavSolid[] = [
  { path: 'cobbles', frames: [frame([0, -0.2, 0], [40, 0.2, 40])], shape: 'box', collider: {} },
  ...stalls.map(
    (at, i): NavSolid => ({ path: `stall-${i}`, frames: [frame(at, [3, 2, 2])], shape: 'box', collider: {} }),
  ),
];

const normals = (soup: Soup) => {
  const out: { normal: Vec3; middle: Vec3 }[] = [];
  const p = (i: number): Vec3 => [
    soup.positions[i * 3] as number,
    soup.positions[i * 3 + 1] as number,
    soup.positions[i * 3 + 2] as number,
  ];
  for (let t = 0; t < soup.indices.length; t += 3) {
    const [a, b, c] = [
      p(soup.indices[t] as number),
      p(soup.indices[t + 1] as number),
      p(soup.indices[t + 2] as number),
    ];
    out.push({
      normal: cross(sub(b, a), sub(c, a)),
      middle: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
    });
  }
  return out;
};

describe('the soup', () => {
  it('has each solid’s triangles facing out, as Recast reads its normal', () => {
    const solids = bakedSolids([
      { path: 'box', frames: [frame([0, 0, 0], [2, 2, 2], [0, 30, 0])], shape: 'box', collider: {} },
      { path: 'ball', frames: [frame([5, 0, 0])], shape: 'sphere', collider: { shape: 'sphere' } },
      { path: 'pole', frames: [frame([-5, 0, 0], [1, 3, 1])], shape: 'cylinder', collider: { shape: 'capsule' } },
    ]);
    const middles: Vec3[] = [
      [0, 1, 0],
      [5, 0.5, 0],
      [-5, 1.5, 0],
    ];
    const soup = soupOf(solids, null);
    for (const { normal, middle } of normals(soup)) {
      const nearest = middles.reduce((a, b) => (Math.hypot(...sub(middle, a)) < Math.hypot(...sub(middle, b)) ? a : b));
      expect(dot(normal, sub(middle, nearest))).toBeGreaterThan(0);
    }
    // A box's 12; a ball's 8 bands, two at its poles of 8; a capsule's 9, its straight part one more.
    expect(soup.indices.length / 3).toBe(12 + (2 * 8 + 6 * 16) + (2 * 8 + 7 * 16));
  });

  it('has the ground’s triangles facing up, the squares split as the view splits them', () => {
    const heights = new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    const soup = soupOf([], { size: 3, spacing: 2, heights, low: 0 });
    expect(soup.indices.length / 3).toBe(8);
    for (const { normal } of normals(soup)) expect(normal[1]).toBeGreaterThan(0);
    // The first square's first triangle: its (0, 0), (1, 0) and (0, 1) corners.
    expect(soup.positions.slice(0, 9)).toEqual([-2, 0, -2, -2, 1, 0, 0, 0, -2]);
  });
});

describe('the square, baked', () => {
  beforeAll(() => readyNav());

  it('bakes the same bytes twice, as one tile, and walks round a stall', () => {
    const soup = soupOf(bakedSolids(listed), null);
    const one = bakeSoup(soup);
    const two = bakeSoup(soup);
    if (!one.ok || !two.ok) throw new Error('No navmesh');
    expect(one.tiled).toBe(false);
    expect(Buffer.from(one.navmesh).equals(Buffer.from(two.navmesh))).toBe(true);
    const nav = openNav(one.navmesh);
    const corners = nav.path([-15, 0, 0], [-2, 0, 0]);
    expect(corners?.length).toBeGreaterThan(2);
    // Round the stall at x -5, not through it.
    for (const [x, , z] of corners ?? []) expect(Math.abs(x + 5) < 1.5 && Math.abs(z) < 1).toBe(false);
    expect(nav.debug().tiles).toBe(1);
    expect(nav.debug().polygons).toBeGreaterThan(0);
    expect(nav.closest([-5, 3, 0])).not.toBeNull();
    nav.free();
  });

  it('walks twelve across, round each other and no one into a stall, at no more than its speed', () => {
    const baked = bakeSoup(soupOf(bakedSolids(listed), null));
    if (!baked.ok) throw new Error(baked.why);
    const nav = openNav(baked.navmesh);
    const crowd = nav.crowd();
    const agents = Array.from({ length: 12 }, (_, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const agent = crowd.add([side * 15, 0, -9 + i * 1.5], 0.3, 1.75);
      return { agent, to: agent.walkTo([-side * 15, 0, 9 - i * 1.5]) as Vec3 };
    });
    let [gap, inside, fastest, steps] = [Infinity, 0, 0, 0];
    for (; steps < 3600; steps++) {
      crowd.step(1 / 60);
      const at = agents.map((a) => a.agent.at());
      for (let i = 0; i < at.length; i++) {
        const [x, , z] = at[i] as Vec3;
        for (let j = i + 1; j < at.length; j++)
          gap = Math.min(gap, Math.hypot(x - (at[j] as Vec3)[0], z - (at[j] as Vec3)[2]));
        for (const [sx, , sz] of stalls) if (Math.abs(x - sx) < 1.5 && Math.abs(z - sz) < 1) inside++;
        const [vx, , vz] = (agents[i] as (typeof agents)[number]).agent.velocity();
        fastest = Math.max(fastest, Math.hypot(vx, vz));
      }
      if (agents.every(({ agent, to }) => Math.hypot(agent.at()[0] - to[0], agent.at()[2] - to[2]) < 0.5)) break;
    }
    expect(steps).toBeLessThan(3600);
    expect(inside).toBe(0);
    expect(gap).toBeGreaterThan(0.25);
    expect(fastest).toBeLessThanOrEqual(NPC_SPEED + 1e-6);
    crowd.free();
    nav.free();
  });
});
