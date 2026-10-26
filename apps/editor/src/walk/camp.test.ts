/**
 * The camp fought headless (M6.4's gate, D76, docs/specs/combat.md#the-gate): its pack played through
 * the session, its navmesh opened through Recast in Node and its bodies and blows cast through
 * Rapier, by the stage's own fight.ts on the walk's fixed steps. A player who keeps turning to the
 * nearest bandit and swinging fights all three: Rook and Crow close and strike while Wren waits its
 * turn at 5 m, then shoots once it is engaged; each falls and each body is searched. A player who
 * stands still falls. And the hero's own arrows fly under gravity to the nearest.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import RAPIER from '@dimforge/rapier3d-compat';
import { compileWithGame, memorySource, navmeshOf } from '@eb/compiler';
import type { Action, PackWorld } from '@eb/core';
import type { SpaceAsk } from '@eb/ui';
import { type Opened, openPack, startPlay } from '@eb/ui/session';
import { beforeAll, describe, expect, it } from 'vitest';
import { openNav, readyNav } from '../nav/lib.ts';
import { FIGURE } from '../spaces/figureLook.ts';
import { sub, type Vec3 } from '../spaces/vec.ts';
import { createCrowdWalk } from './crowdWalk.ts';
import { yawToward } from './facing.ts';
import { createFight, type FightNpc, WAITING_M } from './fight.ts';
import { objectPlaces } from './goals.ts';
import { STEP } from './motion.ts';
import { npcsOf } from './navStage.ts';
import type { Outbox } from './outbox.ts';
import { createWalker } from './physics.ts';
import type { UsePoint } from './solids.ts';
import { walkSpace } from './world.ts';

const CAMP = join(import.meta.dirname, '../../../../tools/cli/test/fixtures/camp');
const BANDITS = ['rook', 'crow', 'wren'];

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
  const compiled = await compileWithGame(memorySource(filesOf(CAMP)));
  const open = openPack(JSON.parse(JSON.stringify(compiled.pack)));
  if (!open.ok) throw new Error(open.message);
  opened = open.opened;
  if (!compiled.pack?.world) throw new Error('The camp has no world');
  world = compiled.pack.world;
}, 30_000);

const across = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
/** What the steps posted lands, and what follows from it (an arrow loosed once its shot is taken). */
const settled = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

/** The camp walked with the hero standing at `at`; every step the stage sends goes straight to the sim. */
function camp(at: Vec3) {
  const space = walkSpace(world, 'camp');
  if (!space) throw new Error('No space camp');
  const play = startPlay(opened.setup, 'camp');
  const sent: { action: Action; accepted: boolean }[] = [];
  const act = (action: Action) => {
    const accepted = play.act(action).accepted;
    sent.push({ action, accepted });
    return accepted;
  };
  const outbox: Outbox = {
    post: (action) => Promise.resolve(act(action) ? 'accepted' : 'refused'),
    pump() {},
    close() {},
    size: 0,
  };
  const nav = openNav(navmeshOf(Uint8Array.from(atob(world.navmeshes?.camp ?? ''), (c) => c.charCodeAt(0))));
  const places = objectPlaces(space.space, space.prefabs);
  const npcs = npcsOf(space, world, places);
  const walker = createWalker(RAPIER, { solids: space.parts.solids, spawn: space.parts.spawns[0], at }, null);
  let fight: ReturnType<typeof createFight> = null;
  const crowd = createCrowdWalk(
    nav,
    npcs,
    (path) => places.get(path),
    {},
    () => true,
    (actor) => fight?.keep(actor) ?? { distance: WAITING_M, away: true },
  );
  crowd.present(new Set(npcs.map((n) => n.path)));
  let bodies: readonly UsePoint[] = [];
  const ask = { fight: () => play.view.world?.fight } as SpaceAsk;
  const list = (): FightNpc[] => crowd.list().map((n) => ({ ...n, height: FIGURE.height, here: n.state !== 'away' }));
  fight = createFight(ask, outbox, {
    walker,
    npcs: list,
    pose: () => {},
    bodies: (uses) => {
      bodies = uses;
    },
  });
  if (!fight) throw new Error('The camp has no fights');
  const placedOf = new Map(npcs.map((n) => [n.path, n.placed]));
  let yaw = 0;
  /**
   * One fixed step, as the stage takes it: the character, and Rapier's world with it; the crowd and
   * the bodies; the fight; and what the sim now says of the NPCs. `close` walks the player up to the
   * nearest bandit standing, turned to it, as one would with the stick and the mouse.
   */
  const step = (attack: boolean, close = true, most = 1.5) => {
    const was = walker.feet();
    const standing = list().filter((n) => !play.view.world?.fight?.fallen.includes(n.actor));
    // Those striking them first, as a player would turn to them; any standing when none is.
    const engaged = standing.filter((n) => play.view.world?.fight?.engaged.includes(n.actor));
    const nearest = (engaged.length > 0 ? engaged : standing).sort((a, b) => across(a.at, was) - across(b.at, was))[0];
    if (close && nearest) yaw = yawToward(was, nearest.at);
    const far = close && nearest !== undefined && across(nearest.at, was) > most;
    walker.step({ move: [0, far ? 1 : 0], run: false, jump: false, use: false, attack, look: [0, 0] }, yaw);
    const feet = walker.feet();
    crowd.step(STEP, feet);
    for (const n of crowd.list()) {
      const placed = placedOf.get(n.path);
      if (placed && n.state !== 'away' && n.state !== 'down') walker.npcAt(n.path, sub(n.at, placed));
    }
    yaw = fight?.step(attack, feet, yaw) ?? yaw;
    fight?.frame();
    crowd.told(play.view.world?.npcs ?? {});
  };
  const alert = (...actors: string[]) => {
    const npcsHeard = Object.fromEntries(actors.map((actor) => [actor, { heard: 5 }]));
    act({ type: 'ai/sensed', space: 'camp', ms: 1000, npcs: npcsHeard });
    crowd.told(play.view.world?.npcs ?? {});
  };
  const fallen = () => play.view.world?.fight?.fallen ?? [];
  const hits = (by: string) =>
    sent.filter((s) => s.accepted && s.action.type === 'fighting/hit' && s.action.by === by).map((s) => s.action);
  const free = () => {
    crowd.free();
    nav.free();
    walker.free();
  };
  return { play, act, step, alert, fallen, hits, sent, crowd, bodies: () => bodies, free, walker };
}

