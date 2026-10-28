/**
 * The boarders' battle drawn by the boarding deck's stage (M7.5, D87, docs/specs/tactics.md#a-stage-in-code): the
 * stage run from the pack's JavaScript on a stand-in canvas and handed a battle as the page's controller hands it.
 * Its units are Space-Wrecked's figures, the crew in their jobs' suits with their own guns and the boarders in theirs
 * (data/enemies.json), lying once down, facing the nearest foe or the way they walk; its orders are marks on the deck;
 * health, the cursor and a shot's tracer go over the board; and a tap anywhere on the board comes back as the tile
 * under it, columns left to right and rows down the screen as the board first opens, a tap on a figure as its tile.
 */
import { resolve } from 'node:path';
import { compileWithGame, flatPlacesOf, type SpaceJson } from '@eb/compiler';
import type { PackWorld } from '@eb/core';
import { loadStage } from '@eb/script/stage-load';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { folderSource } from '../src/folderSource.ts';
import { standInCanvas } from './standInCanvas.ts';

const BOARDING = resolve(import.meta.dirname, 'fixtures/boarding');
const API = { defineStage: (stage: unknown) => stage, svg: () => Promise.reject(new Error('No SVG here')) };
const [W, H, INSET] = [390, 640, 120];

type Pair = [number, number];
interface Figure {
  id: string;
  facing: number[];
  look?: { suit: string; build: string; helmet: string };
  held?: { length: number };
  colors: { suit: string };
  pose: { aim?: number; stride?: number | null; fall?: number };
}
interface Stage {
  start(s: unknown): void;
  frame(g: OffscreenCanvasRenderingContext2D, f: unknown): { uses: unknown[]; picked?: Pair };
}

const drawn: string[] = [];
const Canvas = standInCanvas(drawn);
let world: PackWorld;
let compiled: Map<string, string>;

