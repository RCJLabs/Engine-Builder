/**
 * The quests kit's record type (M3.9, D47, docs/specs/quests.md#records), as a type file: a quest
 * of stages, each with its log line, effects and objectives; M3.10's slots (D48), and a stage's job. Stage and objective ids are text that
 * Then, Leads to, set-stage and conditions name: that each names one the quest has is E035's and
 * E043's. A count's arguments are text, the ids an event names. An objective's target (M6.6) is
 * text too, checked against the spaces and actors (E086, W155).
 */
import type { FieldDef, TypeFile } from './typeFile.ts';

const ID_WORDS = 'lowercase words joined by hyphens, once in the quest';

/** A stage's id, as Then and Leads to name one. */
const stageId = (label: string, description: string): FieldDef => ({
  kind: 'text',
  min: 1,
  optional: true,
  label,
  description,
});

const OBJECTIVE: FieldDef = {
  kind: 'group',
  fields: {
    id: { kind: 'text', min: 1, label: 'Id', description: `What conditions call it: ${ID_WORDS}` },
    text: { kind: 'text', min: 1, label: 'Text', description: 'What the journal shows: “Pay the miner 30 credits”' },
    'done-when': {
      kind: 'condition',
      optional: true,
      label: 'Done when',
      description: 'It is done once this is true. Give this or Count',
    },
    count: {
      kind: 'group',
      optional: true,
      label: 'Count',
      description: 'It is done once the event has been heard this many times while its stage is current',
      fields: {
        event: { kind: 'text', min: 1, label: 'Event', description: 'Like dock/scrapped' },
        args: {
          kind: 'map',
          optional: true,
          label: 'With',
          description: 'Only the times it names these',
          of: { kind: 'text', min: 1 },
        },
        to: { kind: 'int', min: 1, label: 'Times' },
      },
    },
    next: stageId('Leads to', 'Once it is done, the quest goes to this stage at once'),
    target: {
      kind: 'group',
      optional: true,
      label: 'Target',
      description:
        'Where its marker points: an actor, or a space and an object in it. Left out, a count of world/used points at its object',
      fields: {
        actor: { kind: 'text', min: 1, optional: true, label: 'Actor', description: 'An actor’s id, or @slot' },
        space: { kind: 'text', min: 1, optional: true, label: 'Space', description: 'A space’s id' },
        object: {
          kind: 'text',
          min: 1,
          optional: true,
          label: 'Object',
          description: 'Its path in the space: an id, or placement/inner through a prefab',
        },
      },
    },
  },
};

const SLOT: FieldDef = {
  kind: 'group',
  fields: {
    id: { kind: 'text', min: 1, label: 'Id', description: `What @ and {} call it: ${ID_WORDS}` },
    type: {
      kind: 'text',
      min: 1,
      label: 'Type',
      description: 'The type of record it holds: actor, item, or a type of your own',
    },
    record: {
      kind: 'text',
      min: 1,
      optional: true,
      label: 'Record',
      description: 'The one record it holds, by its id. Give this or Where',
    },
    where: {
      kind: 'condition',
      optional: true,
      label: 'Where',
      description: 'Each record of its type is tried, @ and this slot’s id standing for it. Give this or Record',
    },
    pick: {
      kind: 'enum',
      values: ['first', 'random', 'most', 'least'],
      optional: true,
      label: 'Pick',
      description:
        'Among the records that match: the first by id when left out, one at random, or the most or least By',
    },
    by: {
      kind: 'group',
      optional: true,
      label: 'By',
      description: 'For Most and Least: the fact whose number ranks them, like stats.value',
      fields: {
        fact: { kind: 'text', min: 1, label: 'Fact', description: 'Like stats.value' },
        args: {
          kind: 'map',
          optional: true,
          label: 'With',
          description: 'Its arguments: actor @man, stat fame',
          of: { kind: 'text', min: 1 },
        },
      },
    },
    goes: {
      kind: 'bool',
      optional: true,
      label: 'Goes',
      description: 'The record is sent: away until the quest ends, and never sent on another quest',
    },
    keeps: {
      kind: 'condition',
      optional: true,
      label: 'Keeps while',
      description: 'While the quest runs, the slot keeps its record only while this is true',
    },
    gone: stageId('When gone, goes to', 'The stage the quest goes to when its record is gone: it fails when left out'),
    why: {
      kind: 'text',
      min: 1,
      optional: true,
      label: 'Why it fails',
      description: 'What the journal says when it fails because the record is gone: “{id} is gone.” when left out',
    },
  },
};

