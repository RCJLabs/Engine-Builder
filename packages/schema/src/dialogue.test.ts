/**
 * The dialogue kit's types and checks (M3.8, docs/specs/dialogue.md#checks): E035 at each rule's
 * place, E042 in each kind of record a condition can sit in, W119, W121, W122 and W123; and
 * M3.11's, which follow the talk's ways: E035 for lines that pass in a loop, W129 and W130.
 */
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from './diagnostics.ts';
import { kitTypeFiles } from './kitTypes.ts';
import { readTypeFile } from './typeFile.ts';
import { typeFromFile } from './typeSchema.ts';
import { type RecordInput, type ValidateOptions, validateRecords } from './validate.ts';

const ON = ['inventory', 'economy', 'dialogue'];
const record = (type: string, id: string, value: unknown): RecordInput => ({
  type,
  id,
  file: `records/${type}/${id}.json`,
  value,
});
const codes = (diagnostics: readonly Diagnostic[]) => diagnostics.map(({ code, id, path }) => `${code} ${id} ${path}`);
const check = (records: RecordInput[], options: ValidateOptions = { kits: ON }) =>
  codes(validateRecords([], records, options).diagnostics);

const BONDED = 'flag.number(bond) >= 2';
const OPTIONS = [
  { id: 'gas', label: 'Chip in for gas', cost: { cash: 10 }, next: 'thanks' },
  { id: 'beta', label: 'Any beta?', needs: BONDED, once: true, next: 'beta-given' },
  {
    id: 'send',
    label: 'Watch me send it',
    if: 'dialogue.heard(talk: marge, line: beta-given) >= 1',
    outcomes: [
      { chance: 60, effects: [], next: 'sent' },
      { chance: 40, effects: [] },
    ],
    next: 'again',
  },
  { id: 'bye', label: 'See you around.' },
];
const LINES = [
  {
    id: 'hello',
    text: 'First time at the crag?',
    options: [
      { id: 'first', label: 'It is.', effects: [{ effect: 'add-to-flag', flag: 'bond', by: 1 }], next: 'tour' },
      { id: 'been', label: 'I’ve been before.', next: 'again' },
    ],
  },
  { id: 'tour', text: 'The slab is the warm-up.', next: 'again' },
  { id: 'again', text: 'What are we doing today?', options: OPTIONS },
  { id: 'thanks', text: 'Appreciated.', next: 'again' },
  { id: 'beta-given', speaker: 'dex', text: 'Heel hook at the second bolt.', next: 'again' },
  { id: 'sent', text: 'Clean!' },
];
const MARGE = {
  name: 'Marge at the crag',
  speaker: 'marge',
  starts: [{ if: 'dialogue.talked(talk: marge) >= 1', line: 'again' }, { line: 'hello' }],
  lines: LINES,
};
const BASE = [
  record('resource', 'cash', { start: 20 }),
  record('flag', 'bond', { number: { start: 0, max: 5 } }),
  record('speaker', 'marge', { name: 'Marge' }),
  record('speaker', 'dex', { name: 'Dex' }),
  record('sheet', 'crag', {
    rows: [{ id: 'arrive', when: { event: 'dialogue/ended' }, do: [{ effect: 'open-talk', talk: 'marge' }] }],
  }),
];
const SOUND = [...BASE, record('talk', 'marge', MARGE)];
const withMarge = (changes: object) => [...BASE, record('talk', 'marge', { ...MARGE, ...changes })];
const withLines = (lines: object[]) => withMarge({ lines });
/** Marge's lines with line i changed. */
const line = (i: number, changes: object) => LINES.map((l, k) => (k === i ? { ...l, ...changes } : l)) as object[];
/** Marge's "again" with option i changed. */
const option = (i: number, changes: object) =>
  line(2, { options: OPTIONS.map((o, k) => (k === i ? { ...o, ...changes } : o)) });

