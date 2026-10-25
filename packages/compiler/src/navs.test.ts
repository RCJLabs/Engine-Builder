/**
 * Navmeshes in the compiler (M6.2, D74, docs/specs/navigation.md#the-navmesh): what a bake reads,
 * the hash a .nav file carries, its header, and a project with one packed as format 11.
 */
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile.ts';
import { NAV_HEADER, navFileBytes, navHeader, navmeshOf } from './navFiles.ts';
import { type NavModelOf, navInputsHash, navSolids } from './navInputs.ts';
import { memorySource } from './source.ts';
import type { SpaceJson } from './spaceShape.ts';

const stall: SpaceJson = {
  name: 'Stall',
  objects: [
    { id: 'counter', shape: 'box', at: [0, 0, 1], scale: [2, 1, 1], components: { collider: {} } },
    { id: 'awning', shape: 'plane', at: [0, 2, 0] },
  ],
};

const square: SpaceJson = {
  name: 'Square',
  objects: [
    { id: 'well', shape: 'cylinder', at: [0, 0, 0], components: { collider: { shape: 'capsule' } } },
    { id: 'east', prefab: 'stall', at: [8, 0, 0], turn: [0, 90, 0], overrides: { counter: { scale: [3, 1, 1] } } },
    { id: 'cart', shape: 'box', at: [4, 0, 4], components: { collider: { moves: true } } },
    { id: 'carter', record: 'actor:carter', at: [-6, 0, 0] },
    { id: 'crate', record: 'model:crate', at: [2, 0, -3] },
    { id: 'gate', shape: 'box', at: [0, 0, -10], components: { trigger: { effects: [] } } },
  ],
};

const prefabs = new Map([['stall', stall]]);

/** The crate's model has a box collider; the carter, an actor, has one too, which the bake leaves out. */
const models: NavModelOf = (key) =>
  key === 'model:crate' || key === 'actor:carter'
    ? { collider: { shape: 'box', size: [1, 1, 1], center: [0, 0.5, 0] }, scale: 2 }
    : null;

const moved = (change: (objects: SpaceJson['objects']) => SpaceJson['objects']): SpaceJson => ({
  ...square,
  objects: change(square.objects),
});

describe('navSolids', () => {
  it('finds the still solids through prefabs and overrides, each with the frames that reach it', () => {
    const solids = navSolids(square, prefabs, models);
    expect(solids.map((s) => s.path)).toEqual(['well', 'east/counter', 'crate']);
    expect(solids[1]).toEqual({
      path: 'east/counter',
      frames: [
        { at: [8, 0, 0], turn: [0, 90, 0], scale: [1, 1, 1] },
        { at: [0, 0, 1], turn: [0, 0, 0], scale: [3, 1, 1] },
      ],
      shape: 'box',
      collider: {},
    });
    expect(solids[2]).toMatchObject({ path: 'crate', scale: 2, model: { shape: 'box' } });
  });
});

describe('navInputsHash', () => {
  const hash = (space: SpaceJson, heights?: Uint8Array) => navInputsHash(space, prefabs, models, heights);

  it('changes when a solid moves, turns or is overridden, and the terrain’s heights with it', () => {
    const now = hash(square);
    expect(now).toMatch(/^[0-9a-f]{16}$/);
    expect(hash(square)).toBe(now);
    const nudged = moved((objects) => objects.map((o) => (o.id === 'well' ? { ...o, at: [0.01, 0, 0] } : o)));
    expect(hash(nudged)).not.toBe(now);
    const turned = moved((objects) => objects.map((o) => (o.id === 'east' ? { ...o, turn: [0, 0, 0] } : o)));
    expect(hash(turned)).not.toBe(now);
    const wider = moved((objects) =>
      objects.map((o) => (o.id === 'east' ? { ...o, overrides: { counter: { scale: [4, 1, 1] } } } : o)),
    );
    expect(hash(wider)).not.toBe(now);
    const ground = { size: 65, spacing: 1, low: 0, high: 10, layers: [{ name: 'Grass', color: '#7a8b5c' }] };
    const hill = { ...square, terrain: ground };
    expect(hash(hill, new Uint8Array([1, 2]))).not.toBe(hash(hill, new Uint8Array([1, 3])));
  });

  it('stays when what isn’t baked changes: an NPC, a cart that moves, a zone, a plane', () => {
    const now = hash(square);
    const walked = moved((objects) =>
      objects.map((o) => (o.id === 'carter' || o.id === 'cart' || o.id === 'gate' ? { ...o, at: [9, 9, 9] } : o)),
    );
    expect(hash(walked)).toBe(now);
    const named = moved((objects) => objects.map((o) => (o.id === 'well' ? { ...o, name: 'The well' } : o)));
    expect(hash(named)).toBe(now);
  });
});

