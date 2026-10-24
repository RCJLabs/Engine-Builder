/** The environment's edits (M5.4, D66): a space given one or none, a new one from a preset in one step, a field changed. */
import { compileProject, memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import type { FileChange } from '../editing/history.ts';
import { changeEnvironment, newEnvironment, setSpaceEnvironment } from './environmentEdits.ts';
import { PRESETS } from './presets.ts';

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const files = (): Record<string, string> => ({
  'project.json': json({ format: 1, id: 'fell', name: 'Fell', version: '0.1.0' }),
  'records/environment/dusk.json': '{\n\t"name": "Dusk",\n\t"hour": 19\n}\n',
  'spaces/fell.json': json({ name: 'Fell', objects: [] }),
});

function applied(start: Record<string, string>, changes: readonly FileChange[]): Record<string, string> {
  const out = { ...start };
  for (const c of changes) {
    if (c.after) out[c.path] = new TextDecoder().decode(c.after);
    else delete out[c.path];
  }
  return out;
}

const preset = (id: string) => {
  const found = PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(id);
  return found;
};

describe('a space’s environment', () => {
  it('is written after its name, and taken out again', async () => {
    const start = files();
    const given = applied(start, await setSpaceEnvironment(memorySource(start), 'fell', 'dusk'));
    expect(given['spaces/fell.json']).toBe('{\n  "name": "Fell",\n  "environment": "dusk",\n  "objects": []\n}\n');
    const none = applied(given, await setSpaceEnvironment(memorySource(given), 'fell', null));
    expect(none['spaces/fell.json']).toBe(start['spaces/fell.json']);
    expect(await setSpaceEnvironment(memorySource(start), 'fell', null)).toEqual([]);
  });

  it('can be a new one from a preset, named for the space, in one step with no problem', async () => {
    const start = files();
    const made = await newEnvironment(memorySource(start), { id: 'fell', name: 'Fell' }, preset('snow'), new Set());
    expect(made.id).toBe('fell-snow');
    expect(made.changes.map((c) => c.path)).toEqual(['records/environment/fell-snow.json', 'spaces/fell.json']);
    const after = applied(start, made.changes);
    expect(JSON.parse(after['records/environment/fell-snow.json'] ?? '')).toEqual({
      name: 'Fell, snow',
      ...preset('snow').value,
    });
    expect(JSON.parse(after['spaces/fell.json'] ?? '').environment).toBe('fell-snow');
    const result = await compileProject(memorySource(after), []);
    expect(result.diagnostics).toEqual([]);
  });

  it('takes the next free id when the space’s and the preset’s is taken', async () => {
    const start = files();
    const taken = new Set(['fell-cave', 'fell-cave-2']);
    const made = await newEnvironment(memorySource(start), { id: 'fell', name: 'Fell' }, preset('cave'), taken);
    expect(made.id).toBe('fell-cave-3');
  });
});

describe('an environment’s field', () => {
  it('changes in the record’s own layout, a new one in the type’s order, and comes out with undefined', async () => {
    const start = files();
    const hour = applied(start, await changeEnvironment(memorySource(start), 'dusk', ['hour'], 6.5));
    expect(hour['records/environment/dusk.json']).toBe('{\n\t"name": "Dusk",\n\t"hour": 6.5\n}\n');
    const fog = { color: '#808080', near: 10, far: 90 };
    const fogged = applied(hour, await changeEnvironment(memorySource(hour), 'dusk', ['fog'], fog));
    const sky = applied(fogged, await changeEnvironment(memorySource(fogged), 'dusk', ['sky'], 'gradient'));
    expect(Object.keys(JSON.parse(sky['records/environment/dusk.json'] ?? ''))).toEqual(['name', 'hour', 'sky', 'fog']);
    const clear = applied(sky, await changeEnvironment(memorySource(sky), 'dusk', ['fog'], undefined));
    expect(JSON.parse(clear['records/environment/dusk.json'] ?? '')).toEqual({
      name: 'Dusk',
      hour: 6.5,
      sky: 'gradient',
    });
  });
});
