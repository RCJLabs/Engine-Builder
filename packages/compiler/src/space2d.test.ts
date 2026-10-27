/**
 * A 2D space's checks (M7.1, D83, docs/specs/2d-scenes.md#a-2d-space): a sound one is clean, its
 * walker needing no navmesh; and each of E058's 2D rules broken once, on the space's own object and
 * on one a prefab places, and a sprite component's clip its sprite lacks (E091).
 */
import { describe, expect, it } from 'vitest';
import { pngOf } from '../test/png.ts';
import { compileProject } from './compile.ts';
import { memorySource } from './source.ts';

const json = (value: unknown) => JSON.stringify(value);

const SPRITE = {
  name: 'Guard',
  sheet: 'guard.png',
  frame: [16, 24],
  clips: { idle: { frames: [0, 1], fps: 2 }, walk: { frames: [2, 5], fps: 8 } },
};

const KEEP = {
  name: 'Keep',
  view: '2d',
  fit: [320, 180],
  size: [640, 180],
  backdrop: '#0b0e1a',
  objects: [
    { id: 'sky', shape: 'box', scale: [640, 180, 1], color: '#14183a', components: { parallax: { factor: [0, 0] } } },
    { id: 'wall', shape: 'box', at: [0, 0, 1], scale: [640, 48, 1], color: '#3b3a45' },
    { id: 'torch', prefab: 'torch', at: [40, 48, 2] },
    { id: 'east', shape: 'sphere', at: [600, 52, 0], scale: [2, 2, 2] },
    {
      id: 'guard',
      record: 'actor:guard',
      at: [20, 48, 3],
      components: { interact: { label: 'Hail', effects: [{ effect: 'walk-to', actor: 'guard', to: 'east' }] } },
    },
  ],
};

function project(files: Record<string, unknown>) {
  return memorySource({
    'project.json': json({ format: 1, id: 'keep', name: 'Keep', version: '0.1.0', kits: ['stats'] }),
    'assets/guard.png': pngOf(64, 48, 8, 6),
    'records/sprite/guard.json': json(SPRITE),
    'records/actor/guard.json': json({ name: 'Guard' }),
    'prefabs/torch.json': json({
      name: 'Torch',
      objects: [{ id: 'flame', shape: 'box', components: { sprite: { sprite: 'guard', clip: 'walk' } } }],
    }),
    ...Object.fromEntries(Object.entries(files).map(([path, value]) => [path, json(value)])),
  });
}

/** Each problem but the provenance log's, which these sheets have none of. */
const problems = async (files: Record<string, unknown>) =>
  (await compileProject(project(files), [])).diagnostics
    .filter((d) => d.code !== 'E019')
    .map((d) => `${d.code} ${d.file} ${d.path}`);

const withObject = (i: number, change: Record<string, unknown>) => ({
  ...KEEP,
  objects: KEEP.objects.map((o, k) => (k === i ? { ...o, ...change } : o)),
});

describe('a 2D space', () => {
  it('is clean as written, its walker walking with no navmesh', async () => {
    expect(await problems({ 'spaces/keep.json': KEEP })).toEqual([]);
  });

  it('is E058 for terrain or an environment', async () => {
    const terrain = { size: 65, spacing: 1, low: 0, high: 10, layers: [{ name: 'Grass', color: '#336633' }] };
    expect(await problems({ 'spaces/keep.json': { ...KEEP, terrain } })).toContain('E058 spaces/keep.json /terrain');
    expect(await problems({ 'spaces/keep.json': { ...KEEP, environment: 'dusk' } })).toContain(
      'E058 spaces/keep.json /environment',
    );
  });

  it('is E058 for a cylinder, a scale that isn’t whole, a turn, water or a placed model', async () => {
    const at = async (change: Record<string, unknown>) => problems({ 'spaces/keep.json': withObject(1, change) });
    expect(await at({ shape: 'cylinder' })).toEqual(['E058 spaces/keep.json /objects/1/shape']);
    expect(await at({ scale: [640, 47.5, 1] })).toEqual(['E058 spaces/keep.json /objects/1/scale']);
    expect(await at({ turn: [0, 0, 90] })).toEqual(['E058 spaces/keep.json /objects/1/turn']);
    // Water off a plane is W145 as well, in any space.
    expect(await at({ components: { water: {} } })).toContain('E058 spaces/keep.json /objects/1/components/water');
    expect(await at({ shape: undefined, color: undefined, record: 'model:crate' })).toContain(
      'E058 spaces/keep.json /objects/1/record',
    );
  });

  it('holds what a prefab places to the space’s view', async () => {
    const torch = { name: 'Torch', objects: [{ id: 'flame', shape: 'plane' }] };
    expect(await problems({ 'spaces/keep.json': KEEP, 'prefabs/torch.json': torch })).toEqual([
      'E058 spaces/keep.json /objects/2',
    ]);
  });

  it('is E058 for a 2D space’s fields on a 3D space or a prefab, and for a sprite in 3D', async () => {
    const { view: _, ...solid } = KEEP;
    const found = await problems({ 'spaces/keep.json': { ...solid, objects: [KEEP.objects[1]] } });
    expect(found).toEqual([
      'E058 spaces/keep.json /backdrop',
      'E058 spaces/keep.json /fit',
      'E058 spaces/keep.json /size',
    ]);
    expect(
      await problems({ 'spaces/keep.json': { ...solid, fit: undefined, size: undefined, backdrop: undefined } }),
    ).toContain('E058 spaces/keep.json /objects/0/components/parallax');
    expect(
      await problems({
        'spaces/keep.json': KEEP,
        'prefabs/torch.json': { name: 'Torch', view: '2d', objects: [] },
      }),
    ).toEqual(['E058 prefabs/torch.json /view']);
  });

  it('is E091 for a sprite component’s clip its sprite doesn’t have', async () => {
    expect(
      await problems({
        'spaces/keep.json': KEEP,
        'prefabs/torch.json': {
          name: 'Torch',
          objects: [{ id: 'flame', shape: 'box', components: { sprite: { sprite: 'guard', clip: 'burn' } } }],
        },
      }),
    ).toEqual(['E091 prefabs/torch.json /objects/0/components/sprite/clip']);
  });

  it('is E079 for the same walker in a 3D space with no navmesh', async () => {
    const { view: _, fit: _f, size: _s, backdrop: _b, ...solid } = KEEP;
    expect(await problems({ 'spaces/keep.json': { ...solid, objects: KEEP.objects.slice(1) } })).toContain(
      'E079 spaces/keep.json /objects/3/components/interact/effects/0',
    );
  });
});
