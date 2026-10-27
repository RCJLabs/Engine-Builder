/**
 * The boarding deck's stage (M7.4's gate, D86, docs/specs/stages.md#the-gate): Space-Wrecked's battle
 * board, ported under the fixture's stages/, checked by the stage rules as the compiler checks them and
 * run from the JavaScript the pack carries, never through TypeScript here. The port is held still: the
 * battle map built from the deck's tilemap is Space-Wrecked's own map of its example ship and gives the
 * same faces every time, held to a golden hash; its walls, doors and fittings are counted against the
 * ship's map text; and a frame is drawn on a stand-in canvas with the alarm's button placed.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { compileWithGame, flatPlacesOf, readStages, type SpaceJson } from '@eb/compiler';
import { fnv1a64, type PackWorld } from '@eb/core';
import { loadStage } from '@eb/script/stage-load';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { folderSource } from '../src/folderSource.ts';
import { standInCanvas } from './standInCanvas.ts';

const BOARDING = resolve(import.meta.dirname, 'fixtures/boarding');
const STAGES = join(BOARDING, 'stages');

// Space-Wrecked's tests/golden/example-ship.map.txt, the ship the deck's tilemap was made from.
const SHIP_MAP = ['', '', '      +=+=+=+=+=+=+', '      Ih h ./. . .I', '  +=+=+     +     +=+=+'];
SHIP_MAP.push('  I# ./. . .|. # ./. cI', '  +   +-+/+-+     +   +', '  I# ./. . ./. . .|. .I');
SHIP_MAP.push('  +/+-+/+-+/+/+/+=+   +', '  I# ./H ./a a/cI%I. cI', '  +   +=+=+o+=+=+ +=+=+');
SHIP_MAP.push('  I# .I', '  +=+=+', '', '');

// The faces and glows of the deck's battle map, as Space-Wrecked's battleScene makes them.
const GOLDEN = '216c091d776c22bd';

interface Face {
  pts: number[][];
  normal: number[];
  color: string;
}
type Skin = Record<string, string> & { floors: string[] };
interface BattleMap {
  width: number;
  roomAt: { cells: (number | null)[] };
}
type Seen = { look?: { suit: string }; facing: number[]; pose: { stride: number | null } }[] | undefined;
interface Stage {
  start(s: unknown): void;
  frame(g: OffscreenCanvasRenderingContext2D, f: unknown): { uses: { object: string; box: number[] }[] };
}

const SPACE = JSON.parse(readFileSync(join(BOARDING, 'spaces/deck.json'), 'utf8')) as {
  objects: { id: string; components?: { tilemap?: unknown } }[];
};
const TILEMAP = SPACE.objects.find((o) => o.id === 'deck')?.components?.tilemap as {
  layers: { rows: string[] }[];
  edges: string[];
};
const TILESET: unknown = JSON.parse(readFileSync(join(BOARDING, 'records/tileset/deck.json'), 'utf8'));

const API = { defineStage: (stage: unknown) => stage, svg: () => Promise.reject(new Error('No SVG here')) };
const drawn: string[] = [];
const Canvas = standInCanvas(drawn);
let compiled: Map<string, string>;
let world: PackWorld | undefined;

beforeAll(async () => {
  vi.stubGlobal('OffscreenCanvas', Canvas);
  const { pack, diagnostics } = await compileWithGame(folderSource(BOARDING));
  expect(diagnostics.filter((d) => ['E028', 'E029', 'E030', 'E095', 'W159'].includes(d.code))).toEqual([]);
  expect(pack?.format).toBe(20);
  world = pack?.world;
  compiled = new Map(Object.entries(world?.stages ?? {}));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

/** A file of the stage, loaded from the pack's JavaScript as the stage worker loads it. */
const load = <T>(file: string) => loadStage(compiled, file, API) as T;
const deckMap = () =>
  load<{
    deckMapText(map: unknown): { lines: string[]; width: number; origin: number[] };
    deckBoard(map: unknown, tileset: unknown): { map: BattleMap; skin: Skin };
    legendOf(tileset: unknown): Record<string, string>;
  }>('deck/battle-map');

/** The battle map the deck's tilemap makes, and the faces and glows Space-Wrecked's battleScene draws it with. */
function board() {
  const input = deckMap().deckBoard(TILEMAP, TILESET);
  const scene = load<{ battleScene(input: unknown): { faces: Face[]; glows: unknown[] } }>(
    'space-wrecked/render/battle-scene',
  ).battleScene(input);
  return { ...input, ...scene };
}

/** Every .ts file under stages/, as its path there without `.ts`. */
function stageFiles(dir = STAGES): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return stageFiles(path);
    return entry.name.endsWith('.ts') ? [relative(STAGES, path).slice(0, -'.ts'.length)] : [];
  });
}

/** A value's JSON with every number to 1e-6, so the hash reads the shape and not the last bits. */
const rounded = (value: unknown) =>
  JSON.stringify(value, (_key, v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 + 0 : v));

