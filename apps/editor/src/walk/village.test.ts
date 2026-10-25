/**
 * The village walked headless (M6.3's gate, D75, docs/specs/ai.md#the-gate): its pack played through
 * the session, its navmesh opened through Recast in Node and the crowd walking the smith and the
 * guard where their behaviours send them through a day (to the forge and the gate, the cottage and
 * round the walls, and back by morning), the clock running on time/elapse as they go; and the guard's
 * senses cast through Rapier against the village's solids, as the page casts them: a player behind
 * the guard unseen, before them seen, behind the wall unseen, and running near them heard.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import RAPIER from '@dimforge/rapier3d-compat';
import { compileWithGame, memorySource, navmeshOf } from '@eb/compiler';
import type { Action, PackWorld } from '@eb/core';
import { type Opened, openPack, startPlay } from '@eb/ui/session';
import { beforeAll, describe, expect, it } from 'vitest';
import { openNav, readyNav } from '../nav/lib.ts';
import type { Vec3 } from '../spaces/vec.ts';
import { createCrowdWalk } from './crowdWalk.ts';
import { objectPlaces } from './goals.ts';
import { STEP } from './motion.ts';
import { npcsOf } from './navStage.ts';
import { npcsAt } from './npcTell.ts';
import { createWalker } from './physics.ts';
import { createSenses, type Standing } from './senses.ts';
import { sensersIn } from './walkSenses.ts';
import { walkSpace } from './world.ts';

const VILLAGE = join(import.meta.dirname, '../../../../tools/cli/test/fixtures/village');
/** The player, by the green, whom the crowd goes round. */
const PLAYER: Vec3 = [0, 0, 6];

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
  await RAPIER.init();
  const compiled = await compileWithGame(memorySource(filesOf(VILLAGE)));
  const open = openPack(JSON.parse(JSON.stringify(compiled.pack)));
  if (!open.ok) throw new Error(open.message);
  opened = open.opened;
  if (!compiled.pack?.world) throw new Error('The village has no world');
  world = compiled.pack.world;
}, 30_000);

const across = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

function village() {
  const space = walkSpace(world, 'village');
  if (!space) throw new Error('No space village');
  const play = startPlay(opened.setup, 'village');
  const take = (action: Action) => {
    const step = play.act(action);
    if (!step.accepted) throw new Error(`${JSON.stringify(action)}: ${JSON.stringify(step.beats)}`);
    return step;
  };
  const nav = openNav(navmeshOf(Uint8Array.from(atob(world.navmeshes?.village ?? ''), (c) => c.charCodeAt(0))));
  const places = objectPlaces(space.space, space.prefabs);
  const npcs = npcsOf(space, world, places);
  const crowd = createCrowdWalk(nav, npcs, (path) => places.get(path), {});
  crowd.present(new Set(npcs.map((n) => n.path)));
  const heard: string[] = [];
  const tell = () => crowd.told(play.view.world?.npcs ?? {});
  tell();
  /** One fixed step, `ms` of the clock with it; the arrivals said as the page says them. */
  const step = (ms: number) => {
    crowd.step(STEP, PLAYER);
    if (ms > 0) take({ type: 'time/elapse', ms });
    if (crowd.arrivals().size > 0) {
      const moved = take(npcsAt('village', crowd.list(), crowd.arrivals()) as unknown as Action);
      for (const beat of moved.beats.filter((b) => b.type === 'world/npc-arrived')) {
        const { actor, at } = beat as unknown as { actor: string; at: string };
        heard.push(`${actor} ${at}`);
        crowd.heard(actor, at);
      }
    }
    tell();
  };
  const until = (done: () => boolean, ms = 0, most = 60 * 60) => {
    for (let i = 0; i < most && !done(); i++) step(ms);
    if (!done())
      throw new Error(
        JSON.stringify({
          heard,
          clock: play.view.facts['time.clock'],
          npcs: crowd.list().map((n) => [n.actor, n.state, n.goal, n.at.map((x) => x.toFixed(1))]),
          told: play.view.world?.npcs,
        }),
      );
  };
  const free = () => {
    crowd.free();
    nav.free();
  };
  return { play, take, crowd, tell, step, until, heard, places, space, free };
}