describe('the camp fought', () => {
  it('fights all three: two strike while the third waits, each falls and each body is searched', async () => {
    const c = camp([-2, 0, -1]);
    // The first blow alerts Rook; the noise of it, Crow and Wren.
    for (let i = 0; i < 120 && c.hits('hero').length === 0; i++) {
      c.step(true);
      await settled();
    }
    expect(c.hits('hero')[0]).toMatchObject({ on: 'rook', weapon: 'sword' });
    c.alert('crow', 'wren');
    expect(c.play.view.world?.fight?.engaged).toEqual(['crow', 'rook']);
    let waited = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 60 * 30 && c.fallen().length < 3; i++) {
      c.step(true);
      await settled();
      const engaged = c.play.view.world?.fight?.engaged ?? [];
      const wren = c.crowd.list().find((n) => n.actor === 'wren');
      // A second to back off from where it was alerted, and then it keeps its distance.
      const waiting = wren && !engaged.includes('wren') && !c.fallen().includes('wren');
      if (i > 60 && waiting) waited = Math.min(waited, across(wren.at, c.walker.feet()));
    }
    expect([...c.fallen()].sort()).toEqual([...BANDITS].sort());
    expect(c.play.view.modes.at(-1)).toBe('out');
    // Rook and Crow struck the hero; Wren held off at about 5 m until its turn, and then shot.
    expect(c.hits('rook').length + c.hits('crow').length).toBeGreaterThan(0);
    expect(waited).toBeGreaterThan(WAITING_M - 1.5);
    expect(c.sent.some((s) => s.action.by === 'wren' && s.action.type === 'fighting/hit' && !s.accepted)).toBe(false);
    // Each body lies where it fell, with a Search use; Rook's purse and coin come to the party.
    expect(c.bodies().map((b) => b.label)).toEqual(['Search', 'Search', 'Search']);
    for (const body of c.bodies()) if (body.send) c.act(body.send);
    expect(c.play.view.facts['inventory.count(item: coin)']).toBe(5);
    c.step(false);
    expect(c.bodies().map((b) => b.label)).toEqual(['Nothing left', 'Nothing left', 'Nothing left']);
    console.info(
      `the camp: ${c.hits('hero').length} blows by the hero, ${c.hits('rook').length + c.hits('crow').length} by Rook and Crow, ${c.hits('wren').length} arrows by Wren, the hero at ${String(c.play.view.facts['stats.current(actor: hero, stat: health)'])}`,
    );
    c.free();
  }, 60_000);

  it('lets a hero who stands still fall, and the game stops', async () => {
    const c = camp([0, 0, -1]);
    c.alert('rook', 'crow', 'wren');
    for (let i = 0; i < 60 * 60 && c.play.view.modes.at(-1) !== 'fallen'; i++) {
      c.step(false, false);
      await settled();
    }
    expect(c.play.view.modes.at(-1)).toBe('fallen');
    expect(c.play.view.offered).toEqual([]);
    // Only the two engaged ever struck: every hit by an NPC the sim took.
    expect(c.sent.filter((s) => s.action.type === 'fighting/hit' && !s.accepted)).toEqual([]);
    c.free();
  }, 60_000);

  it('shoots the hero’s arrows under gravity, an arrow taken for each', async () => {
    const c = camp([0, 0, 2]);
    expect(c.act({ type: 'camp/bow' })).toBe(true);
    // Turned to the nearest and shooting from where they stand, 30 m being the bow's range.
    for (let i = 0; i < 60 * 4 && c.hits('hero').length === 0; i++) {
      c.step(true, true, 30);
      await settled();
    }
    const loosed = c.sent.filter((s) => s.action.type === 'fighting/loosed' && s.accepted);
    expect(loosed.length).toBeGreaterThan(0);
    expect(c.hits('hero')[0]).toMatchObject({ weapon: 'bow' });
    expect(c.play.view.facts['inventory.count(item: arrow)']).toBe(10 - loosed.length);
    c.free();
  }, 60_000);
});
