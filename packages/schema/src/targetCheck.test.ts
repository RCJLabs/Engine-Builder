/**
 * An objective's target, checked (M6.6, D78, docs/specs/markers.md#targets): E086 for each way a
 * target can name what isn't there, and W155 for an actor placed in no space. Only with the spaces
 * known, as the compiler gives them.
 */
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from './diagnostics.ts';
import { type RecordInput, type ValidateOptions, validateRecords } from './validate.ts';
import type { Walkers } from './worldCheck.ts';

const ON = ['time', 'stats', 'quests'];
const record = (type: string, id: string, value: unknown): RecordInput => ({
  type,
  id,
  file: `records/${type}/${id}.json`,
  value,
});
const objects = new Map([
  ['glen', new Set(['rope', 'bothy-door', 'bothy-door/frame'])],
  ['shed', new Set(['lamp'])],
]);
const walkers: Walkers = new Map([
  ['ada', { space: 'glen', objects: objects.get('glen') as Set<string>, navmesh: false }],
]);
const SPACES: ValidateOptions = { kits: ON, objects, walkers };
// Only this check's codes: the quest's flag is read and never set, which is W109's business.
const lines = (diagnostics: readonly Diagnostic[]) =>
  diagnostics
    .filter(({ code }) => code === 'E086' || code === 'W155')
    .map(({ code, path, message }) => `${code} ${path}: ${message}`);

const quest = (target: unknown, slots: unknown[] = [{ id: 'mark', type: 'actor', record: 'ada' }]) =>
  record('quest', 'supplies', {
    name: 'Supplies',
    'at-start': true,
    slots,
    stages: [{ id: 'go', objectives: [{ id: 'o', text: 'Go', 'done-when': 'flag.on(x)', target }] }],
  });
const RECORDS = [record('actor', 'ada', {}), record('actor', 'bram', {}), record('flag', 'x', {})];
const check = (target: unknown, options: ValidateOptions = SPACES, slots?: unknown[]) =>
  lines(validateRecords([], [...RECORDS, quest(target, slots)], options).diagnostics);
const AT = '/stages/0/objectives/0/target';

describe('an objective’s target', () => {
  it('passes when it names a placed actor, a slot of actors, a space or an object through a prefab', () => {
    for (const target of [
      { actor: 'ada' },
      { actor: '@mark' },
      { space: 'shed' },
      { space: 'glen', object: 'bothy-door/frame' },
    ]) {
      expect(check(target)).toEqual([]);
    }
  });

  it('is E086 when what it names isn’t there', () => {
    expect(check({ space: 'barn' })).toEqual([`E086 ${AT}/space: No space "barn"`]);
    expect(check({ space: 'glen', object: 'lamp' })).toEqual([
      `E086 ${AT}/object: The space "glen" has no object "lamp"`,
    ]);
    expect(check({ actor: 'cora' })).toEqual([`E086 ${AT}/actor: No actor "cora"`]);
    expect(check({ actor: '@who' })).toEqual([`E086 ${AT}/actor: This quest has no slot "who"`]);
    expect(check({ actor: '@mark' }, SPACES, [{ id: 'mark', type: 'flag', record: 'x' }])).toEqual([
      `E086 ${AT}/actor: The slot "mark" holds a flag, not an actor`,
    ]);
  });

  it('is E086 when it is neither an actor nor a place, or both', () => {
    expect(check({ object: 'rope' })).toEqual([`E086 ${AT}: An object is in a space: give the space too`]);
    expect(check({ actor: 'ada', space: 'glen' })).toEqual([
      `E086 ${AT}: A target is an actor, or a space and an object in it: not both`,
    ]);
    expect(check({})).toEqual([`E086 ${AT}: Give an actor, or a space and maybe an object in it`]);
  });

  it('is W155 for an actor placed in no space', () => {
    expect(check({ actor: 'bram' })).toEqual([
      `W155 ${AT}/actor: The actor "bram" stands in no space, so the marker can't show`,
    ]);
  });

  it('gets only its shape checked when the spaces aren’t known', () => {
    expect(check({ space: 'barn' }, { kits: ON })).toEqual([]);
  });
});
