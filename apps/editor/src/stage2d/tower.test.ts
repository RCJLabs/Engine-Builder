/**
 * The tower walked headless (M7.3's gate, D85, docs/specs/rooms.md#the-gate): its pack played through the
 * session, its warden and two of the watch walked by the 2D stage's own walkers along their floors and up
 * and down the tower's stairs to the marks their behaviours send them to, the clock running on time/elapse
 * and each arrival told to the sim as the page tells it. Off a floor's foot a walker is only ever on a
 * stair; at the bell all three reach the hall, and the HUD's line on the warden follows where the sim
 * last heard them arrive.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { compileWithGame, memorySource, type SpaceJson } from '@eb/compiler';
import { type Action, floorPlaceOf, type PackBuilding, type PackWorld, roomAt } from '@eb/core';
import { type Opened, openPack, startPlay } from '@eb/ui/session';
import { beforeAll, describe, expect, it } from 'vitest';
import { npcsAt } from '../walk/npcTell.ts';
import { placesOf, sceneOf } from './scene.ts';
import { sendTo, stepWalker, type Walker, walkerOf } from './walkers.ts';

const TOWER = join(import.meta.dirname, '../../../../tools/cli/test/fixtures/tower');
const FRAME_S = 0.1;
const ELAPSE_MS = 1000;
const IN = (room: string) => `world.room(space: tower, of: wynn) == ${room}`;

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
let building: PackBuilding;
beforeAll(async () => {
  const compiled = await compileWithGame(memorySource(filesOf(TOWER)));
  if (!compiled.pack?.world?.buildings?.tower) throw new Error(JSON.stringify(compiled.diagnostics));
  const open = openPack(JSON.parse(JSON.stringify(compiled.pack)));
  if (!open.ok) throw new Error(open.message);
  opened = open.opened;
  world = compiled.pack.world;
  building = compiled.pack.world.buildings.tower;
}, 30_000);

/** Where a walker may be: at a floor's foot, or on one of the stairs between the floors it joins. */
function onFloorOrStair([x, y]: readonly [number, number]): boolean {
  const [left, foot] = building.at;
  const h = building.slot[1];
  if ((y - foot) % h === 0) return true;
  const below = Math.floor((y - foot) / h);
  return building.stairs.some(([floor, sx]) => floor === below && left + sx === x);
}

function tower() {
  const space = world.spaces.tower as SpaceJson;
  const record = (key: string) => world.records[key];
  const play = startPlay(opened.setup, 'tower');
  const take = (action: Action) => {
    const done = play.act(action);
    if (!done.accepted) throw new Error(`${JSON.stringify(action)}: ${JSON.stringify(done.beats)}`);
    return done;
  };
  const places = placesOf(space, world.prefabs);
  const walkers = new Map<string, Walker>();
  for (const item of sceneOf(space, world.prefabs, record)) {
    if (item.actor === undefined) continue;
    const speed = (record(`actor:${item.actor}`) as { speed?: number }).speed;
    walkers.set(item.actor, walkerOf(item.actor, item.at, speed, undefined));
  }
  const heard: string[] = [];
  const climbed = new Set<string>();
  const strays: string[] = [];
  const arrivals = new Map<string, string>();
  const tell = () => {
    for (const [actor, walker] of walkers) sendTo(walker, play.view.world?.npcs?.[actor], places, { building });
  };
  tell();
  const frame = () => {
    for (const walker of walkers.values()) {
      const before = floorPlaceOf(building, walker.at)?.[0];
      const arrived = stepWalker(walker, FRAME_S);
      if (!onFloorOrStair(walker.at)) strays.push(`${walker.actor} at ${walker.at.join(', ')}`);
      const after = floorPlaceOf(building, walker.at)?.[0];
      if (before !== after) climbed.add(`${walker.actor} ${before} → ${after}`);
      if (arrived !== undefined) arrivals.set(walker.actor, arrived);
    }
    take({ type: 'time/elapse', ms: ELAPSE_MS });
    if (arrivals.size > 0) {
      const list = [...walkers.values()].map((w) => ({ actor: w.actor, at: [w.at[0], w.at[1], 0] as const, yaw: 90 }));
      const moved = take(npcsAt('tower', list, arrivals) as unknown as Action);
      for (const beat of moved.beats.filter((b) => b.type === 'world/npc-arrived')) {
        const { actor, at } = beat as unknown as { actor: string; at: string };
        heard.push(`${actor} ${at}`);
        if (arrivals.get(actor) === at) arrivals.delete(actor);
      }
    }
    tell();
  };
  return { play, take, frame, heard, climbed, strays, walkers };
}

describe('the tower at night', () => {
  it('walks its folk along their floors and up and down the stairs, the sim hearing each arrival', () => {
    const t = tower();
    expect(t.play.view.conditions[IN('chapel')]).toBe(true);
    const count = (said: string) => t.heard.filter((h) => h === said).length;
    // Until the warden is back in the chapel from the crypt: placed there, it is first heard there unmoved.
    for (let i = 0; i < 6000 && count('wynn chapel') < 2; i++) t.frame();
    for (const said of ['wynn crypt', 'wynn chapel', 'edda watch-a', 'edda barracks', 'hal barracks-b', 'hal watch-b'])
      expect(count(said), said).toBeGreaterThanOrEqual(1);
    expect(t.strays).toEqual([]);
    // The warden goes from the chapel on floor 2 down to the crypt on 0 and back, a floor at a time.
    expect([...t.climbed].filter((c) => c.startsWith('wynn')).sort()).toEqual([
      'wynn 0 → 1',
      'wynn 1 → 0',
      'wynn 1 → 2',
      'wynn 2 → 1',
    ]);
  });

  it('follows the warden by world.room, and brings everyone to the hall when the bell rings', () => {
    const t = tower();
    for (let i = 0; i < 4000 && !t.heard.includes('wynn crypt'); i++) t.frame();
    expect(t.play.view.conditions[IN('crypt')]).toBe(true);
    expect(t.play.view.conditions[IN('chapel')]).toBe(false);
    const rung = t.take({ type: 'world/use', space: 'tower', object: 'bell' });
    expect(rung.beats.some((b) => b.type === 'world/used')).toBe(true);
    const all = ['wynn hall-a', 'edda hall-b', 'hal hall-c'];
    for (let i = 0; i < 4000 && !all.every((h) => t.heard.includes(h)); i++) t.frame();
    for (const said of all) expect(t.heard).toContain(said);
    for (const walker of t.walkers.values()) {
      const place = floorPlaceOf(building, walker.at);
      expect(place && roomAt(building, place), walker.actor).toBe('hall');
    }
    expect(t.strays).toEqual([]);
    expect(t.play.view.conditions[IN('hall')]).toBe(true);
  });
});
