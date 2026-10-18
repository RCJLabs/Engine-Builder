import { describe, expect, it } from 'vitest';
import { CRIXUS, FIGHTER } from '../../test/fighter.ts';
import { eachDef, mapAt, nodeAt, setInTypeFile, stepsOf, valuesAt } from './defPaths.ts';
import {
  addChoice,
  addFieldDef,
  moveChoice,
  moveFieldDef,
  refersTo,
  removeChoice,
  removeFieldDef,
  renameChoiceDef,
  renameFieldDef,
  renameTypeInFile,
  replaceDef,
  targetsValue,
} from './typeFileChanges.ts';

describe('def paths', () => {
  it('reads steps from the start, so a field may be named "fields" or "key"', () => {
    expect(stepsOf(['fields', 'fields', 'key'])).toEqual([{ field: 'fields' }, { into: 'key' }]);
    expect(stepsOf(['fields', 'key', 'of', 'fields', 'of'])).toEqual([
      { field: 'key' },
      { into: 'of' },
      { field: 'of' },
    ]);
    expect(stepsOf(['values'])).toBeUndefined();
    expect(stepsOf(['fields'])).toBeUndefined();
  });

  it('visits every def in file order, a map key marked as one', () => {
    const seen: string[] = [];
    eachDef(FIGHTER, (_def, kind, path, key) => seen.push(`${path.join('.')} ${kind}${key ? ' key' : ''}`));
    expect(seen.slice(0, 9)).toEqual([
      'fields.name text',
      'fields.style enum',
      'fields.school ref',
      'fields.rival ref',
      'fields.bouts list',
      'fields.bouts.of group',
      'fields.bouts.of.fields.foe ref',
      'fields.bouts.of.fields.won bool',
      'fields.kit map',
    ]);
    expect(seen).toContain('fields.kit.key ref key');
    expect(seen).toContain('fields.allies.of.fields.since int');
    expect(seen).toHaveLength(26);
  });

  it('passes over what isn’t a def, as a type file being fixed has', () => {
    const seen: string[] = [];
    eachDef({ fields: { a: { kind: 'nope' }, b: 3, c: { kind: 'list', of: 'text' } } }, (_d, kind, path) =>
      seen.push(`${path.join('.')} ${kind}`),
    );
    expect(seen).toEqual(['fields.c list']);
    eachDef(null, () => seen.push('never'));
    expect(seen).toHaveLength(1);
  });

  it('reaches each value a def describes, through lists and maps', () => {
    expect(valuesAt(FIGHTER, ['fields', 'bouts', 'of', 'fields', 'foe'], CRIXUS)).toEqual([
      'fighter:spartacus',
      'beast:lion',
    ]);
    expect(valuesAt(FIGHTER, ['fields', 'kit', 'of'], CRIXUS)).toEqual([1, 2]);
    expect(valuesAt(FIGHTER, ['fields', 'allies', 'of', 'fields', 'since'], CRIXUS)).toEqual([70]);
    expect(valuesAt(FIGHTER, ['fields', 'moods', 'of'], CRIXUS)).toEqual(['wild', 'calm', 'wild']);
    expect(valuesAt(FIGHTER, [], CRIXUS)).toEqual([CRIXUS]);
    // A map's keys aren't values: changes to them change the map.
    expect(valuesAt(FIGHTER, ['fields', 'kit', 'key'], CRIXUS)).toEqual([]);
    // A field the record leaves out has no value to reach.
    expect(valuesAt(FIGHTER, ['fields', 'fights'], { name: 'x' })).toEqual([]);
  });

  it('gives back the record itself when nothing changes, and copies only what does', () => {
    expect(mapAt(FIGHTER, ['fields', 'bouts', 'of', 'fields', 'won'], CRIXUS, (v) => v)).toBe(CRIXUS);
    const next = mapAt(FIGHTER, ['fields', 'bouts', 'of', 'fields', 'won'], CRIXUS, () => true) as typeof CRIXUS;
    expect(next.bouts).toEqual([
      { foe: 'fighter:spartacus', won: true },
      { foe: 'beast:lion', won: true },
    ]);
    expect(next.kit).toBe(CRIXUS.kit);
    expect(CRIXUS.bouts[0]?.won).toBe(false);
    expect(Object.keys(next)).toEqual(Object.keys(CRIXUS));
  });

  it('leaves values of the wrong shape as they are', () => {
    const odd = { ...CRIXUS, bouts: 'none', kit: [1], record: 5 };
    expect(mapAt(FIGHTER, ['fields', 'bouts', 'of', 'fields', 'won'], odd, () => true)).toBe(odd);
    expect(mapAt(FIGHTER, ['fields', 'kit', 'of'], odd, () => 9)).toBe(odd);
    expect(mapAt(FIGHTER, ['fields', 'record', 'fields', 'wins'], odd, () => 9)).toBe(odd);
  });

  it('puts a new key where the format lists it', () => {
    const file = { title: 'T', fields: { a: { kind: 'int', min: 0, optional: true } } };
    expect(Object.keys(setInTypeFile(file, ['description'], 'd') as object)).toEqual([
      'title',
      'description',
      'fields',
    ]);
    expect(Object.keys(nodeAt(setInTypeFile(file, ['fields', 'a', 'max'], 9), ['fields', 'a']) as object)).toEqual([
      'kind',
      'min',
      'max',
      'optional',
    ]);
    expect(Object.keys(nodeAt(setInTypeFile(file, ['fields', 'a', 'label'], 'A'), ['fields', 'a']) as object)).toEqual([
      'kind',
      'min',
      'label',
      'optional',
    ]);
    // A field named "fields" is a def, not a list of fields.
    const named = { title: 'T', fields: { fields: { kind: 'int', optional: true } } };
    expect(
      Object.keys(nodeAt(setInTypeFile(named, ['fields', 'fields', 'min'], 1), ['fields', 'fields']) as object),
    ).toEqual(['kind', 'min', 'optional']);
  });
});

