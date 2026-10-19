/**
 * The quests kit's type and checks (M3.9, docs/specs/quests.md#checks): E035 at each rule's
 * place, E022 and E023 for a count's event, E043 in each kind of record a condition can sit in and
 * for a set-stage, W120, W124, W125 and W126.
 */

import { describe, expect, it } from 'vitest';
import type { Diagnostic } from './diagnostics.ts';
import { kitTypeFiles } from './kitTypes.ts';
import { ENGINE_EVENTS } from './known.ts';
import { readTypeFile } from './typeFile.ts';
import { typeFromFile } from './typeSchema.ts';
import { type RecordInput, type ValidateOptions, validateRecords } from './validate.ts';

const ON = ['time', 'quests'];
const record = (type: string, id: string, value: unknown): RecordInput => ({
  type,
  id,
  file: `records/${type}/${id}.json`,
  value,
});
const codes = (diagnostics: readonly Diagnostic[]) => diagnostics.map(({ code, id, path }) => `${code} ${id} ${path}`);
const check = (records: RecordInput[], options: ValidateOptions = { kits: ON }) =>
  codes(validateRecords([], records, options).diagnostics);

const STAGES = [
  {
    id: 'owed',
    log: 'The broker wants 30 credits within three days.',
    objectives: [
      { id: 'pay', text: 'Pay the broker', 'done-when': 'flag.on(paid)', next: 'square' },
      { id: 'refuse', text: 'Or tell her no', 'done-when': 'flag.on(refused)', next: 'hunted' },
    ],
    days: 3,
    why: 'The broker came to collect.',
  },
  { id: 'square', log: 'The broker shook your hand.' },
  { id: 'hunted', log: 'Her crew found you.', fails: true },
];
const DEBT = { name: 'The broker’s debt', 'at-start': true, stages: STAGES };
const BOUNTY = {
  name: 'Drone bounty',
  'starts-when': 'quests.state(quest: debt) == done',
  stages: [
    {
      id: 'hunt',
      objectives: [
        { id: 'scrap', text: 'Scrap three', count: { event: 'flag/changed', args: { flag: 'paid' }, to: 3 } },
      ],
      next: 'claim',
      'fail-when': 'quests.count(quest: bounty, objective: scrap) >= 9',
    },
    {
      id: 'claim',
      objectives: [{ id: 'see', text: 'See the chief', 'done-when': 'quests.reached(quest: debt, stage: square)' }],
    },
  ],
};
const BASE = [
  record('flag', 'paid', {}),
  record('flag', 'refused', {}),
  record('sheet', 'dock', {
    rows: [
      {
        id: 'settle',
        when: { event: 'quests/started' },
        do: [
          { effect: 'set-flag', flag: 'paid', to: true },
          { effect: 'set-flag', flag: 'refused', to: true },
        ],
      },
    ],
  }),
];
const SOUND = [...BASE, record('quest', 'debt', DEBT), record('quest', 'bounty', BOUNTY)];
const withDebt = (changes: object) => [
  ...BASE,
  record('quest', 'debt', { ...DEBT, ...changes }),
  record('quest', 'bounty', BOUNTY),
];
const withStages = (stages: object[]) => withDebt({ stages });
/** The debt's stages with stage i changed. */
const stage = (i: number, changes: object) => STAGES.map((s, k) => (k === i ? { ...s, ...changes } : s)) as object[];
/** The debt's first stage with objective j changed. */
const objective = (j: number, changes: object) =>
  stage(0, { objectives: STAGES[0]?.objectives?.map((o, k) => (k === j ? { ...o, ...changes } : o)) });

describe('the quests kit’s type', () => {
  it('is a type file, its log kept to its lines', () => {
    const file = kitTypeFiles(ON).get('quest');
    expect(readTypeFile(file).ok).toBe(true);
    const stages = file?.fields.stages;
    const log = stages?.kind === 'list' && stages.of.kind === 'group' ? stages.of.fields.log : undefined;
    expect(log).toMatchObject({ kind: 'text', min: 1, multiline: true });
    // Off, its type name is free for a project's own type (D41).
    expect(kitTypeFiles(['time']).has('quest')).toBe(false);
  });

  it('checks a sound project clean', () => {
    expect(check(SOUND)).toEqual([]);
  });

  it('leaves a project’s own quest type to it with the kit off, unchecked by the kit (D41)', () => {
    const own = typeFromFile('quest', { title: 'Quest', fields: { goal: { kind: 'text' } } });
    expect(
      codes(validateRecords([own.recordType], [record('quest', 'a', { goal: 'Win' })], { kits: [] }).diagnostics),
    ).toEqual([]);
  });
});