describe('a .nav file', () => {
  it('is EBNV, its version, its hash, then Recast’s export', () => {
    const bytes = navFileBytes('0123456789abcdef', new Uint8Array([7, 8, 9]));
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('EBNV');
    expect(bytes.length).toBe(NAV_HEADER + 3);
    expect(navHeader(bytes)).toEqual({ hash: '0123456789abcdef' });
    expect([...navmeshOf(bytes)]).toEqual([7, 8, 9]);
    expect(() => navFileBytes('0123', new Uint8Array([1]))).toThrow('16 hex digits');
  });

  it('isn’t one with another magic, another version, a bad hash or nothing after its header', () => {
    const good = navFileBytes('0123456789abcdef', new Uint8Array([1]));
    const with_ = (i: number, b: number) => good.map((v, j) => (j === i ? b : v));
    expect(navHeader(with_(0, 'X'.charCodeAt(0)))).toBeNull();
    expect(navHeader(with_(4, 2))).toBeNull();
    expect(navHeader(with_(5, 'G'.charCodeAt(0)))).toBeNull();
    expect(navHeader(good.subarray(0, NAV_HEADER))).toBeNull();
  });
});

describe('a project with a navmesh', () => {
  const files = (hash: string) => ({
    'project.json': JSON.stringify({ format: 1, id: 'square', name: 'Square', version: '0.1.0', kits: ['stats'] }),
    'records/actor/carter.json': '{ "name": "Carter" }',
    'spaces/square.json': JSON.stringify({
      name: 'Square',
      objects: [
        { id: 'carter', record: 'actor:carter' },
        { id: 'well', shape: 'box', at: [3, 0, 0], components: { collider: {} } },
      ],
    }),
    'spaces/square.nav': navFileBytes(hash, new Uint8Array([1, 2, 3])),
    'records/sheet/send.json': JSON.stringify({
      rows: [{ id: 'go', when: { event: 'world/arrived' }, do: [{ effect: 'walk-to', actor: 'carter', to: 'well' }] }],
    }),
  });
  const fresh = navInputsHash(
    {
      name: 'Square',
      objects: [
        { id: 'carter', record: 'actor:carter' },
        { id: 'well', shape: 'box', at: [3, 0, 0], components: { collider: {} } },
      ],
    },
    new Map(),
    () => null,
    undefined,
  );

  it('compiles clean while its navmesh is fresh, as format 11 with the navmesh and the actor’s place', async () => {
    const compiled = await compileProject(memorySource(files(fresh)), []);
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.pack?.format).toBe(11);
    expect(compiled.pack?.world?.actors).toEqual({ carter: { space: 'square', path: 'carter' } });
    const packed = compiled.pack?.world?.navmeshes?.square ?? '';
    expect(navHeader(Uint8Array.from(atob(packed), (c) => c.charCodeAt(0)))).toEqual({ hash: fresh });
  });

  it('warns once its well has moved since: W147, and still packs it', async () => {
    const stale = files(fresh);
    stale['spaces/square.json'] = stale['spaces/square.json'].replace('[3,0,0]', '[4,0,0]');
    const compiled = await compileProject(memorySource(stale), []);
    expect(compiled.diagnostics.map((d) => [d.code, d.file])).toEqual([['W147', 'spaces/square.nav']]);
    expect(compiled.pack?.format).toBe(11);
  });
});
