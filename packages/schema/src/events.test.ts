/**
 * The events kit's types and checks (M3.7, docs/specs/events.md#checks): E035 at each rule's
 * place, E041 in each kind of record a condition can sit in, W118, W119, W120, and the flag lint
 * counting a consequence's flag as read.
 */
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from './diagnostics.ts';
import { kitTypeFiles } from './kitTypes.ts';
import { readTypeFile } from './typeFile.ts';
import { type RecordInput, type ValidateOptions, validateRecords } from './validate.ts';

const ON = ['inventory', 'economy', 'time', 'events'];
const record = (type: string, id: string, value: unknown): RecordInput => ({
  type,
  id,
  file: `records/${type}/${id}.json`,
  value,
});
const codes = (diagnostics: readonly Diagnostic[]) => diagnostics.map(({ code, id, path }) => `${code} ${id} ${path}`);
const check = (records: RecordInput[], options: ValidateOptions = { kits: ON }) =>
  codes(validateRecords([], records, options).diagnostics);

const DEBT = {
  effect: 'later',
  id: 'debt',
  after: { flag: 'nodes', by: 3 },
  do: [{ effect: 'open-event', event: 'raiders' }],
};
const RAIDERS = {
  name: 'Raiders',
  choices: [
    { id: 'pay', label: 'Pay the toll', cost: { scrap: 30 } },
    { id: 'flee', label: 'Flee', needs: 'economy.amount(resource: fuel) >= 2' },
    {
      id: 'fight',
      label: 'Fight',
      outcomes: [
        { chance: 60, result: 'They scatter.', effects: [] },
        { chance: 40, effects: [DEBT] },
      ],
    },
    { id: 'hide', label: 'Hide', effects: [{ effect: 'later', after: { days: 2 }, do: [] }] },
  ],
};
const BASE = [
  record('resource', 'scrap', { start: 40 }),
  record('resource', 'fuel', { start: 3 }),
  record('flag', 'nodes', { number: { start: 0, max: 8 } }),
  record('flag', 'helped', {}),
  record('deck', 'road', {
    recent: 1,
    events: [
      { event: 'raiders', weight: 2 },
      { event: 'quiet', if: 'flag.on(helped)' },
    ],
  }),
  record('event', 'quiet', { choices: [{ id: 'go-on', label: 'Go on' }] }),
  record('sheet', 'road', {
    rows: [
      {
        id: 'travel',
        when: { event: 'events/chosen' },
        if: 'events.chose(event: raiders, choice: fight)',
        do: [
          { effect: 'add-to-flag', flag: 'nodes', by: 1 },
          { effect: 'set-flag', flag: 'helped', to: true },
        ],
      },
    ],
  }),
];
const SOUND = [...BASE, record('event', 'raiders', RAIDERS)];
const withRaiders = (choices: object[]) => [...BASE, record('event', 'raiders', { ...RAIDERS, choices })];
const choice = (i: number, changes: object) =>
  RAIDERS.choices.map((c, k) => (k === i ? { ...c, ...changes } : c)) as object[];

describe('the events kit’s types', () => {
  it('are type files, a cost naming resources only with the economy kit on', () => {
    const files = kitTypeFiles(ON);
    for (const type of ['event', 'deck']) expect(readTypeFile(files.get(type)).ok, type).toBe(true);
    const costOf = (on: string[]) => {
      const choices = kitTypeFiles(on).get('event')?.fields.choices;
      return choices?.kind === 'list' && choices.of.kind === 'group' ? choices.of.fields.cost : undefined;
    };
    expect(costOf(ON)).toMatchObject({ kind: 'map', key: { kind: 'ref', to: 'resource' } });
    expect(costOf(['inventory', 'events'])).not.toHaveProperty('key');
    expect(kitTypeFiles(['inventory', 'economy']).has('event')).toBe(false);
  });

  it('check a sound project clean', () => {
    expect(check(SOUND)).toEqual([]);
  });
});

describe('E035', () => {
  it.each([
    ['a choice id twice', withRaiders(choice(1, { id: 'pay' })), 'E035 raiders /choices/1/id'],
    ['a choice id a condition can’t write', withRaiders(choice(0, { id: 'Pay' })), 'E035 raiders /choices/0/id'],
    [
      'chances that don’t add up to 100',
      withRaiders(
        choice(2, {
          outcomes: [
            { chance: 60, effects: [] },
            { chance: 30, effects: [DEBT] },
          ],
        }),
      ),
      'E035 raiders /choices/2/outcomes',
    ],
    [
      'an event twice in a deck',
      [...SOUND, record('deck', 'pair', { events: [{ event: 'quiet' }, { event: 'quiet', weight: 2 }] })],
      'E035 pair /events/1/event',
    ],
    [
      'a deck passing over as many draws as it has events',
      [...SOUND, record('deck', 'tight', { recent: 2, events: [{ event: 'quiet' }, { event: 'raiders' }] })],
      'E035 tight /recent',
    ],
  ])('for %s', (_name, records, expected) => {
    expect(check(records)).toEqual([expected]);
  });

  const later = (effect: object) => withRaiders(choice(3, { effects: [{ effect: 'later', do: [], ...effect }] }));
  it.each([
    ['After giving no kind', later({ after: {} }), 'E035 raiders /choices/3/effects/0/after'],
    ['After giving two kinds', later({ after: { days: 1, choices: 2 } }), 'E035 raiders /choices/3/effects/0/after'],
    ['Risen by without a flag', later({ after: { days: 1, by: 2 } }), 'E035 raiders /choices/3/effects/0/after/by'],
    ['an on/off flag', later({ after: { flag: 'helped' } }), 'E035 raiders /choices/3/effects/0/after/flag'],
    [
      'an id a condition can’t write',
      later({ after: { days: 1 }, id: 'Debt' }),
      'E035 raiders /choices/3/effects/0/id',
    ],
    [
      'a cancel’s id a condition can’t write',
      withRaiders(choice(3, { effects: [{ effect: 'cancel-later', id: 'the debt' }] })),
      'E035 raiders /choices/3/effects/0/id',
    ],
  ])('for a consequence with %s', (_name, records, expected) => {
    expect(check(records)).toEqual([expected]);
  });
});