describe('E035', () => {
  it.each([
    ['a stage id twice', withStages([...STAGES, { id: 'square' }]), 'E035 debt /stages/3/id'],
    // Nothing leads to it either.
    [
      'a stage id a condition can’t write',
      withStages([...STAGES, { id: 'Square' }]),
      'E035 debt /stages/3/id',
      'W124 debt /stages/3/id',
    ],
    [
      'an objective id twice in the quest',
      withStages(stage(1, { objectives: [{ id: 'pay', text: 'Again', 'done-when': 'flag.on(paid)' }] })),
      'E035 debt /stages/1/objectives/0/id',
    ],
    [
      'an objective id a condition can’t write',
      withStages(objective(1, { id: 'No' })),
      'E035 debt /stages/0/objectives/1/id',
    ],
    ['a Then naming no stage', withStages(stage(1, { next: 'sqare' })), 'E035 debt /stages/1/next'],
    // And then nothing leads to square.
    [
      'a Leads to naming no stage',
      withStages(objective(0, { next: 'paid' })),
      'E035 debt /stages/0/objectives/0/next',
      'W124 debt /stages/1/id',
    ],
    [
      'an objective with both Done when and Count',
      withStages(objective(0, { count: { event: 'flag/changed', to: 1 } })),
      'E035 debt /stages/0/objectives/0/count',
    ],
    [
      'an objective with neither',
      withStages(objective(1, { 'done-when': undefined })),
      // And then nothing reads refused.
      'W108 refused ',
      'E035 debt /stages/0/objectives/1',
    ],
    ['a failing stage with a Then', withStages(stage(2, { next: 'square' })), 'E035 debt /stages/2/next'],
    ['a failing stage with days', withStages(stage(2, { days: 2 })), 'E035 debt /stages/2/days'],
  ])('for %s', (_name, records, ...expected) => {
    expect(check(records as RecordInput[])).toEqual(expected);
  });

  it('for stages that lead round with nothing to wait on, by Then or a set-stage among their effects', () => {
    const loop = withStages([
      ...stage(1, { next: 'again' }),
      {
        id: 'again',
        effects: [{ effect: 'set-stage', quest: 'debt', stage: 'square' }],
        objectives: [{ id: 'x', text: 'X', 'done-when': 'flag.on(paid)' }],
      },
    ]);
    const found = validateRecords([], loop, { kits: ON }).diagnostics;
    expect(codes(found)).toEqual(['E035 debt /stages/1/next']);
    expect(found[0]?.message).toBe(
      'Its stages lead round with nothing to wait on, which would never stop: square → again → square',
    );
    // A loop through Then from stages with objectives waits on them too.
    const thens = withStages([
      ...stage(1, { objectives: [{ id: 'go', text: 'Go', 'done-when': 'flag.on(paid)' }], next: 'round' }),
      {
        id: 'round',
        objectives: [{ id: 'back', text: 'Back', 'done-when': 'flag.on(refused)' }],
        next: 'square',
        days: 2,
      },
    ]);
    expect(check(thens)).toEqual([]);
    // A loop through an objective waits on it, so it can stop.
    const waits = withStages([
      ...stage(1, { objectives: [{ id: 'x', text: 'X', 'done-when': 'flag.on(paid)', next: 'owed' }] }),
    ]);
    expect(check(waits)).toEqual([]);
  });
});

describe('E001', () => {
  it.each([
    // With no stages, nothing reads refused, which the sheet sets; the bounty's count still reads paid.
    ['a quest with no stages', withDebt({ stages: [] }), 'W108 refused ', 'E001 debt /stages'],
    ['a deadline of no days', withStages(stage(0, { days: 0 })), 'E001 debt /stages/0/days'],
    [
      'a count to none',
      withStages(objective(1, { 'done-when': undefined, count: { event: 'flag/changed', to: 0 } })),
      'W108 refused ',
      'E001 debt /stages/0/objectives/1/count/to',
    ],
  ])('for %s', (_name, records, ...expected) => {
    expect(check(records as RecordInput[])).toEqual(expected);
  });
});

describe('E022 and E023', () => {
  it('are a count’s event the game doesn’t have, and arguments it doesn’t take', () => {
    const counted = (count: object) =>
      withStages(stage(1, { objectives: [{ id: 'tally', text: 'Count', count: { to: 2, ...count } }] }));
    const closed = { kits: ON, events: ENGINE_EVENTS };
    expect(check(counted({ event: 'dock/scrapped' }), closed)).toEqual([
      'E022 debt /stages/1/objectives/0/count/event',
    ]);
    expect(check(counted({ event: 'flag/changed', args: { kind: 'drone' } }))).toEqual([
      'E023 debt /stages/1/objectives/0/count/args/kind',
    ]);
    expect(check(counted({ event: 'flag/changed', args: { flag: 'lost' } }))).toEqual([
      'E023 debt /stages/1/objectives/0/count/args/flag',
    ]);
  });
});