describe('type file changes', () => {
  it('renames a field where it stands, and the name field with it', () => {
    const next = renameFieldDef(FIGHTER, [], 'name', 'title') as typeof FIGHTER;
    expect(Object.keys(next.fields)[0]).toBe('title');
    expect(next.nameField).toBe('title');
    const nested = renameFieldDef(FIGHTER, ['fields', 'bouts', 'of'], 'won', 'victory');
    expect(Object.keys(nodeAt(nested, ['fields', 'bouts', 'of', 'fields']) as object)).toEqual(['foe', 'victory']);
    expect((nested as typeof FIGHTER).nameField).toBe('name');
    // Onto a field there already, or from one that isn't: nothing.
    expect(renameFieldDef(FIGHTER, [], 'name', 'style')).toBe(FIGHTER);
    expect(renameFieldDef(FIGHTER, [], 'nobody', 'x')).toBe(FIGHTER);
  });

  it('removes a field, and the name field when it was that', () => {
    const next = removeFieldDef(FIGHTER, [], 'name') as Record<string, unknown>;
    expect(Object.hasOwn(next, 'nameField')).toBe(false);
    expect(Object.keys(next.fields as object)).not.toContain('name');
    const nested = removeFieldDef(FIGHTER, ['fields', 'record'], 'name');
    expect((nested as typeof FIGHTER).nameField).toBe('name');
  });

  it('adds a field last and moves fields within their group', () => {
    const added = addFieldDef(FIGHTER, ['fields', 'record'], 'draws', { kind: 'int' });
    expect(Object.keys(nodeAt(added, ['fields', 'record', 'fields']) as object)).toEqual(['wins', 'losses', 'draws']);
    const moved = moveFieldDef(FIGHTER, [], 'style', -1);
    expect(Object.keys((moved as typeof FIGHTER).fields).slice(0, 3)).toEqual(['style', 'name', 'school']);
    expect(moveFieldDef(FIGHTER, [], 'name', -1)).toBe(FIGHTER);
    expect(moveFieldDef(FIGHTER, [], 'fights', 1)).toBe(FIGHTER);
  });

  it('replaces a def by one of another kind, keeping what a field says about itself', () => {
    const next = replaceDef(FIGHTER, ['fields', 'rival'], { kind: 'text' }, true);
    expect(nodeAt(next, ['fields', 'rival'])).toEqual({ kind: 'text', optional: true });
    const item = replaceDef(FIGHTER, ['fields', 'moods', 'of'], { kind: 'int' }, false);
    expect(nodeAt(item, ['fields', 'moods', 'of'])).toEqual({ kind: 'int' });
  });

  it('adds, renames, moves and removes choices', () => {
    const at = ['fields', 'style'];
    let file: unknown = addChoice(FIGHTER, at, 'secutor');
    expect(nodeAt(file, [...at, 'values'])).toEqual(['retiarius', 'murmillo', 'secutor']);
    file = renameChoiceDef(file, at, 1, 'myrmillo');
    file = moveChoice(file, at, 2, -1);
    expect(nodeAt(file, [...at, 'values'])).toEqual(['retiarius', 'secutor', 'myrmillo']);
    expect(moveChoice(file, at, 0, -1)).toEqual(file);
    file = removeChoice(file, at, 0);
    expect(nodeAt(file, [...at, 'values'])).toEqual(['secutor', 'myrmillo']);
  });

  it('renames a type wherever a ref names it, in one type or a list, and lists where', () => {
    const next = renameTypeInFile(FIGHTER, 'fighter', 'gladiator');
    expect(nodeAt(next, ['fields', 'rival', 'to'])).toEqual(['gladiator', 'beast']);
    expect(nodeAt(next, ['fields', 'bouts', 'of', 'fields', 'foe', 'to'])).toEqual(['gladiator', 'beast']);
    expect(nodeAt(renameTypeInFile(FIGHTER, 'weapon', 'arm'), ['fields', 'kit', 'key', 'to'])).toBe('arm');
    expect(renameTypeInFile(FIGHTER, 'nobody', 'x')).toBe(FIGHTER);
    expect(refersTo(FIGHTER, 'beast').map((p) => p.join('.'))).toEqual([
      'fields.rival',
      'fields.bouts.of.fields.foe',
      'fields.spoils.key',
    ]);
    expect(targetsValue(['school'])).toBe('school');
    expect(targetsValue(['school', 'beast'])).toEqual(['school', 'beast']);
  });
});
