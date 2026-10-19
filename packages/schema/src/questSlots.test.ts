/**
 * A quest's slots, repeats and jobs, checked (M3.10, D48, docs/specs/quests.md#slots): `@slot`
 * where it can stand and where it can't (E044), each slot and job rule at its place (E035), a job
 * with no time module (E045), a slot nothing can fill (W127) and `{x}` naming no slot (W128).
 */
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from './diagnostics.ts';
import { kitTypeFiles } from './kitTypes.ts';
import { readTypeFile } from './typeFile.ts';
import { type RecordInput, type ValidateOptions, validateRecords } from './validate.ts';

const ON = ['time', 'stats', 'roster', 'quests'];
const record = (type: string, id: string, value: unknown): RecordInput => ({
  type,
  id,
  file: `records/${type}/${id}.json`,
  value,
});
const codes = (diagnostics: readonly Diagnostic[]) => diagnostics.map(({ code, id, path }) => `${code} ${id} ${path}`);
const check = (records: RecordInput[], options: ValidateOptions = { kits: ON }) =>
  codes(validateRecords([], records, options).diagnostics);
const messages = (records: RecordInput[]) =>
  validateRecords([], records, { kits: ON }).diagnostics.map(
    ({ code, path, message }) => `${code} ${path}: ${message}`,
  );

const MAN = {
  id: 'man',
  type: 'actor',
  where: 'roster.member(@man)',
  pick: 'most',
  by: { fact: 'stats.value', args: { actor: '@man', stat: 'fame' } },
  goes: true,
  keeps: 'roster.member(@man)',
  gone: 'forfeit',
};
const FOE = { id: 'foe', type: 'actor', record: 'crixus' };
const STAGES = [
  {
    id: 'booked',
    log: '{man} is booked against {foe}.',
    objectives: [{ id: 'fit', text: 'Get {man} fit', 'done-when': 'stats.current(actor: @man, stat: fame) >= 1' }],
    next: 'festival',
  },
  {
    id: 'festival',
    job: {
      takes: { days: 2 },
      outcomes: [
        { chance: 60, text: '{man} wins the crowd', next: 'won' },
        { chance: 40, next: 'beaten' },
      ],
    },
  },
  { id: 'won', effects: [{ effect: 'leave', actor: '@foe', why: 'beaten' }] },
  { id: 'beaten', log: '{man} was beaten.', fails: true },
  { id: 'forfeit', log: '{man} is gone.', fails: true },
];
const BOOKING = { name: 'The booking', 'at-start': true, repeats: true, slots: [MAN, FOE], stages: STAGES };
const BASE = [
  record('stat', 'fame', { min: 0 }),
  record('actor', 'crixus', {}),
  record('roster', 'school', { start: ['crixus'] }),
];
const SOUND = [...BASE, record('quest', 'booking', BOOKING)];
const withBooking = (changes: object) => [...BASE, record('quest', 'booking', { ...BOOKING, ...changes })];
const withSlot = (i: number, changes: object) =>
  withBooking({ slots: [MAN, FOE].map((slot, k) => (k === i ? { ...slot, ...changes } : slot)) });
const withStage = (i: number, changes: object) =>
  withBooking({ stages: STAGES.map((stage, k) => (k === i ? { ...stage, ...changes } : stage)) });
const withJob = (changes: object) => withStage(1, { job: { ...STAGES[1]?.job, ...changes } });

describe('the quest type’s slots, repeats and jobs', () => {
  it('are fields forms can draw', () => {
    const file = kitTypeFiles(ON).get('quest');
    expect(readTypeFile(file).ok).toBe(true);
    expect(Object.keys(file?.fields ?? {})).toEqual(['name', 'at-start', 'starts-when', 'repeats', 'slots', 'stages']);
  });

  it('check a sound project clean: @slot in conditions, effects and By, {slot} in texts', () => {
    expect(check(SOUND)).toEqual([]);
  });
});