describe('the dialogue kit’s types', () => {
  it('are type files, a cost naming resources only with the economy kit on', () => {
    const files = kitTypeFiles(ON);
    for (const type of ['speaker', 'talk']) expect(readTypeFile(files.get(type)).ok, type).toBe(true);
    const costOf = (on: string[]) => {
      const lines = kitTypeFiles(on).get('talk')?.fields.lines;
      const options = lines?.kind === 'list' && lines.of.kind === 'group' ? lines.of.fields.options : undefined;
      return options?.kind === 'list' && options.of.kind === 'group' ? options.of.fields.cost : undefined;
    };
    expect(costOf(ON)).toMatchObject({ kind: 'map', key: { kind: 'ref', to: 'resource' } });
    // A line's text keeps its line breaks: a box that drops them would lose a speech's lines.
    const lines = files.get('talk')?.fields.lines;
    const text = lines?.kind === 'list' && lines.of.kind === 'group' ? lines.of.fields.text : undefined;
    expect(text).toMatchObject({ kind: 'text', min: 1, multiline: true, optional: true });
    const branches = lines?.kind === 'list' && lines.of.kind === 'group' ? lines.of.fields.branches : undefined;
    expect(branches).toMatchObject({ kind: 'list', optional: true, of: { kind: 'group' } });
    expect(costOf(['inventory', 'dialogue'])).not.toHaveProperty('key');
    // Off, its type names are free for a project's own types (D41).
    expect(kitTypeFiles(['inventory', 'economy']).has('talk')).toBe(false);
  });

  it('check a sound project clean', () => {
    expect(check(SOUND)).toEqual([]);
  });

  it('leave a project’s own talk type to it with the kit off, unchecked by the kit (D41)', () => {
    const own = typeFromFile('talk', { title: 'Talk', fields: { line: { kind: 'text' } } });
    const records = [record('talk', 'hello', { line: 'Hi' })];
    expect(codes(validateRecords([own.recordType], records, { kits: ['inventory'] }).diagnostics)).toEqual([]);
  });
});

describe('E035', () => {
  it.each([
    ['a line id twice', withLines([...LINES, { id: 'tour', text: 'Again?' }]), 'E035 marge /lines/6/id'],
    ['a line id a condition can’t write', withLines([...LINES, { id: 'Top', text: 'Up' }]), 'E035 marge /lines/6/id'],
    ['an option id twice in the talk', withLines(option(0, { id: 'first' })), 'E035 marge /lines/2/options/0/id'],
    ['an option id a condition can’t write', withLines(option(3, { id: 'Bye' })), 'E035 marge /lines/2/options/3/id'],
    ['a start naming no line', withMarge({ starts: [...MARGE.starts, { line: 'top' }] }), 'E035 marge /starts/2/line'],
    ['a line’s Then naming no line', withLines(line(1, { next: 'agian' })), 'E035 marge /lines/1/next'],
    [
      'a branch naming no line',
      withLines(line(1, { branches: [{ if: BONDED, line: 'nowhere' }] })),
      'E035 marge /lines/1/branches/0/line',
    ],
    ['an option leading to no line', withLines(option(3, { next: 'farewell' })), 'E035 marge /lines/2/options/3/next'],
    [
      'an outcome leading to no line',
      withLines(
        option(2, {
          outcomes: [
            { chance: 60, effects: [], next: 'sent' },
            { chance: 40, effects: [], next: 'whipper' },
          ],
        }),
      ),
      'E035 marge /lines/2/options/2/outcomes/1/next',
    ],
    [
      'chances that don’t add up to 100',
      withLines(
        option(2, {
          outcomes: [
            { chance: 60, effects: [], next: 'sent' },
            { chance: 30, effects: [] },
          ],
        }),
      ),
      'E035 marge /lines/2/options/2/outcomes',
    ],
  ])('for %s', (_name, records, expected) => {
    expect(check(records)).toEqual([expected]);
  });
});

