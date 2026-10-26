/**
 * Sheets, flags and effect fields in validation (M3.1, D36): the engine's own catalogue with
 * anything else taken as written, a game's catalogue with nothing else allowed, and the flag lint.
 */
import type { Condition, Effect } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { item } from '../test/samples.ts';
import {
  addToFlagEffect,
  condition,
  type Diagnostic,
  defineRecordType,
  ENGINE_EVENTS,
  ENGINE_FACTS,
  effect,
  packValue,
  type RecordInput,
  ref,
  rollEffect,
  SHEET_TYPE,
  SHEET_TYPE_FILE,
  scheduleEffect,
  setFlagEffect,
  type ValidateOptions,
  type ValueDef,
  validateRecords,
  withEngineTypes,
  z,
} from './index.ts';
import { view } from './zodView.ts';

const brief = (diagnostics: readonly Diagnostic[]) => diagnostics.map((d) => `${d.code} ${d.type}:${d.id} ${d.path}`);

const flag = (id: string, value: object = {}): RecordInput => ({ type: 'flag', id, value });
const sheet = (id: string, rows: object[]): RecordInput => ({ type: 'sheet', id, value: { rows } });
const row = (id: string, more: object = {}) => ({ id, when: { event: 'flag/changed' }, do: [], ...more });
const setFlag = (flag: string, to: unknown = true) => ({ effect: 'set-flag', flag, to });
const on = (flag: string): Condition => ({ fact: 'flag.on', args: { flag } });

/** A game's catalogue: everything there is, so what it lacks is an error. */
const closed: ValidateOptions = {
  facts: ENGINE_FACTS,
  events: { ...ENGINE_EVENTS, 'dock/arrived': { args: { port: { type: 'text' } } } },
  effects: [setFlagEffect(), addToFlagEffect(), rollEffect(effect())],
};

const check = (records: RecordInput[], options: ValidateOptions = {}) =>
  brief(validateRecords([item], records, options).diagnostics);
/** The errors alone, where the flag lint isn't what a test is about. */
const errors = (records: RecordInput[], options: ValidateOptions = {}) =>
  check(records, options).filter((d) => d.startsWith('E'));

describe('without a game: the engine’s own, and the rest as written', () => {
  it('accepts an event and an effect it doesn’t know, and checks those it does', () => {
    const records = [
      flag('met', {}),
      sheet('trader', [
        row('heard', { when: { event: 'dock/arrived', args: { port: 'kessel' } }, do: [{ effect: 'dock' }] }),
        row('set', { do: [setFlag('met'), { effect: 'set-flag', flag: 'met' }, setFlag('ghost')] }),
      ]),
    ];
    expect(errors(records)).toEqual(['E001 sheet:trader /rows/1/do/1/to', 'E005 sheet:trader /rows/1/do/2/flag']);
  });

  it('checks an engine event’s arguments, and counts a flag named there as used', () => {
    const records = [
      flag('met'),
      sheet('trader', [
        row('a', { when: { event: 'flag/changed', args: { flag: 'met', loud: true } } }),
        row('b', { when: { event: 'flag/changed', args: { flag: 'ghost' } } }),
        row('c', { when: { event: 'sheet/fired', args: { sheet: 'trader', row: 3 } } }),
      ]),
    ];
    expect(check(records)).toEqual([
      'W109 flag:met ',
      'E023 sheet:trader /rows/0/when/args/loud',
      'E023 sheet:trader /rows/1/when/args/flag',
      'E023 sheet:trader /rows/2/when/args/row',
    ]);
    const { usedBy } = validateRecords([item], records);
    expect(usedBy.get('flag:met')).toEqual([{ from: 'sheet:trader', path: '/rows/0/when/args/flag' }]);
    expect(usedBy.get('sheet:trader')).toEqual([{ from: 'sheet:trader', path: '/rows/2/when/args/sheet' }]);
  });

  it('checks conditions against the engine’s facts and takes a game’s as written', () => {
    const records = [
      flag('met'),
      sheet('s', [row('a', { if: 'flag.on(met) and hold.count(item: medkit) > 0', do: [setFlag('met')] })]),
      sheet('t', [row('b', { if: on('ghost') })]),
    ];
    expect(check(records)).toEqual(['E013 sheet:t /rows/0/if/args/flag']);
  });

  it('finds what is inside an effect it knows: rolls within rolls, and their references', () => {
    const roll = (effects: object[]) => ({ effect: 'roll', outcomes: [{ chance: 100, effects }] });
    const records = [
      flag('met'),
      sheet('s', [
        row('a', { do: [roll([roll([setFlag('met'), setFlag('gone'), { effect: 'roll', outcomes: [] }])])] }),
      ]),
    ];
    expect(errors(records)).toEqual([
      'E005 sheet:s /rows/0/do/0/outcomes/0/effects/0/outcomes/0/effects/1/flag',
      // No outcomes at all: too few, and chances that don't add up to 100.
      'E001 sheet:s /rows/0/do/0/outcomes/0/effects/0/outcomes/0/effects/2/outcomes',
      'E001 sheet:s /rows/0/do/0/outcomes/0/effects/0/outcomes/0/effects/2/outcomes',
    ]);
    expect(validateRecords([item], records).usedBy.get('flag:met')).toEqual([
      { from: 'sheet:s', path: '/rows/0/do/0/outcomes/0/effects/0/outcomes/0/effects/0/flag' },
    ]);
  });

  it('refuses a value that isn’t an effect where one goes', () => {
    expect(check([sheet('s', [row('a', { do: [{ flag: 'met' }, 'set-flag', { effect: 'Not Kebab' }] })])])).toEqual([
      'E001 sheet:s /rows/0/do/0',
      'E001 sheet:s /rows/0/do/1',
      'E001 sheet:s /rows/0/do/2',
    ]);
  });
});

