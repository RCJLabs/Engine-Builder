/** M5.2's edits as plain functions (D64): components, overrides set and reverted, and what a placement shows inside. */
import { ENGINE_COMPONENTS } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import {
  addComponent,
  insideOf,
  overrideAt,
  recordOverridesHere,
  removeComponent,
  setComponent,
  setOverride,
} from './partEdits.ts';
import type { SpaceJson, SpaceObject } from './spaceFile.ts';

const kind = (k: string) => {
  const found = ENGINE_COMPONENTS.get(k);
  if (!found) throw new Error(k);
  return found.file;
};
const yard = (objects: SpaceObject[]): SpaceJson => ({ name: 'Yard', objects });
const lamp: SpaceObject = { id: 'lamp', prefab: 'lamp', at: [3, 0, 0] };
const box: SpaceObject = { id: 'box', shape: 'box', color: '#ff0000' };

describe('components', () => {
  it('are added with their required fields, in the file’s order, and once', () => {
    const one = addComponent(yard([box]), 'box', 'trigger', kind('trigger'));
    expect(one.objects[0]).toEqual({
      id: 'box',
      shape: 'box',
      color: '#ff0000',
      components: { trigger: { effects: [] } },
    });
    expect(Object.keys(one.objects[0] as object)).toEqual(['id', 'shape', 'color', 'components']);
    expect(addComponent(one, 'box', 'trigger', kind('trigger'))).toEqual(one);
    const two = addComponent(one, 'box', 'light', kind('light'));
    expect(two.objects[0]?.components).toEqual({ trigger: { effects: [] }, light: {} });
  });

  it('have their fields set and taken out, and go, the object as it was', () => {
    const lit = addComponent(yard([box]), 'box', 'light', kind('light'));
    const set = setComponent(lit, 'box', 'light', ['range'], 12, kind('light'));
    expect(set.objects[0]?.components).toEqual({ light: { range: 12 } });
    // A new field goes where the kind lists it.
    const both = setComponent(set, 'box', 'light', ['color'], '#ffcc88', kind('light'));
    expect(Object.keys(both.objects[0]?.components?.light ?? {})).toEqual(['color', 'range']);
    expect(setComponent(both, 'box', 'light', ['range'], undefined, kind('light')).objects[0]?.components).toEqual({
      light: { color: '#ffcc88' },
    });
    expect(removeComponent(both, 'box', 'light').objects[0]).toEqual(box);
    // A component it lacks isn't made by setting a field.
    expect(setComponent(yard([box]), 'box', 'light', ['range'], 1, kind('light'))).toEqual(yard([box]));
  });
});

describe('overrides', () => {
  it('are set under the placement by the path of ids, and reverted to the line they were', () => {
    const one = setOverride(yard([lamp]), 'lamp', ['bulb'], ['components', 'light', 'range'], 12);
    expect(one.objects[0]).toEqual({ ...lamp, overrides: { bulb: { components: { light: { range: 12 } } } } });
    const deep = setOverride(one, 'lamp', ['door', 'knob'], ['color'], '#c0a040');
    expect(deep.objects[0]?.overrides).toEqual({
      bulb: { components: { light: { range: 12 } } },
      door: { overrides: { knob: { color: '#c0a040' } } },
    });
    const back = setOverride(
      setOverride(deep, 'lamp', ['door', 'knob'], ['color'], undefined),
      'lamp',
      ['bulb'],
      ['components', 'light', 'range'],
      undefined,
    );
    expect(back.objects[0]).toEqual(lamp);
    expect(overrideAt(['door', 'knob'])).toEqual(['overrides', 'door', 'overrides', 'knob']);
  });

  it('change a placed record’s fields, here and inside a prefab, and keep what else is overridden', () => {
    const tom: SpaceObject = { id: 'tom', record: 'keeper:tom' };
    const named = setOverride(yard([tom]), 'tom', [], ['overrides', 'name'], 'Old Tom');
    expect(named.objects[0]).toEqual({ ...tom, overrides: { name: 'Old Tom' } });
    expect(recordOverridesHere(named.objects[0] as SpaceObject, [])).toEqual({ name: 'Old Tom' });
    const host = setOverride(
      yard([{ id: 'house', prefab: 'house' }]),
      'house',
      ['host'],
      ['overrides', 'greeting'],
      'Hi',
    );
    expect(recordOverridesHere(host.objects[0] as SpaceObject, ['host'])).toEqual({ greeting: 'Hi' });
    const both = setOverride(host, 'house', ['host'], ['at'], [1, 0, 0]);
    expect(setOverride(both, 'house', ['host'], ['overrides', 'greeting'], undefined).objects[0]?.overrides).toEqual({
      host: { at: [1, 0, 0] },
    });
  });
});

describe('an object inside a placement', () => {
  const prefabs = new Map<string, SpaceJson>([
    ['lamp', yard([{ id: 'bulb', shape: 'sphere', components: { light: { range: 8, color: '#ffffff' } } }])],
    ['street', yard([{ id: 'lamp', prefab: 'lamp', overrides: { bulb: { color: '#00ff00' } } }])],
  ]);

  it('shows every layer laid over it, this placement’s last, and what this placement overrides', () => {
    const street: SpaceObject = {
      id: 'street',
      prefab: 'street',
      overrides: { lamp: { overrides: { bulb: { components: { light: { range: 20 } } } } } },
    };
    const bulb = insideOf(street, prefabs, ['lamp', 'bulb']);
    expect(bulb?.object).toEqual({
      id: 'bulb',
      shape: 'sphere',
      color: '#00ff00',
      components: { light: { range: 20, color: '#ffffff' } },
    });
    expect(bulb?.here).toEqual({ components: { light: { range: 20 } } });
    const inner = insideOf(street, prefabs, ['lamp']);
    expect(inner?.here).toEqual({ overrides: { bulb: { components: { light: { range: 20 } } } } });
    expect(inner?.passed).toEqual([{ bulb: { color: '#00ff00' } }, { bulb: { components: { light: { range: 20 } } } }]);
  });

  it('is nothing for an id the prefab lacks, and the placement itself for no ids', () => {
    expect(insideOf(lamp, prefabs, ['shade'])).toBeNull();
    expect(insideOf(box, prefabs, ['x'])).toBeNull();
    expect(insideOf(lamp, prefabs, [])).toEqual({ object: lamp, passed: [], here: undefined });
  });
});
