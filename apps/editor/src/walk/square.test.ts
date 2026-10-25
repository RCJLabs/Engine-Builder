/**
 * The square walked headless (M6.2's gate, D74, docs/specs/navigation.md#the-gate): its pack built
 * from the fixture and played through the session, its committed navmesh opened through Recast in
 * Node, and the crowd walking the carter and the twelve villagers on the walk's fixed steps as the
 * page does. Each arrives where the sim sent it; none walks into a stall, the well or another; the
 * arrivals reach the sim as world/npc-arrived; and a fresh bake is the committed .nav byte for byte.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { compileWithGame, memorySource, navmeshOf } from '@eb/compiler';
import type { Action, PackWorld } from '@eb/core';
import { type Opened, openPack, startPlay } from '@eb/ui/session';
import { beforeAll, describe, expect, it } from 'vitest';
import { bakeProjectSpace } from '../nav/bakeProject.ts';
import { NAV_LIB, openNav, readyNav } from '../nav/lib.ts';
import type { Vec3 } from '../spaces/vec.ts';
import { createCrowdWalk } from './crowdWalk.ts';
import { objectPlaces } from './goals.ts';
import { STEP } from './motion.ts';
import { npcsOf } from './navStage.ts';
import { npcsAt } from './npcTell.ts';
import { walkSpace } from './world.ts';

const SQUARE = join(import.meta.dirname, '../../../../tools/cli/test/fixtures/square');
const VILLAGERS = ['ash', 'bea', 'cal', 'dot', 'eli', 'fen', 'gil', 'hal', 'ivy', 'jo', 'kit', 'lin'];
/** The player, standing still by the gate, whom the crowd goes round. */
const PLAYER: Vec3 = [0, 0, -14];

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

let opened: Opened;
let world: PackWorld;
beforeAll(async () => {
  await readyNav();
  const compiled = await compileWithGame(memorySource(filesOf(SQUARE)));
  const open = openPack(JSON.parse(JSON.stringify(compiled.pack)));
  if (!open.ok) throw new Error(open.message);
  opened = open.opened;
  if (!compiled.pack?.world) throw new Error('The square has no world');
  world = compiled.pack.world;
}, 30_000);

const across = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** The session and the crowd together: the sim's goals told after each step, arrivals said back. */
function square() {
  const space = walkSpace(world, 'square');
  if (!space) throw new Error('No space square');
  const play = startPlay(opened.setup, 'square');
  const take = (action: Action) => {
    // As the page sends it: a button's and the stage's, through act's guard.
    const step = play.act(action);
    if (!step.accepted) throw new Error(`${JSON.stringify(action)}: ${JSON.stringify(step.beats)}`);
    return step;
  };
  const nav = openNav(navmeshOf(Uint8Array.from(atob(world.navmeshes?.square ?? ''), (c) => c.charCodeAt(0))));
  const places = objectPlaces(space.space, space.prefabs);
  const npcs = npcsOf(space, world, places);
  const crowd = createCrowdWalk(nav, npcs, (path) => places.get(path), {});
  crowd.present(new Set(npcs.map((n) => n.path)));
  const heard: string[] = [];
  const tell = () => crowd.told(play.view.world?.npcs ?? {});
  /** One fixed step; the arrivals said as the page says them, and heard once the sim takes them. */
  const step = () => {
    crowd.step(STEP, PLAYER);
    if (crowd.arrivals().size === 0) return;
    const said = crowd.arrivals();
    const moved = take(npcsAt('square', crowd.list(), said) as unknown as Action);
    for (const beat of moved.beats.filter((b) => b.type === 'world/npc-arrived')) {
      const { actor, at } = beat as unknown as { actor: string; at: string };
      heard.push(`${actor} ${at}`);
      crowd.heard(actor, at);
    }
    tell();
  };
  const free = () => {
    crowd.free();
    nav.free();
  };
  return { play, take, crowd, tell, step, heard, places, space, free };
}

describe('the square walked', () => {
  it('walks the carter to the well and each villager across and back, round the stalls, the well and each other', () => {
    const s = square();
    s.take({ type: 'world/use', space: 'square', object: 'carter' });
    s.take({ type: 'dialogue/say', option: 'go' });
    s.take({ type: 'dialogue/go-on' });
    s.take({ type: 'world/trigger', space: 'square', object: 'market' });
    s.tell();
    const stalls = s.space.parts.solids.flatMap((solid) =>
      solid.kind === 'box' && solid.path.startsWith('stall-') ? [solid] : [],
    );
    expect(stalls).toHaveLength(3);
    const well = s.places.get('well') as Vec3;
    let closest = Infinity;
    let intoStall = Infinity;
    let intoWell = Infinity;
    let steps = 0;
    const done = () => s.heard.length >= 1 + VILLAGERS.length * 2;
    for (; steps < 60 * 120 && !done(); steps++) {
      s.step();
      const at = s.crowd.list().map((npc) => npc.at);
      for (let i = 0; i < at.length; i++) {
        const p = at[i] as Vec3;
        for (let j = i + 1; j < at.length; j++) closest = Math.min(closest, across(p, at[j] as Vec3));
        for (const box of stalls) {
          const dx = Math.max(Math.abs(p[0] - box.center[0]) - box.half[0], 0);
          const dz = Math.max(Math.abs(p[2] - box.center[2]) - box.half[2], 0);
          intoStall = Math.min(intoStall, Math.hypot(dx, dz));
        }
        intoWell = Math.min(intoWell, across(p, well) - 1);
      }
    }
    // The carter's one walk, and each villager's crossing and the walk back the sheet sent them on.
    expect(new Set(s.heard)).toEqual(
      new Set([
        'carter well',
        ...VILLAGERS.flatMap((v, i) =>
          i < 6 ? [`${v} ${v}-south`, `${v} ${v}-north`] : [`${v} ${v}-north`, `${v} ${v}-south`],
        ),
      ]),
    );
    expect(s.play.view.facts['flag.on(flag: watered)']).toBe(true);
    // Detour keeps agents their two radii apart (0.6 m measured); a stall and the well 0.35 m off by the bake.
    expect(closest).toBeGreaterThan(0.5);
    expect(intoStall).toBeGreaterThan(0.25);
    expect(intoWell).toBeGreaterThan(0.25);
    console.info(
      `the square: ${steps} steps (${(steps * STEP).toFixed(1)} s); closest ${closest.toFixed(2)} m, ` +
        `to a stall ${intoStall.toFixed(2)} m, to the well ${intoWell.toFixed(2)} m`,
    );
    s.free();
  }, 60_000);

  it('bakes the square again to the committed .nav, byte for byte', async () => {
    const files = filesOf(SQUARE);
    const baked = await bakeProjectSpace(memorySource(files), 'square', NAV_LIB);
    expect(Buffer.from(baked.bytes).equals(Buffer.from(files['spaces/square.nav'] as Uint8Array))).toBe(true);
    expect([baked.tiles, baked.polygons]).toEqual([1, 135]);
  });
});