describe('with a game: nothing else', () => {
  it('reports an event and an effect the game doesn’t have', () => {
    const records = [
      flag('met'),
      sheet('s', [
        row('a', { when: { event: 'dock/left' }, do: [{ effect: 'dock' }, setFlag('met')] }),
        row('b', { when: { event: 'dock/arrived', args: { port: 'kessel' } } }),
      ]),
    ];
    expect(errors(records, closed)).toEqual(['E025 sheet:s /rows/0/do/0/effect', 'E022 sheet:s /rows/0/when/event']);
  });

  it('reports a fact the game doesn’t have', () => {
    expect(check([sheet('s', [row('a', { if: 'hold.full' })])], closed)).toEqual(['E012 sheet:s /rows/0/if']);
  });

  it('knows a project game’s effects by name: the engine’s checked, its own kept as written (M3.2)', () => {
    const named: ValidateOptions = { ...closed, effects: undefined, effectNames: ['set-flag', 'roll', 'stash'] };
    const records = [
      flag('met'),
      sheet('s', [
        row('a', {
          do: [
            { effect: 'stash', anything: [1, 'at', 'all'] },
            setFlag('met', 3),
            { effect: 'add-to-flag', flag: 'met', by: 1 },
            { effect: 'dock' },
            // The engine's own, among the game's names, is held to its schema.
            { effect: 'roll', outcomes: 'many' },
          ],
        }),
      ]),
    ];
    expect(errors(records, named)).toEqual([
      'E026 sheet:s /rows/0/do/1/to',
      'E025 sheet:s /rows/0/do/2/effect',
      'E025 sheet:s /rows/0/do/3/effect',
      'E001 sheet:s /rows/0/do/4/outcomes',
    ]);
  });
});

describe('a sheet', () => {
  it('has each row id once', () => {
    expect(check([sheet('s', [row('a'), row('b'), row('a')])])).toEqual([
      'E024 sheet:s /rows/0/id',
      'E024 sheet:s /rows/2/id',
    ]);
  });
});

describe('flags', () => {
  it('have bounds that hold their start', () => {
    const records = [
      flag('a', { number: { min: 5, max: 1 } }),
      flag('b', { number: { min: 1, max: 3, start: 4 } }),
      flag('c', { number: { min: 1 } }),
      flag('d', { number: { min: -2, max: 2 } }),
    ];
    const lint = (code: string) => !code.startsWith('W110');
    expect(check(records).filter(lint)).toEqual([
      'E027 flag:a /number/max',
      'E027 flag:b /number/start',
      'E027 flag:c /number',
    ]);
  });

  it('are set and read as the kind they are', () => {
    const records = [
      flag('met'),
      flag('raids', { number: { min: 0, max: 3 } }),
      sheet('s', [
        row('a', {
          if: { all: [on('raids'), { fact: 'flag.number', args: { flag: 'met' }, op: '>', value: 0 }] },
          do: [
            setFlag('met', 1),
            setFlag('raids', true),
            setFlag('raids', 4),
            { effect: 'add-to-flag', flag: 'met', by: 1 },
            setFlag('raids', 2),
            { effect: 'add-to-flag', flag: 'raids', by: 9 },
          ],
        }),
        row('b', { if: 'flag.on(raids)' }),
      ]),
    ];
    expect(check(records)).toEqual([
      'E026 sheet:s /rows/0/do/0/to',
      'E026 sheet:s /rows/0/do/1/to',
      'E026 sheet:s /rows/0/do/2/to',
      'E026 sheet:s /rows/0/do/3/flag',
      'E026 sheet:s /rows/0/if/all/0',
      'E026 sheet:s /rows/0/if/all/1',
      'E026 sheet:s /rows/1/if',
    ]);
  });

  it('warn when set but never read, read but never set, or never named', () => {
    const records = [
      flag('set-only'),
      flag('read-only', { number: { start: 2 } }),
      flag('never'),
      flag('both'),
      flag('heard'),
      sheet('s', [
        row('a', { if: 'flag.number(read-only) > 1', do: [setFlag('set-only')] }),
        row('b', { if: on('both'), do: [setFlag('both', false), setFlag('heard')] }),
        row('c', { when: { event: 'flag/changed', args: { flag: 'heard' } } }),
      ]),
    ];
    const diagnostics = validateRecords([item], records).diagnostics;
    expect(diagnostics.map((d) => `${d.code} ${d.id}: ${d.message}`)).toEqual([
      'W110 never: Nothing sets or reads this flag',
      'W109 read-only: Read by sheet:s, but nothing sets it: it always holds 2',
      "W108 set-only: Set by sheet:s, but no condition or row's When reads it",
    ]);
  });

  it('count a set-flag inside a game’s own union of effects, and a flag named elsewhere as used', () => {
    const gameEffect: z.ZodType<Effect> = z.lazy(() =>
      z.discriminatedUnion('effect', [setFlagEffect(), rollEffect(gameEffect)]),
    );
    const choice = defineRecordType({
      type: 'choice',
      title: 'Choice',
      description: 'A test type that holds effects its own way, and names a flag in a plain ref field.',
      schema: z.strictObject({
        effects: z.array(gameEffect),
        when: condition().optional(),
        note: ref('flag').optional(),
      }),
    });
    const records = [
      flag('met'),
      flag('noted'),
      {
        type: 'choice',
        id: 'c',
        value: { effects: [{ effect: 'roll', outcomes: [{ chance: 100, effects: [setFlag('met', 2)] }] }] },
      },
      { type: 'choice', id: 'd', value: { effects: [], when: 'flag.on(met)', note: 'noted' } },
    ];
    expect(brief(validateRecords([choice], records).diagnostics)).toEqual([
      'E026 choice:c /effects/0/outcomes/0/effects/0/to',
    ]);
  });
});

