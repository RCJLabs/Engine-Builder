/**
 * Which placed objects draw as models (M5.5, D67): a placed model with its placement's overrides,
 * an item whose model field names one, through a prefab and its overrides; and what drawing them
 * needs read.
 */

import type { TypeFile } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import {
  eachPlacedRecord,
  type ModelSources,
  modelFieldOf,
  modelHere,
  modelNeeds,
  placedKeys,
} from './placedModels.ts';
import type { SpaceJson } from './spaceShape.ts';

const RECORDS: Record<string, unknown> = {
  'model:crate': { file: 'models/crate.glb', materials: [{ slot: 'wood', material: 'oak' }] },
  'model:lamp': { file: 'models/lamp.glb', scale: 2 },
  'item:lantern': { name: 'Lantern', look: 'lamp' },
  'item:coin': { name: 'Coin' },
  'actor:ghost': { name: 'Ghost', look: 'lamp' },
};

const ITEM: TypeFile = {
  title: 'Item',
  fields: {
    name: { kind: 'text' },
    kind: { kind: 'ref', to: ['model', 'item'] },
    look: { kind: 'ref', to: 'model' },
    spare: { kind: 'ref', to: ['model'] },
  },
} as unknown as TypeFile;

const sources: ModelSources = {
  record: (key) => RECORDS[key],
  field: (type) => (type === 'item' ? 'look' : null),
};

const space = (objects: SpaceJson['objects']): SpaceJson => ({ name: 'Yard', objects }) as SpaceJson;

describe('a type’s model field', () => {
  it('is the first top-level ref to model records alone', () => {
    expect(modelFieldOf(ITEM)).toBe('look');
    expect(modelFieldOf({ title: 'Plain', fields: { name: { kind: 'text' } } } as unknown as TypeFile)).toBeNull();
  });
});

describe('what a placed record draws as', () => {
  it('is a placed model as its placement overrides it', () => {
    expect(modelHere('model:lamp', [{ scale: 3 }], sources)).toEqual({
      id: 'lamp',
      value: { file: 'models/lamp.glb', scale: 3 },
    });
  });

  it('is the model a record’s field names, the placement’s overrides of that field included', () => {
    expect(modelHere('item:lantern', [], sources)?.id).toBe('lamp');
    expect(modelHere('item:coin', [{ look: 'crate' }], sources)?.id).toBe('crate');
  });

  it('is nothing for a type with no model field, a field left empty, or a model that isn’t there', () => {
    expect(modelHere('actor:ghost', [], sources)).toBeNull();
    expect(modelHere('item:coin', [], sources)).toBeNull();
    expect(modelHere('item:coin', [{ look: 'gone' }], sources)).toBeNull();
    expect(modelHere('model:gone', [], sources)).toBeNull();
  });
});

describe('walking a space’s placements', () => {
  const prefabs = new Map<string, SpaceJson>([
    [
      'stall',
      space([
        { id: 'goods', record: 'item:coin' },
        { id: 'top', shape: 'box' },
      ] as SpaceJson['objects']),
    ],
  ]);
  const yard = space([
    { id: 'a', record: 'model:crate' },
    { id: 'b', prefab: 'stall', overrides: { goods: { overrides: { look: 'crate' } } } },
    { id: 'c', prefab: 'stall' },
  ] as SpaceJson['objects']);

  it('reaches records inside prefabs with what each placement passes on', () => {
    const seen: [string, unknown][] = [];
    eachPlacedRecord(yard, prefabs, (key, passed) => seen.push([key, passed]));
    expect(seen).toEqual([
      ['model:crate', []],
      ['item:coin', [{ look: 'crate' }]],
      ['item:coin', []],
    ]);
    expect(placedKeys(yard, prefabs)).toEqual(['item:coin', 'model:crate']);
  });

  it('lists the files and materials the models drawn need, once each', () => {
    expect(modelNeeds(yard, prefabs, sources)).toEqual({ files: ['models/crate.glb'], materials: ['oak'] });
  });

  it('lists the files of models nothing places when asked for them, as the foliage asks', () => {
    const empty = space([]);
    expect(modelNeeds(empty, prefabs, sources)).toEqual({ files: [], materials: [] });
    expect(modelNeeds(empty, prefabs, sources, ['model:crate'])).toEqual({
      files: ['models/crate.glb'],
      materials: ['oak'],
    });
  });
});