describe('E043', () => {
  it('is a condition naming a stage or an objective its quest doesn’t have, in a quest and a row', () => {
    const records = [
      ...BASE,
      record('quest', 'debt', { ...DEBT, 'starts-when': 'quests.reached(quest: bounty, stage: hunted)' }),
      record('quest', 'bounty', {
        ...BOUNTY,
        stages: [
          { ...BOUNTY.stages[0], 'fail-when': 'quests.count(quest: debt, objective: pay) >= 1' },
          BOUNTY.stages[1],
        ],
      }),
      record('sheet', 'watch', {
        rows: [
          {
            id: 'a',
            when: { event: 'quests/done' },
            if: 'quests.objective(quest: debt, objective: scrap) or quests.stage(quest: debt) == hunt',
            do: [{ effect: 'set-stage', quest: 'bounty', stage: 'owed' }],
          },
        ],
      }),
    ];
    const found = validateRecords([], records, { kits: ON }).diagnostics;
    expect(codes(found)).toEqual([
      'E043 bounty /stages/0/fail-when',
      'E043 debt /starts-when',
      'E043 watch /rows/0/do/0/stage',
      'E043 watch /rows/0/if',
      'E043 watch /rows/0/if',
    ]);
    expect(found.map((d) => d.message).sort()).toEqual([
      'The quest bounty has no stage hunted: its stages are hunt, claim',
      'The quest bounty has no stage owed: its stages are hunt, claim',
      'The quest debt has no objective scrap: its objectives are pay, refuse',
      'The quest debt has no stage hunt: its stages are owed, square, hunted',
      'pay of debt is done by Done when, not counted: its count is always 0',
    ]);
  });
});

describe('the warnings', () => {
  it('W120: days in a game without a time module', () => {
    expect(check(SOUND, { kits: ['quests'], events: ENGINE_EVENTS })).toEqual(['W120 debt /stages/0/days']);
    // With no game's events given, a game's own time module may raise days: it isn't warned of.
    expect(check(SOUND, { kits: ['quests'] })).toEqual([]);
  });

  it('W124: a stage nothing brings the quest to, unless a set-stage names it', () => {
    const lost = withStages([...STAGES, { id: 'lost', log: 'Lost.' }]);
    expect(check(lost)).toEqual(['W124 debt /stages/3/id']);
    const set = [
      ...lost,
      record('sheet', 'watch', {
        rows: [
          { id: 'a', when: { event: 'quests/done' }, do: [{ effect: 'set-stage', quest: 'debt', stage: 'lost' }] },
        ],
      }),
    ];
    expect(check(set)).toEqual([]);
    // Not reached and unable to end: W124, as nothing brings the quest there to be stuck.
    const loose = withStages([
      ...STAGES,
      { id: 'lost', objectives: [{ id: 'spin', text: 'Spin', 'done-when': 'flag.on(paid)', next: 'lost' }] },
    ]);
    expect(check(loose)).toEqual(['W124 debt /stages/3/id']);
    // A Then is taken only when the stage can be done: these objectives all lead elsewhere.
    expect(check(withStages([...stage(0, { next: 'lost' }), { id: 'lost' }]))).toEqual(['W124 debt /stages/3/id']);
  });

  it('W125: a quest nothing starts, unless start-quest or set-stage names it', () => {
    const idle = [...SOUND, record('quest', 'idle', { name: 'Idle', stages: [{ id: 'wait' }] })];
    expect(check(idle)).toEqual(['W125 idle ']);
    const started = (effect: object) => [
      ...idle,
      record('sheet', 'watch', { rows: [{ id: 'a', when: { event: 'quests/done' }, do: [effect] }] }),
    ];
    expect(check(started({ effect: 'start-quest', quest: 'idle' }))).toEqual([]);
    expect(check(started({ effect: 'set-stage', quest: 'idle', stage: 'wait' }))).toEqual([]);
  });

  it('W126: a stage from which the quest can never end', () => {
    const stuck = withStages([
      ...stage(1, { objectives: [{ id: 'go', text: 'Go', 'done-when': 'flag.on(paid)', next: 'round' }] }),
      { id: 'round', objectives: [{ id: 'back', text: 'Back', 'done-when': 'flag.on(refused)', next: 'square' }] },
    ]);
    expect(check(stuck)).toEqual(['W126 debt /stages/1/id', 'W126 debt /stages/3/id']);
    // Days on a stage with no objectives never count: it is done at once, so it is no way out.
    const instant = withStages([
      ...stage(1, { next: 'round', days: 2 }),
      { id: 'round', objectives: [{ id: 'back', text: 'Back', 'done-when': 'flag.on(refused)', next: 'square' }] },
    ]);
    expect(check(instant)).toEqual(['W126 debt /stages/1/id', 'W126 debt /stages/3/id']);
    // A way out of the loop, by days, is enough.
    const timed = withStages([
      ...stage(1, { objectives: [{ id: 'go', text: 'Go', 'done-when': 'flag.on(paid)', next: 'owed' }] }),
    ]);
    expect(check(timed)).toEqual([]);
  });
});