describe('E001', () => {
  const far = (deck: object) => [...SOUND, record('deck', 'far', { events: [{ event: 'quiet' }], ...deck })];
  it.each([
    ['an event with no choices', [...SOUND, record('event', 'empty', { choices: [] })], 'E001 empty /choices'],
    ['a weight past 1000', far({ events: [{ event: 'quiet', weight: 1001 }] }), 'E001 far /events/0/weight'],
    ['an unseen boost past 10', far({ unseen: 11 }), 'E001 far /unseen'],
    [
      'a consequence 0 days on',
      withRaiders(choice(3, { effects: [{ effect: 'later', after: { days: 0 }, do: [] }] })),
      'E001 raiders /choices/3/effects/0/after/days',
    ],
  ])('for %s', (_name, records, expected) => {
    expect(check(records)).toEqual([expected]);
  });
});

describe('E041', () => {
  it('is a condition naming a choice its event doesn’t have, in a row, a choice and a deck', () => {
    const records = [
      ...SOUND,
      record('event', 'trader', {
        choices: [
          { id: 'buy', label: 'Buy', needs: 'events.chose(event: raiders, choice: run)' },
          { id: 'leave', label: 'Leave' },
        ],
      }),
      record('deck', 'night', { events: [{ event: 'quiet', if: 'not events.chose(event: raiders, choice: parley)' }] }),
    ];
    const found = validateRecords([], records, { kits: ON }).diagnostics;
    expect(codes(found)).toEqual(['E041 night /events/0/if', 'E041 trader /choices/0/needs']);
    expect(found[1]?.message).toBe('The event raiders has no choice run: its choices are pay, flee, fight, hide');
  });
});

describe('the warnings', () => {
  it('W118: an event none of whose choices is always open, the last locked by a Shown if, a Needs or a Cost', () => {
    const helped = 'flag.on(helped)';
    for (const lock of [{ if: helped }, { needs: helped }, { cost: { scrap: 5 } }]) {
      const records = withRaiders([...RAIDERS.choices.slice(0, 2), { ...RAIDERS.choices[2], ...lock }]);
      expect(check(records), JSON.stringify(lock)).toEqual(['W118 raiders /choices']);
    }
  });

  it('W119: a cost in a game without the economy kit', () => {
    const kits = ['inventory', 'time', 'events'];
    const records = SOUND.filter((r) => r.type !== 'resource' && r.id !== 'raiders').concat([
      record('event', 'raiders', {
        choices: [
          { id: 'pay', label: 'Pay', cost: { scrap: 30 } },
          { id: 'fight', label: 'Fight', effects: [DEBT] },
        ],
      }),
    ]);
    expect(check(records, { kits })).toEqual(['W119 raiders /choices/0/cost']);
  });

  it('W120: a consequence counting days in a game without a time module, once the game is known', () => {
    const kits = ['inventory', 'economy', 'events'];
    const records = withRaiders(RAIDERS.choices.slice(2));
    expect(check(records, { kits })).toEqual([]);
    const known = check(records, { kits, events: { 'flag/changed': { args: { flag: { type: 'ref', to: 'flag' } } } } });
    expect(known.filter((line) => line.startsWith('W'))).toEqual(['W120 raiders /choices/1/effects/0/after/days']);
  });

  it('counts the flag a consequence waits on as read (W108, W109)', () => {
    const waitedOn = [
      record('flag', 'nodes', { number: {} }),
      record('event', 'quiet', { choices: [{ id: 'go-on', label: 'Go on', effects: [DEBT] }] }),
      record('event', 'raiders', { choices: [{ id: 'go', label: 'Go' }] }),
    ];
    const raised = record('sheet', 'up', {
      rows: [{ id: 'up', when: { event: 'events/opened' }, do: [{ effect: 'add-to-flag', flag: 'nodes', by: 1 }] }],
    });
    expect(check([...waitedOn, raised])).toEqual([]);
    expect(check(waitedOn)).toEqual(['W109 nodes ']);
  });

  it('checks the effects a consequence holds, as a row’s', () => {
    const records = withRaiders(
      choice(3, {
        effects: [{ effect: 'later', after: { days: 1 }, do: [{ effect: 'open-event', event: 'ambush' }] }],
      }),
    );
    expect(check(records)).toEqual(['E005 raiders /choices/3/effects/0/do/0/event']);
  });
});