describe('E001', () => {
  it.each([
    ['a talk with no starts', withMarge({ starts: [] }), 'E001 marge /starts'],
    // Without lines, nothing sets or reads the bond: the flag goes too, so W110 doesn't come.
    ['a talk with no lines', withMarge({ lines: [] }).filter((r) => r.type !== 'flag'), 'E001 marge /lines'],
    ['a line with no text', withLines(line(5, { text: '' })), 'E001 marge /lines/5/text'],
    [
      'a chance past 100',
      withLines(option(2, { outcomes: [{ chance: 101, effects: [] }] })),
      'E001 marge /lines/2/options/2/outcomes/0/chance',
    ],
    ['a speaker with no name', [...SOUND, record('speaker', 'ghost', {})], 'E001 ghost /name'],
    [
      'an open-talk naming no talk',
      [
        ...SOUND,
        record('sheet', 'lost', {
          rows: [{ id: 'a', when: { event: 'dialogue/ended' }, do: [{ effect: 'open-talk', talk: 'ranger' }] }],
        }),
      ],
      'E005 lost /rows/0/do/0/talk',
    ],
  ])('for %s', (_name, records, expected) => {
    expect(check(records)).toEqual([expected]);
  });
});

describe('E042', () => {
  it('is a condition naming a line or an option its talk doesn’t have, in a row, a start and an option', () => {
    const records = [
      ...withMarge({
        starts: [{ if: 'dialogue.heard(talk: marge, line: summit) >= 1', line: 'again' }, { line: 'hello' }],
        lines: line(0, {
          options: [
            { ...LINES[0]?.options?.[0], if: 'dialogue.said(talk: marge, option: shout)' },
            LINES[0]?.options?.[1],
          ],
        }),
      }),
      record('talk', 'note', { starts: [{ line: 'read' }], lines: [{ id: 'read', text: 'Gone climbing.' }] }),
      record('sheet', 'later', {
        rows: [
          {
            id: 'a',
            when: { event: 'dialogue/ended' },
            if: 'dialogue.said(talk: note, option: sign)',
            do: [{ effect: 'open-talk', talk: 'note' }],
          },
        ],
      }),
    ];
    const found = validateRecords([], records, { kits: ON }).diagnostics;
    expect(codes(found)).toEqual([
      'E042 later /rows/0/if',
      'E042 marge /lines/0/options/0/if',
      'E042 marge /starts/0/if',
    ]);
    expect(found.map((d) => d.message)).toEqual([
      'The talk note has no option sign: it has no options',
      'The talk marge has no option shout: its options are first, been, gas, beta, send, bye',
      'The talk marge has no line summit: its lines are hello, tour, again, thanks, beta-given, sent',
    ]);
  });
});

describe('the warnings', () => {
  it('W119: a cost in a game without the economy kit', () => {
    const records = SOUND.filter((r) => r.type !== 'resource');
    expect(check(records, { kits: ['inventory', 'dialogue'] })).toEqual(['W119 marge /lines/2/options/0/cost']);
  });

  it('W121: a line no start reaches, and lines that lead only to each other', () => {
    expect(check(withLines([...LINES, { id: 'lost', text: 'Hm?' }]))).toEqual(['W121 marge /lines/6/id']);
    const pair = [
      { id: 'tick', text: 'Tick', next: 'tock' },
      { id: 'tock', text: 'Tock', next: 'tick' },
    ];
    expect(check(withLines([...LINES, ...pair]))).toEqual(['W121 marge /lines/6/id', 'W121 marge /lines/7/id']);
    // Reached only through an outcome is reached.
    expect(check(withLines(option(2, { outcomes: [{ chance: 100, effects: [], next: 'sent' }] })))).toEqual([]);
  });

  it('W122: a line that can show only locked options, and not one whose options only hide', () => {
    const [first, been] = LINES[0]?.options ?? [];
    const hello = (changes: object, others: object) =>
      withLines(
        line(0, {
          options: [
            { ...first, ...changes },
            { ...been, ...others },
          ],
        }),
      );
    for (const other of [{ if: BONDED }, { once: true }, { needs: BONDED }, { cost: { cash: 5 } }]) {
      expect(check(hello({ needs: BONDED }, other)), JSON.stringify(other)).toEqual(['W122 marge /lines/0/options']);
    }
    // With none shown, the talk goes on: hiding can't hold a party.
    expect(check(hello({ if: BONDED }, { once: true }))).toEqual([]);
    expect(check(hello({ cost: { cash: 5 } }, {}))).toEqual([]);
  });

  it('W123: a talk no row, line, option or outcome opens', () => {
    const ranger = record('talk', 'ranger', { starts: [{ line: 'stop' }], lines: [{ id: 'stop', text: 'Permit?' }] });
    expect(check([...SOUND, ranger])).toEqual(['W123 ranger ']);
    const opens = { effect: 'open-talk', talk: 'ranger' };
    const places = [
      line(5, { effects: [opens] }),
      option(3, { effects: [opens] }),
      option(2, {
        outcomes: [
          { chance: 60, effects: [opens], next: 'sent' },
          { chance: 40, effects: [] },
        ],
      }),
    ];
    for (const lines of places) expect(check([...withLines(lines), ranger])).toEqual([]);
  });
});