const JOB: FieldDef = {
  kind: 'group',
  optional: true,
  label: 'Job',
  description: 'It takes time, and how it ends is rolled as it is reached: the stage waits until it is over',
  fields: {
    takes: {
      kind: 'map',
      label: 'Takes',
      description: 'How long, in the calendar’s units: days, or hours if it has them',
      of: { kind: 'int', min: 0 },
    },
    outcomes: {
      kind: 'list',
      min: 1,
      label: 'Outcomes',
      description: 'How it can end: their chances add up to 100',
      of: {
        kind: 'group',
        fields: {
          chance: { kind: 'int', min: 1, max: 100, label: 'Chance', description: 'Whole percents' },
          text: { kind: 'text', min: 1, optional: true, label: 'Text', description: 'What the journal shows of it' },
          next: { kind: 'text', min: 1, label: 'Leads to', description: 'The stage the quest goes to once it is over' },
        },
      },
    },
  },
};

export const QUEST_TYPE_FILE: TypeFile = {
  title: 'Quest',
  description: 'Stages the player goes through, each with objectives that check themselves, kept in the journal.',
  nameField: 'name',
  fields: {
    name: { kind: 'text', min: 1, label: 'Name', description: 'Its title in the journal' },
    'at-start': { kind: 'bool', optional: true, label: 'Starts with the game' },
    'starts-when': {
      kind: 'condition',
      optional: true,
      label: 'Starts when',
      description: 'It starts once this is true',
    },
    repeats: {
      kind: 'bool',
      optional: true,
      label: 'Repeats',
      description: 'Once it has ended it can run again, its slots filled afresh',
    },
    slots: {
      kind: 'list',
      min: 1,
      optional: true,
      label: 'Slots',
      description: 'Records it picks as it starts, which @ and the slot’s id name in its fields',
      of: SLOT,
    },
    stages: {
      kind: 'list',
      min: 1,
      label: 'Stages',
      description: 'In the order written: the first is where it starts, and the map shows where each leads',
      of: {
        kind: 'group',
        fields: {
          id: {
            kind: 'text',
            min: 1,
            label: 'Id',
            description: `What Then, Leads to and conditions call it: ${ID_WORDS}`,
          },
          log: {
            kind: 'text',
            min: 1,
            multiline: true,
            optional: true,
            label: 'Log',
            description: 'The journal’s line for it, added as it is reached',
          },
          effects: { kind: 'effects', optional: true, label: 'Effects', description: 'What reaching it does' },
          objectives: {
            kind: 'list',
            min: 1,
            optional: true,
            label: 'Objectives',
            description: 'What the player is to do, in the order shown',
            of: OBJECTIVE,
          },
          next: stageId('Then', 'Where the quest goes once its objectives are done: it is done when there is none'),
          fails: {
            kind: 'bool',
            optional: true,
            label: 'Fails',
            description: 'Reaching it ends the quest, failed, its log the reason',
          },
          'fail-when': {
            kind: 'condition',
            optional: true,
            label: 'Fails when',
            description: 'While it is current, the quest fails once this is true',
          },
          days: {
            kind: 'int',
            min: 1,
            optional: true,
            label: 'Days',
            description: 'The quest fails once this many days have started while it is current',
          },
          why: {
            kind: 'text',
            min: 1,
            optional: true,
            label: 'Why it fails',
            description: 'What the journal says when Fails when or Days fail it: “It failed.” when left out',
          },
          job: JOB,
        },
      },
    },
  },
};
