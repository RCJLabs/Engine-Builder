import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { compileProject, memorySource } from '@eb/compiler';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { arena } from '../../test/fighter.ts';
import type { Timers } from '../editing/autosave.ts';
import { editSession } from '../editing/editSession.ts';
import type { FileChange } from '../editing/history.ts';
import { workingCopy } from '../editing/workingCopy.ts';
import { type DefPath, eachDef, fieldNames } from './defPaths.ts';
import {
  addFieldChange,
  fillChange,
  kindChange,
  removeFieldChange,
  renameChoiceChange,
  renameFieldChange,
  setChange,
  targetsChange,
} from './fieldEdits.ts';
import {
  changeType,
  createTypeFile,
  deleteType,
  renameRecord,
  renameType,
  typeFilePath,
  typesReferringTo,
} from './typeEdits.ts';
import { choicesAt } from './typeFileChanges.ts';

const noTimers: Timers = { set: () => 0, clear: () => undefined };
const decode = (bytes: Uint8Array | undefined) => (bytes ? new TextDecoder().decode(bytes) : undefined);

function setup(files: Record<string, string> = arena()) {
  const copy = workingCopy(memorySource(files));
  const session = editSession({ copy, write: async () => undefined, timers: noTimers });
  /** Every file, as text, by path. */
  const files_ = async () => {
    const out: Record<string, string> = {};
    for (const path of [...(await copy.files(''))].sort()) out[path] = decode(await copy.read(path)) ?? '';
    return out;
  };
  const value = async (path: string) => JSON.parse(decode(await copy.read(path)) ?? 'null');
  const problems = async () =>
    (await compileProject(copy, [])).diagnostics.map((d) => `${d.code} ${d.file}${d.path ? `#${d.path}` : ''}`);
  const step = (make: (c: typeof copy) => Promise<readonly FileChange[]>) => session.edit('step', make);
  const undoAll = async () => {
    while (await session.undo());
  };
  return { copy, session, files: files_, value, problems, step, undoAll };
}

/** The salvage coast template's files, as on disk. */
function salvageCoast(): Record<string, string> {
  const base = resolve(import.meta.dirname, '../../../../templates/salvage-coast');
  const files: Record<string, string> = {};
  for (const entry of readdirSync(base, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files[relative(base, path).split('\\').join('/')] = readFileSync(path, 'utf8');
  }
  return files;
}

const paths = (changes: readonly FileChange[]) =>
  changes.map((c) => `${c.before === null ? '+' : c.after === null ? '-' : '~'}${c.path}`);

describe('the arena', () => {
  it('compiles without a problem, so a step that adds one shows', async () => {
    expect(await setup().problems()).toEqual([]);
  });
});

describe('new types', () => {
  it('starts with a name its records are known by, and never overwrites a type', async () => {
    const { copy } = setup();
    const [change] = await createTypeFile(copy, 'chariot', 'Chariot');
    expect(change?.path).toBe('types/chariot.json');
    expect(JSON.parse(decode(change?.after ?? undefined) ?? '')).toEqual({
      title: 'Chariot',
      nameField: 'name',
      fields: { name: { kind: 'text', min: 1 } },
    });
    await expect(createTypeFile(copy, 'fighter', 'Fighter')).rejects.toThrow('types/fighter.json exists already');
  });
});

describe('changes to a type with its records', () => {
  it('reads no record for a change to the type file alone, as typing in a title makes', async () => {
    const source = memorySource(arena());
    const reads: string[] = [];
    const counted = {
      files: source.files,
      read: (path: string) => {
        reads.push(path);
        return source.read(path);
      },
    };
    const changes = await changeType(counted, 'fighter', setChange(['title'], 'Gladiator'));
    expect(paths(changes)).toEqual(['~types/fighter.json']);
    expect(reads).toEqual(['types/fighter.json']);
    reads.length = 0;
    await changeType(counted, 'fighter', renameFieldChange([], 'style', 'manner'));
    // A rename checks and rewrites every record, reading each once.
    expect(reads.filter((path) => path.startsWith('records/')).sort()).toEqual([
      'records/fighter/crixus.json',
      'records/fighter/spartacus.json',
    ]);
  });

  it('renames a field in the type and in each record, in its own layout, as one step', async () => {
    const { copy, step, value, files, undoAll, problems } = setup();
    const before = await files();
    const changes = await changeType(copy, 'fighter', renameFieldChange([], 'style', 'manner'));
    expect(paths(changes)).toEqual([
      '~types/fighter.json',
      '~records/fighter/crixus.json',
      '~records/fighter/spartacus.json',
    ]);
    await step(async () => changes);
    expect((await value('records/fighter/crixus.json')).manner).toBe('murmillo');
    const spartacus = (await files())['records/fighter/spartacus.json'] ?? '';
    expect(spartacus).toBe((before['records/fighter/spartacus.json'] ?? '').replace('"style"', '"manner"'));
    expect(await problems()).toEqual([]);
    await undoAll();
    expect(await files()).toEqual(before);
  });

  it('refuses a rename onto a name some records hold already, changing nothing', async () => {
    const { copy, value } = setup();
    const crixus = { ...(await value('records/fighter/crixus.json')), manner: 'odd' };
    copy.apply(
      [{ path: 'records/fighter/crixus.json', before: null, after: new TextEncoder().encode(JSON.stringify(crixus)) }],
      'after',
    );
    await expect(changeType(copy, 'fighter', renameFieldChange([], 'style', 'manner'))).rejects.toThrow(
      '1 record holds “manner” already',
    );
  });

  it('renames a field inside the groups of a list', async () => {
    const { copy, step, value, problems } = setup();
    await step((c) => changeType(c, 'fighter', renameFieldChange(['fields', 'bouts', 'of'], 'won', 'victory')));
    expect((await value('records/fighter/spartacus.json')).bouts).toEqual([
      { foe: 'fighter:crixus', victory: true },
      { foe: 'fighter:spartacus', victory: false },
    ]);
    expect((await value('types/fighter.json')).fields.bouts.of.fields.victory).toEqual({ kind: 'bool' });
    expect(await problems()).toEqual([]);
    expect(copy).toBeDefined();
  });

  it('removes a field from the type and the records, and fills a new required one in', async () => {
    const { step, value, problems } = setup();
    await step((c) => changeType(c, 'fighter', removeFieldChange([], 'moods')));
    expect(Object.hasOwn(await value('records/fighter/crixus.json'), 'moods')).toBe(false);
    expect(await problems()).toEqual([]);
    await step((c) => changeType(c, 'fighter', addFieldChange([], 'age', { kind: 'int', min: 0 }, { value: 20 })));
    expect((await value('records/fighter/crixus.json')).age).toBe(20);
    expect(Object.keys(await value('records/fighter/spartacus.json')).at(-1)).toBe('age');
    expect(await problems()).toEqual([]);
  });

  it('adds an optional field to the type alone, and fills a required one only where it is missing', async () => {
    const { copy, step, value, problems } = setup();
    const optional = await changeType(copy, 'fighter', addFieldChange([], 'nick', { kind: 'text', optional: true }));
    expect(paths(optional)).toEqual(['~types/fighter.json']);
    await step((c) => changeType(c, 'fighter', addFieldChange(['fields', 'record'], 'draws', { kind: 'int' })));
    expect((await problems()).length).toBe(2);
    const fill = await changeType(copy, 'fighter', fillChange(['fields', 'record'], 'draws', 0));
    expect(paths(fill)).toEqual(['~records/fighter/crixus.json', '~records/fighter/spartacus.json']);
    await step(async () => fill);
    expect((await value('records/fighter/crixus.json')).record).toEqual({ wins: 12, losses: 1, draws: 0 });
    expect(await problems()).toEqual([]);
  });

  it('renames a choice in the records that hold it, and changes no record for a change of kind', async () => {
    const { copy, step, value, problems } = setup();
    await step((c) => changeType(c, 'fighter', renameChoiceChange(['fields', 'style'], 1, 'myrmillo')));
    expect((await value('records/fighter/crixus.json')).style).toBe('myrmillo');
    expect((await value('records/fighter/spartacus.json')).style).toBe('retiarius');
    await expect(changeType(copy, 'fighter', renameChoiceChange(['fields', 'style'], 1, 'retiarius'))).rejects.toThrow(
      'is a choice already',
    );
    const kind = await changeType(copy, 'fighter', kindChange(['fields', 'style'], 'int', true, [], 'school'));
    expect(paths(kind)).toEqual(['~types/fighter.json']);
    await step(async () => kind);
    expect(await problems()).toEqual([
      'E001 records/fighter/crixus.json#/style',
      'E001 records/fighter/spartacus.json#/style',
    ]);
  });

  it('qualifies a ref’s ids when it comes to name several types', async () => {
    const { step, value, problems } = setup();
    await step((c) => changeType(c, 'fighter', targetsChange(['fields', 'school'], ['school', 'beast'])));
    expect((await value('records/fighter/crixus.json')).school).toBe('school:ludus-magnus');
    expect((await value('types/fighter.json')).fields.school.to).toEqual(['school', 'beast']);
    expect(await problems()).toEqual([]);
    await step((c) => changeType(c, 'fighter', targetsChange(['fields', 'school'], ['school'])));
    expect((await value('records/fighter/crixus.json')).school).toBe('ludus-magnus');
    expect(await problems()).toEqual([]);
  });
});

describe('renaming and deleting types', () => {
  it('moves the type’s file and records, and follows it in other types and qualified refs', async () => {
    const { copy, step, value, files, problems, undoAll } = setup();
    const before = await files();
    const changes = await renameType(copy, 'beast', 'animal');
    expect(paths(changes)).toEqual([
      '-types/beast.json',
      '+types/animal.json',
      '~types/fighter.json',
      '-records/beast/lion.json',
      '+records/animal/lion.json',
      '~records/fighter/crixus.json',
    ]);
    await step(async () => changes);
    const crixus = await value('records/fighter/crixus.json');
    expect(crixus.bouts[1].foe).toBe('animal:lion');
    expect(crixus.spoils).toEqual({ 'weapon:trident': 1, 'animal:lion': 2 });
    expect((await value('types/fighter.json')).fields.rival.to).toEqual(['fighter', 'animal']);
    expect(await problems()).toEqual([]);
    await undoAll();
    expect(await files()).toEqual(before);
  });

  it('renames a type that refers to itself, and keeps bare ids as they are', async () => {
    const { step, value, problems, files } = setup();
    await step((c) => renameType(c, 'fighter', 'gladiator'));
    const all = await files();
    expect(Object.keys(all).filter((p) => p.includes('fighter'))).toEqual([]);
    expect((await value('records/gladiator/spartacus.json')).rival).toBe('gladiator:crixus');
    expect((await value('records/gladiator/crixus.json')).school).toBe('ludus-magnus');
    expect((await value('types/gladiator.json')).fields.rival.to).toEqual(['gladiator', 'beast']);
    expect(all['records/gladiator/spartacus.json']).toContain('\r\n\t"rival": "gladiator:crixus",\r\n');
    expect(await problems()).toEqual([]);
  });

  it('refuses a name that is taken, by a type file or by records', async () => {
    const { copy } = setup({ ...arena(), 'records/horse/bucephalus.json': '{}' });
    await expect(renameType(copy, 'beast', 'school')).rejects.toThrow('There is a type school already');
    await expect(renameType(copy, 'beast', 'horse')).rejects.toThrow('There is a type horse already');
  });

  it('deletes a type with its records, unless another type refers to it', async () => {
    const { copy, step, files, problems } = setup();
    expect(await typesReferringTo(copy, 'beast')).toEqual(['fighter']);
    expect(await typesReferringTo(copy, 'fighter')).toEqual([]);
    await expect(deleteType(copy, 'beast')).rejects.toThrow('fighter refer to beast');
    const changes = await deleteType(copy, 'fighter');
    expect(paths(changes)).toEqual([
      '-types/fighter.json',
      '-records/fighter/crixus.json',
      '-records/fighter/spartacus.json',
    ]);
    await step(async () => changes);
    expect(Object.keys(await files()).filter((p) => p.includes('fighter'))).toEqual([]);
    expect(await problems()).toEqual([]);
  });
});

describe('renaming records', () => {
  it('moves the record and rewrites every reference to it, bare, qualified and as map keys', async () => {
    const { copy, step, value, problems, files, undoAll } = setup();
    const before = await files();
    expect(paths(await renameRecord(copy, 'weapon', 'trident', 'fuscina'))).toEqual([
      '-records/weapon/trident.json',
      '+records/weapon/fuscina.json',
      '~records/fighter/crixus.json',
      '~records/fighter/spartacus.json',
    ]);
    await step((c) => renameRecord(c, 'weapon', 'trident', 'fuscina'));
    expect((await value('records/fighter/crixus.json')).spoils).toEqual({ 'weapon:fuscina': 1, 'beast:lion': 2 });
    expect((await value('records/fighter/spartacus.json')).kit).toEqual({ fuscina: 1 });
    expect((await files())['records/weapon/fuscina.json']).toBe('{"name":"Trident"}');
    expect(await problems()).toEqual([]);
    await undoAll();
    expect(await files()).toEqual(before);
  });

  it('rewrites a record’s references to itself and its type’s', async () => {
    const { step, value, problems } = setup();
    await step((c) => renameRecord(c, 'fighter', 'crixus', 'crixus-gaul'));
    expect((await value('records/fighter/spartacus.json')).rival).toBe('fighter:crixus-gaul');
    expect((await value('records/fighter/spartacus.json')).bouts[0].foe).toBe('fighter:crixus-gaul');
    expect(await problems()).toEqual([]);
    await step((c) => renameRecord(c, 'school', 'ludus-magnus', 'ludus-maximus'));
    expect((await value('records/fighter/crixus-gaul.json')).school).toBe('ludus-maximus');
    expect(await problems()).toEqual([]);
  });

  it('rewrites a moved record’s references to itself, once', async () => {
    const { copy, step, value, problems } = setup();
    const changes = await renameRecord(copy, 'fighter', 'spartacus', 'spartacus-thrax');
    expect(paths(changes)).toEqual([
      '-records/fighter/spartacus.json',
      '+records/fighter/spartacus-thrax.json',
      '~records/fighter/crixus.json',
    ]);
    await step(async () => changes);
    expect((await value('records/fighter/spartacus-thrax.json')).bouts[1].foe).toBe('fighter:spartacus-thrax');
    expect((await value('records/fighter/crixus.json')).rival).toBe('fighter:spartacus-thrax');
    expect(await problems()).toEqual([]);
  });

  it('follows references the type files don’t describe, kit records, effects and cost keys, and the guide (M4.11)', async () => {
    const { copy, step, value, problems } = setup(salvageCoast());
    expect(await problems()).toEqual([]);
    expect(paths(await renameRecord(copy, 'actor', 'raider', 'corsair'))).toEqual([
      '-records/actor/raider.json',
      '+records/actor/corsair.json',
      '~records/encounter/raiders.json',
      '~guide.json',
    ]);
    await step((c) => renameRecord(c, 'actor', 'raider', 'corsair'));
    expect((await value('guide.json')).steps[4].open).toEqual({ file: 'records/actor/corsair.json', at: '/stats' });
    expect((await value('records/encounter/raiders.json')).foes).toEqual([{ actor: 'corsair' }]);
    await step((c) => renameRecord(c, 'encounter', 'raiders', 'sloop'));
    expect((await value('records/event/sail-sighted.json')).choices[0].effects[0]).toMatchObject({
      encounter: 'sloop',
    });
    expect(await problems()).toEqual([]);
    // A cost's key follows. The limp move's condition and the screens' text name stores as a word,
    // which stays, as conditions do (rewrites.ts): those are what's left to fix by hand.
    await step((c) => renameRecord(c, 'resource', 'stores', 'biscuit'));
    expect((await value('records/event/fog.json')).choices[0].cost).toEqual({ biscuit: 1 });
    expect(await problems()).toEqual([
      'E013 records/map/coast.json#/moves/1/if',
      ...['free', 'hud', 'lost', 'map', 'seized', 'shop'].map((screen) =>
        expect.stringMatching(`^E048 ui/${screen}\\.json#`),
      ),
    ]);
  });

  it('refuses an id that is taken', async () => {
    const { copy } = setup();
    await expect(renameRecord(copy, 'weapon', 'net', 'gladius')).rejects.toThrow('exists already');
  });
});

describe('a type file being fixed', () => {
  it('still renames a field when another part of the file has a problem', async () => {
    const files = arena();
    const fighter = JSON.parse(files['types/fighter.json'] ?? '');
    fighter.fields.name.max = -1;
    const { step, value, problems } = setup({ ...files, 'types/fighter.json': JSON.stringify(fighter) });
    expect(await problems()).toEqual(['E015 types/fighter.json#/fields/name/max']);
    await step((c) => changeType(c, 'fighter', renameFieldChange([], 'style', 'manner')));
    expect((await value('records/fighter/crixus.json')).manner).toBe('murmillo');
    expect(typeFilePath('fighter')).toBe('types/fighter.json');
  });
});

/** A rename the project allows, picked by `pick`, to a name no one has: there, and back again. */
interface Rename {
  readonly forward: (c: ReturnType<typeof setup>['copy']) => Promise<readonly FileChange[]>;
  readonly back: (c: ReturnType<typeof setup>['copy']) => Promise<readonly FileChange[]>;
  /** What a "type:id" is called after it, in "used by". */
  readonly key: (key: string) => string;
}

function pickRename(files: Record<string, string>, pick: number, n: number): Rename {
  const fresh = `renamed-${n}`;
  const types = Object.keys(files)
    .filter((path) => path.startsWith('types/'))
    .map((path) => path.slice('types/'.length, -'.json'.length));
  const at = <T>(list: readonly T[], i: number) => list[i % list.length] as T;
  const choice = Math.floor(pick / 4);
  const same = (key: string) => key;
  switch (pick % 4) {
    case 0: {
      const [, type = '', file = ''] = at(
        Object.keys(files).filter((p) => p.startsWith('records/')),
        choice,
      ).split('/');
      const id = file.slice(0, -'.json'.length);
      return {
        forward: (c) => renameRecord(c, type, id, fresh),
        back: (c) => renameRecord(c, type, fresh, id),
        key: (key) => (key === `${type}:${id}` ? `${type}:${fresh}` : key),
      };
    }
    case 1: {
      const type = at(types, choice);
      return {
        forward: (c) => renameType(c, type, fresh),
        back: (c) => renameType(c, fresh, type),
        key: (key) => (key.startsWith(`${type}:`) ? `${fresh}:${key.slice(type.length + 1)}` : key),
      };
    }
    case 2: {
      const type = at(types, choice);
      const file = JSON.parse(files[`types/${type}.json`] ?? '{}');
      const groups: DefPath[] = [[]];
      eachDef(file, (_def, kind, path) => {
        if (kind === 'group') groups.push(path);
      });
      const group = at(groups, choice);
      const name = at(fieldNames(file, group), choice);
      const renamed = `field${n}`;
      return {
        forward: (c) => changeType(c, type, renameFieldChange(group, name, renamed)),
        back: (c) => changeType(c, type, renameFieldChange(group, renamed, name)),
        key: same,
      };
    }
    default: {
      const enums: { type: string; path: DefPath; index: number; from: string }[] = [];
      for (const type of types) {
        const file = JSON.parse(files[`types/${type}.json`] ?? '{}');
        eachDef(file, (_def, kind, path) => {
          if (kind === 'enum')
            for (const [index, from] of choicesAt(file, path).entries()) enums.push({ type, path, index, from });
        });
      }
      const { type, path, index, from } = at(enums, choice);
      return {
        forward: (c) => changeType(c, type, renameChoiceChange(path, index, fresh)),
        back: (c) => changeType(c, type, renameChoiceChange(path, index, from)),
        key: same,
      };
    }
  }
}

/** Who refers to whom, without where: a rename moves the where, never the who. */
async function references(copy: ReturnType<typeof setup>['copy'], key: (key: string) => string = (k) => k) {
  const { usedBy } = await compileProject(copy, []);
  return [...usedBy].flatMap(([to, usages]) => usages.map((u) => `${key(to)} <- ${key(u.from)}`)).sort();
}

const valuesOf = (files: Record<string, string>) =>
  Object.fromEntries(Object.entries(files).map(([path, text]) => [path, JSON.parse(text)]));

describe('any run of renames', () => {
  it('keeps every problem and reference, and renaming back or undoing gives the project back', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.nat({ max: 400 }), { minLength: 1, maxLength: 6 }), async (picks) => {
        const t = setup();
        const start = await t.files();
        const backs: Rename['back'][] = [];
        for (const [n, pick] of picks.entries()) {
          const rename = pickRename(await t.files(), pick, n);
          const refs = await references(t.copy, rename.key);
          await t.step(rename.forward);
          expect(await t.problems()).toEqual([]);
          expect(await references(t.copy)).toEqual(refs);
          backs.push(rename.back);
        }
        for (const back of backs.reverse()) await t.step(back);
        expect(valuesOf(await t.files())).toEqual(valuesOf(start));
        await t.undoAll();
        expect(await t.files()).toEqual(start);
      }),
      { numRuns: 60 },
    );
  });
});
