/**
 * Format 17 (M7.1, D83, docs/specs/2d-scenes.md#the-pack): a 2D space, so an engine that can't draw
 * one refuses the pack; every pack without one keeps its format and its hash.
 */
import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../canonical.ts';
import { createPack, readPack } from '../pack.ts';
import { hasFlatSpace, type PackWorld } from './packWorld.ts';

const project = { id: 'keep', name: 'Keep', version: '0.1.0' };
const reloaded = (value: unknown): Record<string, unknown> => JSON.parse(canonicalJson(value));
const world = (wall: Record<string, unknown>): PackWorld => ({
  spaces: { wall: { name: 'Wall', objects: [], ...wall } },
  prefabs: {},
  triggers: {},
  files: {},
  records: {},
  fields: {},
  uses: {},
  spawns: { wall: [] },
  start: 'wall',
});
const pack = (given: PackWorld) => createPack(project, {}, undefined, undefined, undefined, undefined, given);

describe('format 17', () => {
  it('is a pack with a 2D space, read back as written', () => {
    const flat = pack(world({ view: '2d', fit: [320, 180] }));
    expect(flat.format).toBe(17);
    expect(flat.world?.spaces.wall).toEqual({ name: 'Wall', objects: [], view: '2d', fit: [320, 180] });
    expect(readPack(reloaded(flat))).toEqual(reloaded(flat));
  });

  it('keeps the format of a pack whose spaces are 3D, said so or not', () => {
    expect(pack(world({})).format).toBe(9);
    expect(pack(world({ view: '3d' })).format).toBe(9);
    expect(hasFlatSpace({ a: { view: '3d' }, b: {} })).toBe(false);
    expect(hasFlatSpace({ a: {}, b: { view: '2d' } })).toBe(true);
  });

  it('refuses a 2D space in a pack before format 17', () => {
    const read = reloaded(pack(world({ view: '2d' })));
    expect(() => readPack({ ...read, format: 16 })).toThrow("A 2D space is format 17's, not format 16's");
  });
});
