/**
 * Kaldvík walked headless (proof #2's gate, M6.10, D82, docs/specs/kaldvik.md#the-gate): its pack
 * played through the session, each space's navmesh opened through Recast in Node and its bodies cast
 * through Rapier, as the page does. The five townsfolk walk to their day's, evening's and night's
 * places in their own spaces as the clock is waited on; the stranger fights Hallkel and his two in
 * the howe until all three lie, takes the key from Hallkel's body and the silver from the chest; and
 * Halvard, struck down on the shore's terrain, lies with his body out of the way and gets up again.
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
import { RISE_S } from './knocked.ts';
import { STEP } from './motion.ts';
import { npcsOf } from './navStage.ts';
import { npcsAt } from './npcTell.ts';
import type { Outbox } from './outbox.ts';
import { createWalker } from './physics.ts';
import { walkSpace } from './world.ts';

const KALDVIK = join(import.meta.dirname, '../../../../games/kaldvik');

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
  const compiled = await compileWithGame(memorySource(filesOf(KALDVIK)));
  expect(compiled.diagnostics).toEqual([]);
  const open = openPack(JSON.parse(JSON.stringify(compiled.pack)));
  if (!open.ok) throw new Error(open.message);
  opened = open.opened;
  if (!compiled.pack?.world) throw new Error('Kaldvík has no world');
  world = compiled.pack.world;
}, 60_000);

const across = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
/** A fact of the game as it stands: the view holds only those the screens read. */
const fact = (play: ReturnType<typeof startPlay>, id: string, args: Readonly<Record<string, unknown>>) =>
  opened.setup.game.fact(play.state, id, args, opened.setup.sim);
const settled = async () => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

/**
 * One space of Kaldvík walked: the session, its navmesh and crowd, Rapier with its terrain, and the
 * stage's fight, every step the stage sends going straight to the sim. `at`, where the stranger stands.
 * With `lag`, the fight's letters wait and the sim answers one every `lag` fixed steps, as a slow
 * device's does: 60, one a second, about what CI's software renderer gave (M7.3).
 */
function walked(spaceId: string, at: Vec3, play = startPlay(opened.setup, 'kaldvik'), lag = 0) {
  const space = walkSpace(world, spaceId);
  if (!space) throw new Error(`No space ${spaceId}`);
  const sent: { action: Action; accepted: boolean }[] = [];
  const act = (action: Action) => {
    const accepted = play.act(action).accepted;
    sent.push({ action, accepted });
    return accepted;
  };
  const waiting: { action: Action; done: (sent: 'accepted' | 'refused') => void }[] = [];
  const answer = (a: Action) => (act(a) ? 'accepted' : 'refused');
  const outbox: Outbox = {
    post: (a) => (lag > 0 ? new Promise((done) => waiting.push({ action: a, done })) : Promise.resolve(answer(a))),
    pump() {},
    close() {},
    size: 0,
  };
  let ticks = 0;
  const pump = () => {
    const letter = lag > 0 && ++ticks % lag === 0 ? waiting.shift() : undefined;
    letter?.done(answer(letter.action));
  };
  const nav = openNav(navmeshOf(Uint8Array.from(atob(world.navmeshes?.[spaceId] ?? ''), (c) => c.charCodeAt(0))));
  const places = objectPlaces(space.space, space.prefabs);
  const npcs = npcsOf(space, world, places);
  const walker = createWalker(RAPIER, { solids: space.parts.solids, spawn: undefined, at }, space.ground);
  let fight: ReturnType<typeof createFight> = null;
  const keep = (actor: string) => fight?.keep(actor) ?? { distance: WAITING_M, away: true };
  const crowd = createCrowdWalk(
    nav,
    npcs,
    (path) => places.get(path),
    {},
    () => true,
    keep,
  );
  crowd.present(new Set(npcs.map((n) => n.path)));
  const list = (): FightNpc[] => crowd.list().map((n) => ({ ...n, height: FIGURE.height, here: n.state !== 'away' }));
  fight = createFight({ fight: () => play.view.world?.fight } as SpaceAsk, outbox, { walker, npcs: list, bodies() {} });
  const placedOf = new Map(npcs.map((n) => [n.path, n.placed]));
  const heard: string[] = [];
  const tell = () => crowd.told(play.view.world?.npcs ?? {});
  tell();
  let yaw = 0;
  /** One fixed step: the stranger walked toward `to` (or still), the crowd, the fight, the arrivals said. */
  const step = (attack: boolean, to?: Vec3, most = 1.4) => {
    const was = walker.feet();
    if (to) yaw = yawToward(was, to);
    const far = to !== undefined && across(was, to) > most;
    walker.step({ move: [0, far ? 1 : 0], run: false, jump: false, use: false, attack, look: [0, 0] }, yaw);
    const feet = walker.feet();
    crowd.present(new Set(npcs.map((n) => n.path)));
    crowd.step(STEP, feet);
    for (const n of crowd.list()) {
      const placed = placedOf.get(n.path);
      if (placed && n.state !== 'away' && n.state !== 'down') walker.npcAt(n.path, sub(n.at, placed));
    }
    yaw = fight?.step(attack, feet, yaw) ?? yaw;
    pump();
    if (crowd.arrivals().size > 0 && act(npcsAt(spaceId, crowd.list(), crowd.arrivals()) as unknown as Action)) {
      for (const [actor, goal] of crowd.arrivals()) {
        heard.push(`${actor} ${goal}`);
        crowd.heard(actor, goal);
      }
    }
    tell();
  };
  const free = () => {
    crowd.free();
    nav.free();
    walker.free();
  };
  return { play, act, sent, step, tell, heard, crowd, walker, fight, free, waiting };
}