describe('the engine’s types', () => {
  it('join a game’s, which can’t take their names', () => {
    const own = defineRecordType({ type: 'sheet', title: 'Mine', description: '', schema: z.strictObject({}) });
    expect(() => withEngineTypes([own])).toThrow('"sheet" is one of the engine\'s own record types');
    expect(withEngineTypes([SHEET_TYPE, item]).map((t) => t.type)).toEqual([
      'flag',
      'sheet',
      'sound',
      'ambience',
      'music',
      'environment',
      'material',
      'model',
      'foliage',
      'animator',
      'item',
    ]);
  });
});

describe('packing a sheet', () => {
  it('turns condition text into trees, inside the effects the catalogue knows', () => {
    const value = {
      rows: [
        {
          id: 'a',
          when: { event: 'flag/changed' },
          if: 'flag.on(met)',
          do: [
            { effect: 'schedule', after: { days: 1 }, when: 'not flag.on(met)', effects: [setFlag('met')] },
            { effect: 'dock', when: 'flag.on(met)' },
          ],
        },
      ],
    };
    const calendar = { ticksPerDay: 1 };
    const packed = packValue(SHEET_TYPE.schema, value, {
      facts: ENGINE_FACTS,
      effects: [setFlagEffect(), scheduleEffect(effect(), calendar)],
    }) as typeof value;
    const tree = { fact: 'flag.on', args: { flag: 'met' } };
    expect(packed.rows[0]?.if).toEqual(tree);
    expect(packed.rows[0]?.do[0]).toMatchObject({ when: { not: tree } });
    // A game's effect this catalogue lacks would have failed validation; packing leaves it be.
    expect(packed.rows[0]?.do[1]).toEqual({ effect: 'dock', when: 'flag.on(met)' });
    expect(value.rows[0]?.if).toBe('flag.on(met)');
  });
});

describe('the sheet’s layout for forms', () => {
  // Every object in the schema is a group in the type file with the same fields, all the way down.
  const shapeOf = (schema: z.core.$ZodType, def: ValueDef): string[] => {
    const shape = view(schema);
    if (shape.kind === 'wrapper') return shapeOf(shape.inner, def);
    if (shape.kind === 'object' && def.kind === 'group') {
      expect(Object.keys(def.fields)).toEqual(Object.keys(shape.shape));
      return Object.entries(shape.shape).flatMap(([key, child]) => [
        key,
        ...shapeOf(child, def.fields[key] as ValueDef).map((k) => `${key}.${k}`),
      ]);
    }
    if (shape.kind === 'array' && def.kind === 'list') return shapeOf(shape.element, def.of);
    return [];
  };

  it('has the fields the schema has, and no others', () => {
    const fields = shapeOf(SHEET_TYPE.schema, { kind: 'group', fields: SHEET_TYPE_FILE.fields });
    expect(fields).toEqual([
      'name',
      'description',
      'rows',
      'rows.id',
      'rows.note',
      'rows.when',
      'rows.when.event',
      'rows.when.args',
      'rows.if',
      'rows.do',
      'rows.once',
    ]);
  });
});
