/**
 * The quests kit's record type (M3.9, D47, docs/specs/quests.md#records), as a type file: a quest
 * of stages, each with its log line, effects and objectives. Stage and objective ids are text that
 * Then, Leads to, set-stage and conditions name: that each names one the quest has is E035's and
 * E043's. A count's arguments are text, the ids an event names.
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
        },
      },
    },
  },
};