describe('Kaldvík walked', () => {
  it('walks each of the five to their day’s, evening’s and night’s places', async () => {
    const play = startPlay(opened.setup, 'kaldvik');
    // The stage walks only the space the stranger is in, so they go in to each in turn.
    const inside: Readonly<Record<string, { door: string; out: string; at: Vec3 }>> = {
      hall: { door: 'hall-door', out: 'out', at: [6, 0, 3] },
      smithy: { door: 'smithy-door', out: 'out', at: [3.5, 0, 2.5] },
    };
    let here = 'shore';
    const go = (space: string) => {
      if (here !== 'shore')
        expect(play.act({ type: 'world/use', space: here, object: inside[here]?.out }).accepted).toBe(true);
      if (space !== 'shore')
        expect(play.act({ type: 'world/use', space: 'shore', object: inside[space]?.door }).accepted).toBe(true);
      here = space;
    };
    const visit = (space: string, want: (heard: readonly string[]) => readonly string[]) => {
      go(space);
      const w = walked(space, inside[space]?.at ?? [40, 8, 40], play);
      for (let i = 0; i < 60 * 90 && want(w.heard).length > 0; i++) w.step(false);
      expect(want(w.heard), JSON.stringify(w.heard)).toEqual([]);
      w.free();
    };
    const missing =
      (...all: string[]) =>
      (heard: readonly string[]) =>
        all.filter((h) => !heard.includes(h));
    const waitTo = (clock: string) => {
      for (let i = 0; i < 24 && fact(play, 'time.clock', {}) !== clock; i++) play.act({ type: 'kaldvik/wait' });
      expect(fact(play, 'time.clock', {})).toBe(clock);
    };
    const tove =
      (...marks: string[]) =>
      (heard: readonly string[]) =>
        heard.some((h) => marks.some((m) => h === `tove ${m}`)) ? [] : [`tove ${marks.join(' or ')}`];
    const both =
      (a: (h: readonly string[]) => readonly string[], b: (h: readonly string[]) => readonly string[]) =>
      (h: readonly string[]) => [...a(h), ...b(h)];
    visit('shore', both(missing('gudrun booth', 'halvard gate'), tove('nets-a', 'nets-b')));
    visit('hall', missing('ragnhild seat'));
    visit('smithy', missing('ulf anvil-side'));
    waitTo('18:00');
    visit('smithy', missing('ulf bench-side'));
    visit('shore', missing('gudrun racks-fire', 'tove racks'));
    visit('hall', missing('ragnhild hearth-side'));
    waitTo('22:00');
    visit('hall', missing('ragnhild closet-side'));
    visit('smithy', missing('ulf bed-side'));
    visit(
      'shore',
      both(missing('gudrun tent', 'tove hut-door'), (h) =>
        h.some((x) => /^halvard wall-/.test(x)) ? [] : ['halvard wall-*'],
      ),
    );
  }, 240_000);

  /** The howe entered and its three heard, then fought, turned each step to the nearest the view has standing. */
  const fightHowe = async (lag = 0) => {
    const play = startPlay(opened.setup, 'kaldvik');
    expect(play.act({ type: 'world/use', space: 'shore', object: 'howe-door' }).accepted).toBe(true);
    const h = walked('howe', [0, 0, 4.5], play, lag);
    h.act({
      type: 'ai/sensed',
      space: 'howe',
      ms: 1000,
      npcs: { hallkel: { heard: 5 }, vigi: { heard: 5 }, orm: { heard: 5 } },
    });
    h.tell();
    const fallen = () => play.view.world?.fight?.fallen ?? [];
    let most = 0;
    for (let i = 0; i < 60 * 180 && fallen().length < 3 && play.view.modes.at(-1) === 'out'; i++) {
      const standing = h.crowd.list().filter((n) => !fallen().includes(n.actor));
      const feet = h.walker.feet();
      const nearest = standing.sort((a, b) => across(a.at, feet) - across(b.at, feet))[0];
      h.step(true, nearest?.at);
      most = Math.max(most, h.waiting.length);
      await settled();
    }
    return { play, h, fallen, most };
  };

  it('fights Hallkel and his two in the howe until all three lie, then takes the key and the silver', async () => {
    const { play, h, fallen } = await fightHowe();
    expect([...fallen()].sort()).toEqual(['hallkel', 'orm', 'vigi']);
    const health = fact(play, 'stats.current', { actor: 'stranger', stat: 'health' });
    console.info(`the howe: the stranger at ${String(health)} of 60`);
    // Hallkel's body searched for the key, then the chest opened and the silver taken.
    expect(h.act({ type: 'fighting/search', actor: 'hallkel' })).toBe(true);
    expect(h.act({ type: 'inventory/take-all' })).toBe(true);
    h.act({ type: 'inventory/close' });
    expect(h.act({ type: 'world/use', space: 'howe', object: 'chest' })).toBe(true);
    expect(h.act({ type: 'inventory/take-all' })).toBe(true);
    expect(fact(play, 'inventory.count', { item: 'hoard' })).toBe(1);
    h.free();
  }, 120_000);

  it('fights the howe as well with the sim a second behind the stage, never striking the fallen', async () => {
    // With no swing started while a hit waits, the fight keeps the sim's pace. Run ahead of its view,
    // it struck foes the sim had felled while the one standing struck freely: the stranger fell with
    // 11 blows refused and 52 letters waiting (main's CI after M7.2, and this test at 40 and 60).
    const { play, h, fallen, most } = await fightHowe(60);
    expect([...fallen()].sort()).toEqual(['hallkel', 'orm', 'vigi']);
    const blows = h.sent.filter(
      (s) => s.action.type === 'fighting/hit' && 'by' in s.action && s.action.by === 'stranger',
    );
    expect(blows.filter((s) => !s.accepted)).toEqual([]);
    expect(most).toBeLessThanOrEqual(3);
    const health = fact(play, 'stats.current', { actor: 'stranger', stat: 'health' }) as number;
    console.info(`the howe a second behind: the stranger at ${health} of 60, ${most} letters waiting at most`);
    expect(health).toBeGreaterThanOrEqual(20);
    h.free();
  }, 120_000);

  it('lays Halvard down on the terrain, out of the way, and stands him up again', async () => {
    const s = walked('shore', [-21.5, 6, 1.4]);
    const down = () => s.play.view.world?.fight?.down ?? [];
    for (let i = 0; i < 60 * 30 && !down().includes('halvard'); i++) {
      const halvard = s.crowd.list().find((n) => n.actor === 'halvard');
      s.step(true, halvard?.at);
      await settled();
    }
    expect(down()).toEqual(['halvard']);
    s.step(false);
    expect(s.crowd.list().find((n) => n.actor === 'halvard')?.state).toBe('down');
    let lying = 0;
    for (let i = 0; i < 60 * 12 && down().includes('halvard'); i++) {
      s.step(false);
      await settled();
      lying += STEP;
    }
    expect(down()).toEqual([]);
    expect(lying).toBeGreaterThan(RISE_S - 0.1);
    s.step(false);
    expect(s.crowd.list().find((n) => n.actor === 'halvard')?.state).not.toBe('down');
    expect(fact(s.play, 'stats.current', { actor: 'halvard', stat: 'health' })).toBe(
      fact(startPlay(opened.setup, 'kaldvik'), 'stats.current', { actor: 'halvard', stat: 'health' }),
    );
    s.free();
  }, 120_000);
});