describe('E044: a slot where it can’t be', () => {
  it.each([
    [
      'in a condition, a slot the quest lacks',
      withStage(0, { objectives: [{ id: 'fit', text: 'Fit', 'done-when': 'roster.member(@who)' }] }),
      'E044 /stages/0/objectives/0/done-when: No slot who here: the slots are man, foe',
    ],
    [
      'in an effect, a slot the quest lacks',
      withStage(2, { effects: [{ effect: 'leave', actor: '@who', why: 'beaten' }] }),
      'E044 /stages/2/effects/0/actor: No slot who here: the slots are man, foe',
    ],
    [
      'in a count, a slot the quest lacks',
      withStage(0, {
        objectives: [{ id: 'fit', text: 'Fit', count: { event: 'roster/left', args: { actor: '@who' }, to: 1 } }],
      }),
      'E044 /stages/0/objectives/0/count/args/actor: No slot who here: the slots are man, foe',
    ],
    [
      'a slot of another type',
      [...withSlot(1, { type: 'stat', record: 'fame' })],
      'E044 /stages/2/effects/0/actor: foe holds a stat, not an actor',
    ],
    [
      'a Where naming a slot after its own',
      withSlot(0, { where: 'roster.member(@man) and roster.bond(actor: @man, with: @foe) > 2' }),
      'E044 /slots/0/where: No slot foe here: the slots are man',
    ],
    [
      'a By naming a slot after its own',
      withSlot(0, { by: { fact: 'stats.value', args: { actor: '@foe', stat: 'fame' } } }),
      'E044 /slots/0/by/args/actor: No slot foe here: the slots are man',
    ],
    [
      'in Starts when, read before its slots are filled',
      withBooking({ 'starts-when': 'roster.member(@man)' }),
      'E044 /starts-when: No slot man here: none can be named',
    ],
    [
      'quests.slot naming a slot the quest lacks',
      withStage(0, {
        objectives: [{ id: 'fit', text: 'Fit', 'done-when': 'quests.slot(quest: booking, slot: mann) == crixus' }],
      }),
      'E044 /stages/0/objectives/0/done-when: The quest booking has no slot mann: its slots are man, foe',
    ],
    [
      'a Record that isn’t there',
      withSlot(1, { record: 'spartacus' }),
      'E044 /slots/1/record: No actor record "spartacus"',
    ],
  ])('%s', (_name, records, expected) => {
    expect(messages(records)).toEqual([expected]);
  });

  it('outside a quest, in a condition and in an effect', () => {
    const sheet = record('sheet', 'yard', {
      rows: [
        {
          id: 'a',
          when: { event: 'roster/left', args: { actor: '@man' } },
          if: 'roster.member(@man)',
          do: [{ effect: 'leave', actor: '@man', why: 'gone' }],
        },
      ],
    });
    const outside = "@man names a quest's slot, which only that quest's own fields can name";
    expect(messages([...SOUND, sheet])).toEqual([
      `E044 /rows/0/do/0/actor: ${outside}`,
      `E044 /rows/0/if: ${outside}`,
      `E044 /rows/0/when/args/actor: ${outside}`,
    ]);
  });

  it('leaves no used-by for a slot', () => {
    const { usedBy } = validateRecords([], SOUND, { kits: ON });
    expect([...usedBy.keys()].filter((key) => key.includes('@'))).toEqual([]);
    expect(usedBy.get('actor:crixus')).toBeDefined();
  });
});

