/**
 * The dialogue kit's record types (M3.8, D46, docs/specs/dialogue.md), as type files: speakers and
 * talks. An option is an event's choice with the line it leads to; its cost names resources with
 * the economy kit on, and without it is still allowed, and is W119, since nothing charges it. A
 * line's id is text a talk's starts and options name: that each names a line there is E035's.
 */
import { RESOURCE, SPEAKER } from '@eb/kits';
import { NAME } from './kitFields.ts';
import type { FieldDef, TypeFile } from './typeFile.ts';

export const SPEAKER_TYPE_FILE: TypeFile = {
  title: 'Speaker',
  description: 'Who says a line: a name, and a portrait shown with it.',
  nameField: 'name',
  fields: {
    name: { kind: 'text', min: 1, label: 'Name', description: 'What the player reads beside the line' },
    portrait: { kind: 'asset', of: 'image', optional: true, label: 'Portrait', description: 'Shown with the line' },
  },
};

const ID_WORDS = 'lowercase words joined by hyphens, once in the talk';

const leadsTo = (description: string): FieldDef => ({
  kind: 'text',
  min: 1,
  optional: true,
  label: 'Leads to',
  description,
});

const SPEAKER_REF = (description: string): FieldDef => ({
  kind: 'ref',
  to: SPEAKER,
  optional: true,
  label: 'Speaker',
  description,
});

const optionFields = (economy: boolean): Record<string, FieldDef> => ({
  id: { kind: 'text', min: 1, label: 'Id', description: `What conditions call it: ${ID_WORDS}` },
  label: { kind: 'text', min: 1, label: 'Label', description: 'What the player says, tapping it' },
  if: { kind: 'condition', optional: true, label: 'Shown if', description: 'While this isn’t true, it isn’t shown' },
  needs: {
    kind: 'condition',
    optional: true,
    label: 'Needs',
    description: 'While this isn’t true, it is shown locked, with this in words',
  },
  cost: {
    kind: 'map',
    ...(economy ? { key: { kind: 'ref', to: RESOURCE } } : {}),
    of: { kind: 'int', min: 1 },
    optional: true,
    label: 'Cost',
    description: 'Paid as it is said; while the party is short, it is shown locked',
  },
  once: { kind: 'bool', optional: true, label: 'Once', description: 'Once said, it isn’t shown again' },
  effects: { kind: 'effects', optional: true, label: 'Effects', description: 'What it does for sure' },
  outcomes: {
    kind: 'list',
    min: 1,
    optional: true,
    label: 'Outcomes',
    description: 'One is rolled as it is said: the chances add up to 100',
    of: {
      kind: 'group',
      fields: {
        chance: { kind: 'int', min: 1, max: 100, label: 'Chance (%)' },
        effects: { kind: 'effects', label: 'Effects' },
        next: leadsTo('A line of its own when it comes up, over the option’s'),
      },
    },
  },
  next: leadsTo('The line it leads to: the talk ends when there is none'),
});

export function talkTypeFile(economy: boolean): TypeFile {
  return {
    title: 'Talk',
    description: 'One conversation: lines, and what the player can say back.',
    nameField: 'name',
    fields: {
      name: NAME,
      speaker: SPEAKER_REF('Who says its lines, unless a line names another'),
      'show-odds': {
        kind: 'bool',
        optional: true,
        label: 'Show odds',
        description: 'Each option shows its outcomes, their chances and what they do before it is said',
      },
      starts: {
        kind: 'list',
        min: 1,
        label: 'Starts',
        description: 'The first whose If is true opens the talk at its line',
        of: {
          kind: 'group',
          fields: {
            if: { kind: 'condition', optional: true, label: 'If' },
            line: { kind: 'text', min: 1, label: 'Line', description: 'A line’s id' },
          },
        },
      },
      lines: {
        kind: 'list',
        min: 1,
        label: 'Lines',
        description: 'In the order written: the map shows where each leads',
        of: {
          kind: 'group',
          fields: {
            id: { kind: 'text', min: 1, label: 'Id', description: `What starts and options call it: ${ID_WORDS}` },
            speaker: SPEAKER_REF('Who says it, when not the talk’s speaker'),
            text: { kind: 'text', min: 1, multiline: true, label: 'Text', description: 'What is said' },
            effects: { kind: 'effects', optional: true, label: 'Effects', description: 'What hearing it does' },
            options: {
              kind: 'list',
              min: 1,
              optional: true,
              label: 'Options',
              description: 'What the player can say back, in the order shown',
              of: { kind: 'group', fields: optionFields(economy) },
            },
            next: {
              kind: 'text',
              min: 1,
              optional: true,
              label: 'Then',
              description: 'Where the talk goes on to when no option is shown: it ends when there is none',
            },
          },
        },
      },
    },
  };
}