describe('the checks that follow a talk’s ways (M3.11)', () => {
  // x is read here and set by nothing (W109), which these checks don't care about.
  const X = record('flag', 'x', {});
  const withX = (lines: object[]) => [...withLines(lines), X];
  const ways = (records: RecordInput[]) => check(records).filter((c) => !c.startsWith('W109'));
  const tour = (changes: object) => line(1, changes);

  it('E035: lines without text that pass to each other in a loop, and W130 for what can only reach them', () => {
    const loop = [...tour({ next: 'pass-a' }), { id: 'pass-a', next: 'pass-b' }, { id: 'pass-b', next: 'pass-a' }];
    expect(check(withLines(loop))).toEqual([
      'W130 marge /lines/1/id',
      'E035 marge /lines/6/id',
      'W130 marge /lines/7/id',
    ]);
    // One that shows an option that is always there never passes.
    const held = [...tour({ next: 'pass-a' }), { id: 'pass-a', next: 'pass-b' }];
    const stop = { id: 'pass-b', options: [{ id: 'stop', label: 'Stop' }], next: 'pass-a' };
    expect(check(withLines([...held, stop]))).toEqual([]);
  });

  it('W130: a line every way on from which leads back', () => {
    const pair = [
      { id: 'tick', text: 'Tick', next: 'tock' },
      { id: 'tock', text: 'Tock', next: 'tick' },
    ];
    expect(check(withLines([...option(3, { next: 'tick' }), ...pair]))).toEqual([
      'W130 marge /lines/6/id',
      'W130 marge /lines/7/id',
    ]);
    // A way out by an option is a way to end.
    const out = { ...pair[1], options: [{ id: 'out', label: 'Out' }] };
    expect(check(withLines([...option(3, { next: 'tick' }), pair[0] as object, out]))).toEqual([]);
  });

  it('W129: a branch the ways to it rule out, and the line only it leads to', () => {
    const ruled = tour({
      branches: [
        { if: BONDED, line: 'thanks' },
        { if: 'flag.number(bond) >= 3', line: 'sent' },
      ],
    });
    expect(check(withLines(ruled))).toEqual(['W129 marge /lines/1/branches/1/if']);
    const nested = [
      ...tour({ branches: [{ if: 'flag.on(x)', line: 'inner' }] }),
      { id: 'inner', text: 'Inner.', branches: [{ if: 'not flag.on(x)', line: 'deep' }], next: 'again' },
      { id: 'deep', text: 'Deep.', next: 'again' },
    ];
    expect(ways(withX(nested))).toEqual(['W129 marge /lines/6/branches/0/if', 'W129 marge /lines/7/id']);
  });

  it('W129: an option the ways to its line rule out, until an effect on the way could change it', () => {
    const inner = (effects: object[]) => [
      ...tour({ branches: [{ if: 'flag.on(x)', line: 'inner' }] }),
      {
        id: 'inner',
        text: 'Inner.',
        ...(effects.length > 0 ? { effects } : {}),
        options: [
          { id: 'never', label: 'Never', if: 'not flag.on(x)', next: 'again' },
          { id: 'ok', label: 'Ok', next: 'again' },
        ],
      },
    ];
    expect(ways(withX(inner([])))).toEqual(['W129 marge /lines/6/options/0/if']);
    expect(ways(withX(inner([{ effect: 'set-flag', flag: 'x', to: false }])))).toEqual([]);
  });
});
