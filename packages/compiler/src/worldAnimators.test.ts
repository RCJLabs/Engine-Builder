/**
 * What the pack's world carries for animation (M6.5, D77, docs/specs/animation.md#in-the-walk): a
 * placed actor's animator, through what its placement overrides, and the model its clips come from
 * with that model's file, though nothing places the model itself.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile.ts';
import { memorySource } from './source.ts';

const CHARACTER = resolve(import.meta.dirname, '../../../starter-character');
const read = (path: string) => new Uint8Array(readFileSync(resolve(CHARACTER, path)));
const text = (path: string) => readFileSync(resolve(CHARACTER, path), 'utf8');
const json = (value: unknown) => JSON.stringify(value);

const GLB = 'starter-character/starter-character.glb';
const SLOTS = ['clothes', 'trim', 'skin', 'hair', 'soles'];

function project(placed: unknown) {
  return memorySource({
    'project.json': json({ format: 1, id: 'yard', name: 'Yard', version: '0.1.0', kits: ['stats'] }),
    [`assets/${GLB}`]: read(`assets/${GLB}`),
    'assets/assets.json': text('assets/assets.json'),
    'records/model/starter-character.json': text('records/model/starter-character.json'),
    'records/animator/starter-character.json': text('records/animator/starter-character.json'),
    ...Object.fromEntries(
      SLOTS.map((slot) => [`records/material/character-${slot}.json`, text(`records/material/character-${slot}.json`)]),
    ),
    'records/animator/slow.json': json({
      clips: 'starter-character',
      base: { start: 'idle', states: [{ id: 'idle', clip: 'idle', loop: true, speed: 0.5 }] },
    }),
    // The same file as a second model, so a state can take its clip from another model.
    'records/model/twin.json': text('records/model/starter-character.json'),
    'records/animator/borrowed.json': json({
      clips: 'starter-character',
      base: { start: 'idle', states: [{ id: 'idle', clip: 'walk', from: 'twin', loop: true }] },
    }),
    'records/actor/smith.json': json({ stats: {}, animator: 'starter-character' }),
    'records/actor/carter.json': json({ stats: {} }),
    'spaces/yard.json': json({ name: 'Yard', objects: placed }),
  });
}

describe('the world’s animators', () => {
  it('packs the model a state takes its clip from, beside the animator’s own', async () => {
    const result = await compileProject(
      project([{ id: 'smith', record: 'actor:smith', overrides: { animator: 'borrowed' } }]),
      [],
    );
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(Object.keys(result.pack?.world?.records ?? {}).sort()).toEqual([
      'actor:smith',
      'animator:borrowed',
      'model:starter-character',
      'model:twin',
    ]);
  });

  it('packs a placed actor’s animator and the model its clips come from, with its file', async () => {
    const result = await compileProject(project([{ id: 'smith', record: 'actor:smith' }]), []);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const world = result.pack?.world;
    expect(Object.keys(world?.records ?? {}).sort()).toEqual([
      'actor:smith',
      'animator:starter-character',
      'model:starter-character',
    ]);
    // Its materials aren't needed: the model is only the clips' source, placed nowhere.
    expect(Object.keys(world?.files ?? {})).toEqual([`assets/${GLB}`]);
  });

  it('packs the animator a placement overrides it with, and none for an actor without one', async () => {
    const result = await compileProject(
      project([
        { id: 'smith', record: 'actor:smith', overrides: { animator: 'slow' } },
        { id: 'carter', record: 'actor:carter' },
      ]),
      [],
    );
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(Object.keys(result.pack?.world?.records ?? {}).sort()).toEqual([
      'actor:carter',
      'actor:smith',
      'animator:slow',
      'model:starter-character',
    ]);
  });
});
