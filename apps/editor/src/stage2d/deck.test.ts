/**
 * The boarding deck walked headless (M7.2's gate, D84, docs/specs/tilemaps.md#the-gate): its pack played
 * through the session, its two crew walked by the 2D stage's own walkers along four-way routes round
 * the ship's walls to the marks their behaviours send them to, the clock running on time/elapse and
 * each arrival told to the sim as the page tells it. Every tile a walker stands on is the one it stood
 * on or one step north, east, south or west across an open edge; after the alarm both reach the
 * airlock, and the HUD's line on the hatch turns as they do.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { compileWithGame, memorySource, type SpaceJson } from '@eb/compiler';
import { type Action, canStep, gridOf, type PackTiles, type PackWorld, SIDES, step } from '@eb/core';
import { type Opened, openPack, startPlay } from '@eb/ui/session';
import { beforeAll, describe, expect, it } from 'vitest';
import { npcsAt } from '../walk/npcTell.ts';
import { placesOf, sceneOf } from './scene.ts';
import { tileUnder } from './tilemap2d.ts';
import { sendTo, stepWalker, type Walker, walkerOf } from './walkers.ts';

const DECK = join(import.meta.dirname, '../../../../tools/cli/test/fixtures/deck');
const FRAME_S = 0.1;
const ELAPSE_MS = 1000;
const SEES = (who: string) => `world.sees(space: deck, from: ${who}, to: hatch)`;

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
let tiles: PackTiles;
beforeAll(async () => {
  const compiled = await compileWithGame(memorySource(filesOf(DECK)));
  if (!compiled.pack?.world?.tiles?.deck) throw new Error(JSON.stringify(compiled.diagnostics));
  const open = openPack(JSON.parse(JSON.stringify(compiled.pack)));
  if (!open.ok) throw new Error(open.message);
  opened = open.opened;
  world = compiled.pack.world;
  tiles = compiled.pack.world.tiles.deck;
}, 30_000);

/** A step from one tile to the next is none at all, or one of the four across an edge a walker passes. */
function stepped(from: readonly [number, number], to: readonly [number, number]): boolean {
  if (from[0] === to[0] && from[1] === to[1]) return true;
  const side = SIDES.find((s) => step(from, s).join() === to.join());
  return side !== undefined && canStep(gridOf(tiles), from, side);
}

function deck() {
  const space = world.spaces.deck as SpaceJson;
  const record = (key: string) => world.records[key];
  const play = startPlay(opened.setup, 'deck');
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
  const routes: (readonly (readonly [number, number])[])[] = [];
  const strays: string[] = [];
  const arrivals = new Map<string, string>();
  const tell = () => {
    for (const [actor, walker] of walkers) {
      const before = walker.route;
      sendTo(walker, play.view.world?.npcs?.[actor], places, { tiles });
      if (walker.route && walker.route !== before) routes.push(walker.route);
    }
  };
  tell();
  const frame = () => {
    for (const walker of walkers.values()) {
      const from = tileUnder(tiles, walker.at);
      const arrived = stepWalker(walker, FRAME_S);
      const to = tileUnder(tiles, walker.at);
      if (!from || !to || !stepped(from, to)) strays.push(`${walker.actor} ${from} → ${to}`);
      if (arrived !== undefined) arrivals.set(walker.actor, arrived);
    }
    take({ type: 'time/elapse', ms: ELAPSE_MS });
    if (arrivals.size > 0) {
      const list = [...walkers.values()].map((w) => ({ actor: w.actor, at: [w.at[0], w.at[1], 0] as const, yaw: 90 }));
      const moved = take(npcsAt('deck', list, arrivals) as unknown as Action);
      for (const beat of moved.beats.filter((b) => b.type === 'world/npc-arrived')) {
        const { actor, at } = beat as unknown as { actor: string; at: string };
        heard.push(`${actor} ${at}`);
        if (arrivals.get(actor) === at) arrivals.delete(actor);
      }
    }
    tell();
  };
  return { play, take, frame, heard, routes, strays, walkers };
}

describe('the deck on a shift', () => {
  it('walks both crew round the ship’s walls on four-way routes, the sim hearing each arrival', () => {
    const d = deck();
    for (let i = 0; i < 3000 && d.heard.length < 8; i++) d.frame();
    const count = (said: string) => d.heard.filter((h) => h === said).length;
    for (const said of ['ines bridge', 'ines engines', 'oren quarters', 'oren hold'])
      expect(count(said), said).toBeGreaterThanOrEqual(1);
    // Every route is steps of one tile across open edges and doors, and every frame kept to them.
    expect(d.routes.length).toBeGreaterThanOrEqual(4);
    for (const route of d.routes)
      for (let i = 1; i < route.length; i++) expect(stepped(route[i - 1] as never, route[i] as never)).toBe(true);
    expect(d.strays).toEqual([]);
    // The bridge to the engines crosses the ship through its doors: never shorter than the straight line.
    const across = d.routes.find((r) => r[0]?.join() === '9,1' && r.at(-1)?.join() === '2,1');
    expect(across?.length).toBeGreaterThan(8);
  });

  it('sends both to the airlock when the alarm sounds, and the HUD sees the hatch as they reach it', () => {
    const d = deck();
    // From the bridge and the quarters, neither sees the hatch through the walls.
    expect(d.play.view.conditions[SEES('ines')]).toBe(false);
    expect(d.play.view.conditions[SEES('oren')]).toBe(false);
    const sounded = d.take({ type: 'world/use', space: 'deck', object: 'alarm' });
    expect(sounded.beats.some((b) => b.type === 'world/used')).toBe(true);
    for (let i = 0; i < 3000 && !(d.heard.includes('ines airlock-1') && d.heard.includes('oren airlock-2')); i++)
      d.frame();
    expect(d.heard).toContain('ines airlock-1');
    expect(d.heard).toContain('oren airlock-2');
    expect(tileUnder(tiles, d.walkers.get('ines')?.at ?? [0, 0])).toEqual([5, 3]);
    expect(tileUnder(tiles, d.walkers.get('oren')?.at ?? [0, 0])).toEqual([6, 3]);
    expect(d.strays).toEqual([]);
    expect(d.play.view.conditions[SEES('ines')]).toBe(true);
    expect(d.play.view.conditions[SEES('oren')]).toBe(true);
  });
});