const count = (text: string, chars: string) => [...text].filter((ch) => chars.includes(ch)).length;

describe('the stage files', () => {
  it('pass the stage rules, every one, and are all packed: none left out as unreached', async () => {
    const read = await readStages(folderSource(BOARDING));
    expect(read.diagnostics).toEqual([]);
    const files = stageFiles().sort();
    expect(read.files).toEqual(files);
    for (const file of files) expect(read.checked.get(file)?.problems, file).toEqual([]);
    expect([...compiled.keys()].sort()).toEqual(files);
  });
});

describe('the battle map', () => {
  it("is Space-Wrecked's map of its example ship, read back from the deck's tilemap", () => {
    const text = deckMap().deckMapText(TILEMAP);
    expect(text.lines).toEqual(SHIP_MAP);
    expect(text.width).toBe(12);
    // The tilemap's left column is the ship's margin already; its top row is the ship's first.
    expect(text.origin).toEqual([0, -1]);
    const { renderMap } = load<{ renderMap(map: unknown, legend: unknown): string }>('space-wrecked/tools/battle-map');
    expect(renderMap(board().map, deckMap().legendOf(TILESET))).toBe(`${SHIP_MAP.join('\n')}\n`);
  });

  it('gives the same faces every time, held to a golden hash', () => {
    const [first, again] = [board(), board()];
    const hash = fnv1a64(rounded({ faces: first.faces, glows: first.glows }));
    expect(fnv1a64(rounded({ faces: again.faces, glows: again.glows }))).toBe(hash);
    expect(hash).toBe(GOLDEN);
  });

  it("stands a wall, the hull, a door or a hatch on each of the ship's edges and a fitting on each tile", () => {
    const { faces, glows, skin } = board();
    const edges = TILEMAP.edges.join('');
    const rows = TILEMAP.layers.flatMap((layer) => layer.rows).join('');
    // Each piece battleScene stands on an edge, or a fitting on a tile, has one top: a face up at
    // its height, in its color. A piece on an edge is long and thin; a post or a hull block isn't.
    const tops = (color: string | undefined, z: number, long?: boolean) =>
      faces.filter((f) => {
        if (f.color !== color || f.normal[2] !== 1 || f.pts.some((p) => Math.abs((p[2] as number) - z) > 1e-9))
          return false;
        const span = (k: number) =>
          Math.max(...f.pts.map((p) => p[k] as number)) - Math.min(...f.pts.map((p) => p[k] as number));
        return long === undefined || Math.max(span(0), span(1)) > 3 * Math.min(span(0), span(1)) === long;
      }).length;
    expect(tops(skin.wall, 0.55, true)).toBe(count(edges, '-|'));
    expect(tops(skin.hull, 0.7, true)).toBe(count(edges, '=I'));
    expect(tops(skin.doorLight, 0.46)).toBe(count(edges, '/'));
    expect(tops(skin.glassHi, 0.6)).toBe(count(edges, 'o'));
    // A docking collar outside each hatch.
    expect(tops(skin.dark, 0.54)).toBe(count(edges, 'o'));
    expect(tops(skin.metal, 0.34)).toBe(count(rows, 'h'));
    expect(tops(skin.dark, 0.84)).toBe(count(rows, 'H'));
    expect(tops(skin.metal, 0.6)).toBe(count(rows, '#'));
    expect(tops(skin.screen, 0.302)).toBe(count(rows, 'c'));
    expect(tops(skin.hazard, 0.003)).toBe(count(rows, 'a'));
    expect(tops(skin.hull, 0.7, false)).toBeGreaterThanOrEqual(count(rows, '%'));
    // Machinery, consoles and collars glow.
    expect(glows).toHaveLength(count(rows, '#c') + count(edges, 'o'));
    // The ship's, counted by hand: 6 walls, 31 hull, 14 doors, a hatch; 2 crates, a locker, 5 machines, 3 consoles.
    expect([count(edges, '-|'), count(edges, '=I'), count(edges, '/'), count(edges, 'o')]).toEqual([6, 31, 14, 1]);
    expect([count(rows, 'h'), count(rows, 'H'), count(rows, '#'), count(rows, 'c')]).toEqual([2, 1, 5, 3]);
  });

  it('tints each room its own floor: the walls and doors close rooms off from each other', () => {
    const { map, faces, skin } = board();
    const at = (x: number, y: number) => map.roomAt.cells[y * map.width + x];
    // Either side of the bridge's door, (8, 2) and (9, 2), are two rooms; the airlock's pads, one.
    expect(at(9, 2)).not.toBe(at(8, 2));
    expect(at(5, 4)).toBe(at(6, 4));
    expect(new Set(map.roomAt.cells.filter((uid) => uid !== null)).size).toBe(9);
    const floors = new Set(
      faces.filter((f) => f.normal[2] === 1 && f.pts.every((p) => p[2] === 0)).map((f) => f.color),
    );
    expect([...floors].sort()).toEqual([...skin.floors].sort());
  });
});

