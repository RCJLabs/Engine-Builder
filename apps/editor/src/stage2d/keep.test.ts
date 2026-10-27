/**
 * The keep walked headless (M7.1's gate, D83, docs/specs/2d-scenes.md#the-gate): its pack played
 * through the session, its two guards walked by the 2D stage's own walkers in straight lines to the
 * marks their behaviours send them to, through a night from 21:00 to past 06:00, the clock running on
 * time/elapse and each arrival told to the sim as the page tells it; then the bell rung, as its button
 * sends it. No navmesh: a 2D space needs none.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { compileWithGame, memorySource, type SpaceJson } from '@eb/compiler';
import type { Action, PackWorld } from '@eb/core';
import { type Opened, openPack, startPlay } from '@eb/ui/session';
import { beforeAll, describe, expect, it } from 'vitest';
import { npcsAt } from '../walk/npcTell.ts';
import { placesOf, sceneOf } from './scene.ts';
import { sendTo, stepWalker, type Walker, walkerOf } from './walkers.ts';

const KEEP = join(import.meta.dirname, '../../../../tools/cli/test/fixtures/keep');
/** A frame of the stage, in seconds, and the clock's real milliseconds told with each. */
const FRAME_S = 0.1;
const ELAPSE_MS = 1000;

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
  const compiled = await compileWithGame(memorySource(filesOf(KEEP)));
  if (!compiled.pack?.world) throw new Error(JSON.stringify(compiled.diagnostics));
  const open = openPack(JSON.parse(JSON.stringify(compiled.pack)));
  if (!open.ok) throw new Error(open.message);
  opened = open.opened;
  world = compiled.pack.world;
}, 30_000);

function keep() {
  const space = world.spaces.keep as SpaceJson;
  const record = (key: string) => world.records[key];
  const play = startPlay(opened.setup, 'keep');
  const take = (action: Action) => {
    const step = play.act(action);
    if (!step.accepted) throw new Error(`${JSON.stringify(action)}: ${JSON.stringify(step.beats)}`);
    return step;
  };
  const places = placesOf(space, world.prefabs);
  const walkers = new Map<string, Walker>();
  for (const item of sceneOf(space, world.prefabs, record)) {
    if (item.actor === undefined) continue;
    const speed = (record(`actor:${item.actor}`) as { speed?: number }).speed;
    walkers.set(item.actor, walkerOf(item.actor, item.at, speed, undefined));
  }
  const heard: string[] = [];
  const arrivals = new Map<string, string>();
  const tell = () => {
    for (const [actor, walker] of walkers) sendTo(walker, play.view.world?.npcs?.[actor], places);
  };
  tell();
  const step = () => {
    for (const walker of walkers.values()) {
      const arrived = stepWalker(walker, FRAME_S);
      if (arrived !== undefined) arrivals.set(walker.actor, arrived);
    }
    take({ type: 'time/elapse', ms: ELAPSE_MS });
    if (arrivals.size > 0) {
      const list = [...walkers.values()].map((w) => ({ actor: w.actor, at: [w.at[0], w.at[1], 0] as const, yaw: 90 }));
      const moved = take(npcsAt('keep', list, arrivals) as unknown as Action);
      for (const beat of moved.beats.filter((b) => b.type === 'world/npc-arrived')) {
        const { actor, at } = beat as unknown as { actor: string; at: string };
        heard.push(`${actor} ${at}`);
        if (arrivals.get(actor) === at) arrivals.delete(actor);
      }
    }
    tell();
  };
  return { play, take, step, heard, walkers, places };
}

describe('the keep at night', () => {
  it('walks both guards between their marks through the night, the sim hearing each arrival', () => {
    const k = keep();
    expect(k.play.view.facts['time.clock']).toBe('21:00');
    const seen = new Set<string>();
    let moved = 0;
    for (let i = 0; i < 2000 && k.play.view.facts['time.clock'] !== '06:30'; i++) {
      const before = [...k.walkers.values()].map((w) => w.at.join());
      k.step();
      if ([...k.walkers.values()].some((w, n) => w.at.join() !== before[n])) moved++;
      for (const [actor, w] of k.walkers) if (w.moving) seen.add(`${actor} ${w.flip ? 'left' : 'right'}`);
    }
    expect(k.play.view.facts['time.clock']).toBe('06:30');
    const count = (said: string) => k.heard.filter((h) => h === said).length;
    // Each guard reaches each end of its stretch of wall again and again through the night.
    for (const said of ['aldo walk-w1', 'aldo walk-w2', 'brun walk-e1', 'brun walk-e2'])
      expect(count(said), said).toBeGreaterThanOrEqual(2);
    // They walk both ways, facing the way they go, and spend most of the night between marks or dwelling.
    expect([...seen].sort()).toEqual(['aldo left', 'aldo right', 'brun left', 'brun right']);
    expect(moved).toBeGreaterThan(200);
    // By day each stands at the gatehouse end of their stretch, as the sim heard and the walkers stand.
    for (let i = 0; i < 600 && k.play.view.facts['time.clock'] !== '07:30'; i++) k.step();
    expect(k.play.view.world?.npcs?.aldo?.arrived).toBe('walk-w2');
    expect(k.play.view.world?.npcs?.brun?.arrived).toBe('walk-e1');
    expect(k.walkers.get('aldo')?.at).toEqual(k.places.get('walk-w2'));
    expect(k.walkers.get('brun')?.at).toEqual(k.places.get('walk-e1'));
  });

  it('rings the bell when its use is sent, as its button sends it', () => {
    const k = keep();
    // The HUD's line on the bell, a condition its screen reads.
    expect(k.play.view.conditions['flag.on(bell-rung)']).toBe(false);
    const rung = k.take({ type: 'world/use', space: 'keep', object: 'bell' });
    expect(rung.beats.some((b) => b.type === 'world/used')).toBe(true);
    expect(k.play.view.conditions['flag.on(bell-rung)']).toBe(true);
    expect(world.uses?.keep?.bell?.label).toBe('Ring the bell');
  });
});