describe('the village walked', () => {
  it('walks the smith and the guard where their hours send them, through a day and back', () => {
    const v = village();
    const has =
      (...said: string[]) =>
      () =>
        said.every((s) => v.heard.includes(s));
    v.until(has('smith anvil', 'guard gate'));
    v.take({ type: 'village/wait' });
    v.tell();
    expect(v.play.view.facts['time.clock']).toBe('22:00');
    v.until(has('smith cottage-door', 'guard wall-ne'));
    // Five game minutes at the north-east corner, the clock running on the walk's steps, then on: the
    // clock stops once the guard is sent on, as the crowd walks at a real pace and the night is short.
    v.until(() => v.play.view.world?.npcs?.guard?.goal === 'wall-se', 2000);
    expect(v.play.view.facts['time.clock']).toBe('22:05');
    v.until(has('guard wall-se'));
    v.take({ type: 'village/wait' });
    v.tell();
    const back = v.heard.length;
    v.until(() => v.heard.slice(back).includes('smith anvil') && v.heard.slice(back).includes('guard gate'));
    expect(v.play.view.facts['ai.doing(actor: smith)']).toBe('work');
    // None of them walked into the forge, the cottage or the wall.
    const boxes = v.space.parts.solids.filter((s) => s.kind === 'box' && ['forge', 'cottage', 'wall'].includes(s.path));
    expect(boxes).toHaveLength(3);
    for (const npc of v.crowd.list())
      for (const box of boxes)
        if (box.kind === 'box')
          expect(
            Math.hypot(
              Math.max(Math.abs(npc.at[0] - box.center[0]) - box.half[0], 0),
              Math.max(Math.abs(npc.at[2] - box.center[2]) - box.half[2], 0),
            ),
          ).toBeGreaterThan(0.25);
    console.info(`the village: ${v.heard.join(', ')}`);
    v.free();
  }, 60_000);
});

describe('the guard’s senses, through Rapier', () => {
  const setup = () => {
    const space = walkSpace(world, 'village');
    if (!space) throw new Error('No space village');
    const walker = createWalker(RAPIER, { solids: space.parts.solids, spawn: space.parts.spawns[0] }, null);
    const senses = createSenses('village', sensersIn(world, space));
    return { walker, senses };
  };
  /** A second's looks and the report it ends with, the guard standing as given. */
  const second = (s: ReturnType<typeof setup>, feet: Vec3, guard: Standing) => {
    let report: Action | null = null;
    for (let i = 0; i < 50; i++) report = s.senses.frame(20, feet, () => [guard], s.walker.clear) ?? report;
    return report as Action & { npcs: Record<string, { seen?: number[]; heard?: number }> };
  };
  // At the gate, facing out (yaw 0 faces −z).
  const atGate: Standing = { path: 'guard', at: [0, 0, -14], yaw: 0 };

  it('doesn’t see a player behind them, sees one before them, and reports both to the sim', () => {
    const s = setup();
    expect(second(s, [0, 0, -9], atGate).npcs).toEqual({});
    const before = second(s, [0, 0, -19], atGate);
    expect(before.npcs.guard?.seen).toHaveLength(5);
    // The sim takes the report, the player being in the village, and the guard grows aware.
    const play = startPlay(opened.setup, 'village');
    expect(play.act(before).accepted).toBe(true);
    expect((play.state.ai as { aware: Record<string, number> }).aware.guard).toBeGreaterThan(0);
    s.walker.free();
  });

  it('doesn’t see a player behind the wall, and does beside it', () => {
    const s = setup();
    // South of the wall, facing it: the wall stands between them and the player.
    const north: Standing = { path: 'guard', at: [-6, 0, -13], yaw: 180 };
    expect(second(s, [-6, 0, -5], north).npcs).toEqual({});
    expect(second(s, [1, 0, -5], north).npcs.guard?.seen?.length).toBeGreaterThan(0);
    s.walker.free();
  });

  it('hears a player running near them, and not one running far off', () => {
    const s = setup();
    s.senses.noise('run', [0, 0, -9], () => [atGate]);
    expect(second(s, [0, 0, -9], atGate).npcs.guard?.heard).toBe(1);
    s.senses.noise('run', [0, 0, 0], () => [atGate]);
    expect(second(s, [0, 0, 0], atGate).npcs).toEqual({});
    s.walker.free();
  });

  it('places each sense at the guard’s own: 15 m, 120° and 10 m, as its record says', () => {
    const space = walkSpace(world, 'village');
    if (!space) throw new Error('No space village');
    const [guard] = sensersIn(world, space).filter((n) => n.actor === 'guard');
    expect(guard).toMatchObject({ sight: 15, cone: 120, hearing: 10 });
    expect(across(guard ? [0, 0, -14] : [0, 0, 0], atGate.at)).toBe(0);
  });
});