describe('the stage', () => {
  const start = () => {
    const space = world?.spaces.deck as SpaceJson;
    const uses = Object.entries(world?.uses?.deck ?? {}).map(([path, u]) => [path, { label: u.label }]);
    const stage = load<{ default: Stage }>('battle').default;
    stage.start({
      space: 'deck',
      size: space.size,
      world: {
        space,
        prefabs: world?.prefabs ?? {},
        records: world?.records ?? {},
        tiles: world?.tiles?.deck,
        uses: Object.fromEntries(uses),
      },
      places: Object.fromEntries(flatPlacesOf(space, world?.prefabs ?? {})),
      sheets: {},
    });
    return stage;
  };
  const frame = (input: unknown[] = [], moving = false) => ({
    ...{ t: 0, dt: 0, w: 390, h: 640, dpr: 2, still: false, taken: [], input },
    walkers: [
      { actor: 'ines', at: [184, 72], facing: 1, moving },
      { actor: 'oren', at: [104, 56], facing: -1, moving },
    ],
  });
  const context = (dpr: number) => {
    const g = new Canvas(390 * dpr, 640 * dpr).getContext();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return g;
  };

  it("draws in Space-Wrecked's palette, the crew as its figures, the alarm's button over its console", () => {
    const stage = start();
    const g = context(2);
    drawn.length = 0;
    const { uses } = stage.frame(g, frame());
    // Deep space under the board, the yard's space behind the ship, and its floors' seams.
    expect(drawn).toContain('fillStyle=#070a14');
    expect(drawn).toContain('fillStyle=#071226');
    expect(drawn).toContain('strokeStyle=#18202f');
    expect(drawn.filter((call) => call === 'fill').length).toBeGreaterThan(500);
    // Each figure drawn into a canvas of its own and outlined in Space-Wrecked's figure edge.
    expect(drawn).toContain('fillStyle=rgba(4, 8, 18, 0.95)');
    expect(uses.map((u) => u.object)).toEqual(['alarm']);
    const [x, y, w, h] = (uses[0] as { box: number[] }).box as [number, number, number, number];
    expect([x > 0, y > 0, x + w < 390, y + h < 640, w > 10, h > 10]).toEqual([true, true, true, true, true, true]);
  });

  it('turns the board by a drag, a twist and the arrow keys, and zooms by the wheel and a pinch', () => {
    const stage = start();
    const g = context(2);
    const boxOf = (input: unknown[]) => stage.frame(g, frame(input)).uses[0]?.box;
    let last = boxOf([]);
    for (const input of [
      { kind: 'drag', dx: 40, dy: 0 },
      { kind: 'drag', dx: 0, dy: 30 },
      { kind: 'twist', angle: 0.6, scale: 1 },
      { kind: 'key', key: 'ArrowLeft', down: true },
      { kind: 'key', key: 'ArrowUp', down: true },
      { kind: 'key', key: '+', down: true },
      { kind: 'wheel', dy: 200 },
      { kind: 'twist', angle: 0, scale: 0.8 },
    ]) {
      const box = boxOf([input]);
      expect(box, JSON.stringify(input)).not.toEqual(last);
      last = box;
    }
    // A key let go moves nothing.
    expect(boxOf([{ kind: 'key', key: 'ArrowLeft', down: false }])).toEqual(last);
  });

  it("walks the crew in their jobs' suits, a stride every two tiles, facing their way, standing for reduced motion", () => {
    type Crew = { frame(walkers: unknown, still: boolean): Seen };
    const { createCrew } = load<{ createCrew(toBoard: unknown, records: unknown): Crew }>('deck/crew');
    const crew = createCrew((at: number[]) => [(at[0] as number) / 16, (at[1] as number) / 16], world?.records ?? {});
    const step = (at: number[], still = false) => crew.frame([{ actor: 'ines', at, facing: 1, moving: true }], still);
    expect(step([0, 0])?.[0]?.pose.stride).toBe(0);
    const across = step([16, 0])?.[0];
    // Ines is the pilot, and Space-Wrecked's pilot wears a skinsuit.
    expect(across?.look?.suit).toBe('skinsuit');
    expect(across?.facing).toEqual([1, 0]);
    expect(across?.pose.stride).toBeCloseTo(0.5);
    expect(step([16, 16])?.[0]?.facing).toEqual([0, 1]);
    expect(step([16, 32], true)?.[0]?.pose.stride).toBeNull();
    // Nothing moved: the board keeps its last frame.
    expect(step([16, 32], true)).toBeUndefined();
    // And the whole stage, the crew walking, frame after frame.
    const stage = start();
    const g = context(1);
    for (let i = 0; i < 5; i++) {
      const f = frame([], true);
      f.walkers[0] = { actor: 'ines', at: [184 - i * 4, 72], facing: -1, moving: true };
      expect(stage.frame(g, { ...f, t: i / 10, dt: 0.1 }).uses).toHaveLength(1);
    }
  });
});