beforeAll(async () => {
  vi.stubGlobal('OffscreenCanvas', Canvas);
  const { pack } = await compileWithGame(folderSource(BOARDING));
  if (!pack?.world) throw new Error('The boarding deck does not compile');
  world = pack.world;
  compiled = new Map(Object.entries(world.stages ?? {}));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const load = <T>(file: string) => loadStage(compiled, file, API) as T;

// At their posts: Ines at the helm and Oren at the bridge door, the pirates in the airlock, the brute at its door.
const unit = (id: string, actor: string, side: string, at: Pair, hp: number, most: number, status = 'active') => ({
  ...{ id, actor, side, at, hp, most, status },
  watch: id === 'c2',
});
const UNITS = [
  unit('c1', 'ines', 'crew', [9, 1], 10, 10),
  unit('c2', 'oren', 'crew', [9, 2], 6, 8),
  unit('e1', 'pirate', 'foes', [5, 3], 7, 7),
  unit('e2', 'pirate', 'foes', [6, 3], 0, 7, 'dead'),
  unit('e3', 'brute', 'foes', [4, 3], 11, 11),
];
const battleOf = (more: Record<string, unknown> = {}) => ({
  ...{ side: 'crew', round: 1, units: UNITS, selected: 'c1', targets: ['e1'], playing: false, inset: INSET },
  reach: [
    { to: [8, 1], ap: 1 },
    { to: [7, 1], ap: 2 },
  ],
  ...more,
});

function fight() {
  const { createFight } = load<{
    createFight(
      origin: unknown,
      size: unknown,
      records: unknown,
    ): { frame(battle: unknown, still: boolean): { faces: unknown[]; figures: Figure[] } | undefined };
  }>('deck/fight');
  const { deckBoard } = load<{ deckBoard(map: unknown, tileset: unknown): { map: { origin: Pair } } }>(
    'deck/battle-map',
  );
  const space = world.spaces.deck as SpaceJson & { objects: { id: string; components?: { tilemap?: unknown } }[] };
  const tilemap = space.objects.find((o) => o.id === 'deck')?.components?.tilemap as { size: Pair };
  const { map } = deckBoard(tilemap, world.records['tileset:deck']);
  return { fight: createFight(map.origin, tilemap.size, world.records), origin: map.origin };
}

function start(): Stage {
  const space = world.spaces.deck as SpaceJson;
  const uses = Object.entries(world.uses?.deck ?? {}).map(([path, u]) => [path, { label: u.label }]);
  const stage = load<{ default: Stage }>('battle').default;
  stage.start({
    space: 'deck',
    size: space.size,
    world: {
      space,
      prefabs: world.prefabs,
      records: world.records,
      tiles: world.tiles?.deck,
      uses: Object.fromEntries(uses),
    },
    places: Object.fromEntries(flatPlacesOf(space, world.prefabs)),
    sheets: {},
  });
  return stage;
}

const frameOf = (battle: unknown, input: unknown[] = []) => ({
  ...{ t: 0, dt: 0, w: W, h: H, dpr: 1, still: false, taken: [], input, battle },
  walkers: [
    { actor: 'ines', at: [168, 72], facing: 1, moving: false },
    { actor: 'oren', at: [168, 56], facing: -1, moving: false },
  ],
});

describe('the battle’s figures and marks', () => {
  it('draw each unit in its suit with its gun, the dead lying, facing the nearest foe; nothing again unchanged', () => {
    const { fight: f, origin } = fight();
    const drew = f.frame(battleOf(), false);
    const byId = new Map(drew?.figures.map((fig) => [fig.id, fig]));
    expect([...byId.keys()]).toEqual(['c1', 'c2', 'e1', 'e2', 'e3']);
    // Ines is the pilot and carries her rifle; the pirates wear crests, the brute is heavy.
    expect(byId.get('c1')?.look).toMatchObject({ suit: 'skinsuit', helmet: 'egg' });
    expect(byId.get('c1')?.held?.length).toBe(0.42);
    expect(byId.get('e1')?.look).toMatchObject({ helmet: 'crest' });
    expect(byId.get('e3')?.look).toMatchObject({ build: 'heavy' });
    expect(byId.get('e2')?.pose.fall).toBe(1);
    // Ines faces the first pirate, the nearest foe standing: from her tile's middle to his.
    const [dx, dy] = [5 - 9, 3 - 1];
    const d = Math.hypot(dx, dy);
    expect(byId.get('c1')?.facing.map((n) => Math.round(n * 1e6))).toEqual(
      [dx / d, dy / d].map((n) => Math.round(n * 1e6)),
    );
    expect(drew?.faces.length).toBeGreaterThan(10);
    expect(origin).toHaveLength(2);
    expect(f.frame(battleOf(), false)).toBeUndefined();
    // Gone with the battle, then nothing more to change.
    expect(f.frame(undefined, false)).toEqual({ faces: [], figures: [] });
    expect(f.frame(undefined, false)).toBeUndefined();
  });

  it('walk a unit between tiles striding and facing its way, and show a shot: the shooter aiming, a hit flashing', () => {
    const { fight: f } = fight();
    f.frame(battleOf(), false);
    const walking = UNITS.map((u) => (u.id === 'c1' ? { ...u, at: [8.5, 1] } : u));
    const step = f.frame(battleOf({ units: walking, playing: true }), false);
    const ines = step?.figures.find((fig) => fig.id === 'c1');
    expect(ines?.facing).toEqual([-1, 0]);
    expect(ines?.pose.stride).toBeCloseTo(0.25);
    const shot = f.frame(battleOf({ units: walking, shot: { from: 'c2', to: 'e1', hit: true } }), true);
    expect(shot?.figures.find((fig) => fig.id === 'c2')?.pose.aim).toBe(1);
    expect(shot?.figures.find((fig) => fig.id === 'e1')?.colors.suit).toBe('#fff1b8');
  });
});

describe('the walkers beside a battle', () => {
  it('are those whose actors the battle doesn’t draw as its units, all of them with no battle', () => {
    const { walkersBeside } = load<{ walkersBeside(w: unknown[], b: unknown): { actor: string }[] }>('deck/fight');
    const walkers = [{ actor: 'ines' }, { actor: 'oren' }, { actor: 'cook' }];
    expect(walkersBeside(walkers, battleOf()).map((w) => w.actor)).toEqual(['cook']);
    expect(walkersBeside(walkers, undefined).map((w) => w.actor)).toEqual(['ines', 'oren', 'cook']);
  });
});

describe('the battle on the stage', () => {
  it('draws health over the units, the cursor and a tracer, only with a battle', () => {
    const stage = start();
    const g = new Canvas(W, H).getContext();
    const calls = (battle: unknown) => {
      drawn.length = 0;
      stage.frame(g, frameOf(battle));
      return [...drawn];
    };
    const quiet = calls(undefined);
    expect(quiet).not.toContain('fillStyle=#5fd38d');
    const fought = calls(battleOf({ cursor: [8, 1], shot: { from: 'c1', to: 'e1', hit: false } }));
    // The crew's bars in green, the boarders' in red, the dead pirate's not at all.
    expect(fought).toContain('fillStyle=#5fd38d');
    expect(fought).toContain('strokeStyle=#fff1b8');
    expect(fought).toContain('setLineDash');
    expect(fought.filter((c) => c === 'closePath').length).toBeGreaterThanOrEqual(1);
  });

  it('gives back the tile under a tap, above the bar: columns across, rows down, a figure its own tile', () => {
    const stage = start();
    const g = new Canvas(W, H).getContext();
    // Tilted low over the deck, where a figure stands over the tile behind it.
    stage.frame(g, frameOf(battleOf(), [{ kind: 'drag', dx: 0, dy: -200 }]));
    const seen = new Map<string, Pair[]>();
    // The deck alone, no figure standing on it.
    for (let y = 4; y < H - INSET; y += 8)
      for (let x = 4; x < W; x += 8) {
        const { picked } = stage.frame(g, frameOf(battleOf({ units: [] }), [{ kind: 'tap', x, y }]));
        if (!picked) continue;
        const key = picked.join();
        seen.set(key, [...(seen.get(key) ?? []), [x, y]]);
      }
    const middle = (key: string) => {
      const points = seen.get(key) ?? [];
      return [0, 1].map((i) => points.reduce((sum, p) => sum + (p[i] as number), 0) / points.length) as Pair;
    };
    // Every tile of the map is somewhere on the board, and nothing off it.
    expect(seen.size).toBe(11 * 5);
    for (const key of seen.keys()) {
      const [c, r] = key.split(',').map(Number) as Pair;
      if (seen.has(`${c + 1},${r}`)) expect(middle(`${c + 1},${r}`)[0]).toBeGreaterThan(middle(key)[0]);
      if (seen.has(`${c},${r + 1}`)) expect(middle(`${c},${r + 1}`)[1]).toBeGreaterThan(middle(key)[1]);
    }
    // Just above Ines's tile is the deck of the tile behind it, but her figure stands there: a tap on it is hers.
    const [ix, iy] = middle('9,1');
    // Up the screen a pixel at a time from her tile's middle to where the deck becomes the tile behind it.
    const bare = (y: number) => stage.frame(g, frameOf(battleOf({ units: [] }), [{ kind: 'tap', x: ix, y }])).picked;
    let edge = iy;
    while (bare(edge - 1)?.join() === '9,1') edge--;
    const above = { kind: 'tap', x: ix, y: edge - 3 };
    expect(bare(above.y)).toEqual([9, 0]);
    expect(stage.frame(g, frameOf(battleOf(), [above])).picked).toEqual([9, 1]);
    // Sideways, where the box's height sets the fit, the whole board still stands above the bar.
    const side = start();
    const wide = new Canvas(844, 390).getContext();
    const found = new Set<string>();
    for (let y = 4; y < 390 - 150; y += 6)
      for (let x = 4; x < 844; x += 6) {
        const tapped = { ...frameOf(battleOf({ units: [], inset: 150 }), [{ kind: 'tap', x, y }]), w: 844, h: 390 };
        const picked = side.frame(wide, tapped).picked;
        if (picked) found.add(picked.join());
      }
    expect(found.size).toBe(11 * 5);
    // Without a battle a tap is the stage's own and picks nothing.
    expect(stage.frame(g, frameOf(undefined, [{ kind: 'tap', x: ix, y: iy }])).picked).toBeUndefined();
  });
});