describe('E035: slots and jobs that don’t hold together', () => {
  it.each([
    // Either way there is no slot foe to name.
    [
      'a slot id twice',
      withSlot(1, { id: 'man' }),
      ['E035 booking /slots/1/id', 'W128 booking /stages/0/log', 'E044 booking /stages/2/effects/0/actor'],
    ],
    [
      'a slot id @ can’t write',
      withSlot(1, { id: 'The-foe' }),
      ['E035 booking /slots/1/id', 'W128 booking /stages/0/log', 'E044 booking /stages/2/effects/0/actor'],
    ],
    ['neither Record nor Where', withSlot(1, { record: undefined }), ['E035 booking /slots/1']],
    ['both Record and Where', withSlot(1, { where: 'roster.member(@foe)' }), ['E035 booking /slots/1']],
    ['Most without By', withSlot(0, { by: undefined }), ['E035 booking /slots/0/pick']],
    ['By without Most or Least', withSlot(0, { pick: 'random' }), ['E035 booking /slots/0/by']],
    [
      'a By that isn’t a number',
      withSlot(0, { by: { fact: 'roster.member', args: { actor: '@man' } } }),
      ['E035 booking /slots/0/by/fact'],
    ],
    // And then nothing brings the quest to forfeit.
    [
      'a gone stage the quest lacks',
      withSlot(0, { gone: 'forfiet' }),
      ['E035 booking /slots/0/gone', 'W124 booking /stages/4/id'],
    ],
    // And with nothing to lose, nothing brings the quest to forfeit.
    [
      'a gone stage with no Keeps while',
      withSlot(0, { keeps: undefined }),
      ['E035 booking /slots/0/gone', 'W124 booking /stages/4/id'],
    ],
    [
      'a job stage with objectives and a Then',
      withStage(1, { objectives: [{ id: 'x', text: 'X', 'done-when': 'roster.member(@man)' }], next: 'won' }),
      ['E035 booking /stages/1/next', 'E035 booking /stages/1/objectives'],
    ],
    ['a job stage that fails', withStage(1, { fails: true }), ['E035 booking /stages/1/fails']],
    [
      'an outcome leading to no stage',
      withJob({
        outcomes: [
          { chance: 60, next: 'won' },
          { chance: 40, next: 'lost' },
        ],
      }),
      ['E035 booking /stages/1/job/outcomes/1/next', 'W124 booking /stages/3/id'],
    ],
    [
      'chances that don’t add up to 100',
      withJob({
        outcomes: [
          { chance: 60, next: 'won' },
          { chance: 30, next: 'beaten' },
        ],
      }),
      ['E035 booking /stages/1/job/outcomes'],
    ],
    // A unit it lacks, and so no tick at all.
    [
      'a length in a unit the calendar lacks',
      withJob({ takes: { weeks: 1 } }),
      ['E035 booking /stages/1/job/takes', 'E035 booking /stages/1/job/takes/weeks'],
    ],
    ['a length of nothing', withJob({ takes: { days: 0 } }), ['E035 booking /stages/1/job/takes']],
  ])('%s', (_name, records, expected) => {
    expect(check(records)).toEqual(expected);
  });

  it('a timer of the kit’s own name in content', () => {
    const sheet = record('sheet', 'yard', {
      rows: [
        {
          id: 'a',
          when: { event: 'roster/joined' },
          do: [{ effect: 'schedule', timer: 'quests-booking', after: { days: 1 }, effects: [] }],
        },
      ],
    });
    expect(check([...SOUND, sheet])).toEqual(['E035 yard /rows/0/do/0/timer']);
  });
});

describe('E045, W127 and W128', () => {
  it('E045: a job in a game whose events have no time module', () => {
    const events = { 'roster/left': { args: { actor: { type: 'ref', to: 'actor' } } } } as never;
    expect(check(SOUND, { kits: ['stats', 'roster', 'quests'], events })).toContain('E045 booking /stages/1/job');
  });

  it('W127: a slot of a type no record is written of and nothing makes', () => {
    const records = withBooking({
      slots: [MAN, FOE, { id: 'prize', type: 'item', where: 'roster.member(@man)' }],
    });
    expect(check(records, { kits: [...ON, 'inventory'] })).toEqual(['W127 booking /slots/2/type']);
    // The roster makes actors: a slot of actors is never W127, written ones or not.
    const unwritten = [
      record('stat', 'fame', { min: 0 }),
      record('roster', 'school', {}),
      record('quest', 'booking', {
        ...BOOKING,
        slots: [MAN],
        stages: STAGES.map((stage, i) => (i === 0 ? { ...stage, log: 'Booked.' } : i === 2 ? { id: 'won' } : stage)),
      }),
    ];
    expect(check(unwritten)).toEqual([]);
  });

  it('W128: {x} naming no slot, in every text the journal shows', () => {
    const records = withBooking({
      slots: [MAN, { ...FOE, why: '{fo} left' }],
      stages: STAGES.map((stage, i) => (i === 0 ? { ...stage, log: 'Booked {mann}.' } : stage)),
    });
    expect(check(records)).toEqual(['W128 booking /slots/1/why', 'W128 booking /stages/0/log']);
  });
});
