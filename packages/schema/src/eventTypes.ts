/**
 * The events kit's record types (M3.7, D45, docs/specs/events.md), as type files: choice events
 * and the decks they are drawn from. A choice's cost names resources with the economy kit on;
 * without it a cost is still allowed, and is W119, since nothing charges it.
 */
import { EVENT, RESOURCE } from '@eb/kits';
import { DESCRIPTION, NAME } from './kitFields.ts';
import type { FieldDef, TypeFile } from './typeFile.ts';

/** A deck's most events, its weights and its boost for those unseen: a draw stays well under the 2^32 it can add up to. */
export const MOST_DECK_EVENTS = 1000;
const WEIGHT = 1000;
const MOST_BOOST = 10;

const cost = (economy: boolean): FieldDef => ({
  kind: 'map',
  ...(economy ? { key: { kind: 'ref', to: RESOURCE } } : {}),
  of: { kind: 'int', min: 1 },
  optional: true,
  label: 'Cost',
  description: 'Paid as it is chosen; while the party is short, the choice is shown locked',
});

const RESULT: FieldDef = {
  kind: 'text',
  multiline: true,
  optional: true,
  label: 'Result',
  description: 'What the player reads once it is chosen',
};

export function eventTypeFile(economy: boolean): TypeFile {
  return {
    title: 'Event',
    description: 'A choice event: a situation, and choices that cost, need or roll something.',
    nameField: 'name',
    fields: {
      name: NAME,
      text: { kind: 'text', multiline: true, optional: true, label: 'Text', description: 'The situation' },
      'show-odds': {
        kind: 'bool',
        optional: true,
        label: 'Show odds',
        description: 'Each choice shows its outcomes, their chances and what they do before it is chosen',
      },
      choices: {
        kind: 'list',
        min: 1,
        label: 'Choices',
        description: 'In the order shown',
        of: {
          kind: 'group',
          fields: {
            id: {
              kind: 'text',
              min: 1,
              label: 'Id',
              description: 'What conditions call it: lowercase words joined by hyphens',
            },
            label: { kind: 'text', min: 1, label: 'Label', description: 'What the player taps' },
            if: {
              kind: 'condition',
              optional: true,
              label: 'Shown if',
              description: 'While this isn’t true, the choice isn’t shown',
            },
            needs: {
              kind: 'condition',
              optional: true,
              label: 'Needs',
              description: 'While this isn’t true, the choice is shown locked, with this in words',
            },
            cost: cost(economy),
            result: RESULT,
            effects: { kind: 'effects', optional: true, label: 'Effects', description: 'What it does for sure' },
            outcomes: {
              kind: 'list',
              min: 1,
              optional: true,
              label: 'Outcomes',
              description: 'One is rolled after Effects: the chances add up to 100',
              of: {
                kind: 'group',
                fields: {
                  chance: { kind: 'int', min: 1, max: 100, label: 'Chance (%)' },
                  result: { ...RESULT, description: 'What the player reads when it comes up' },
                  effects: { kind: 'effects', label: 'Effects' },
                },
              },
            },
          },
        },
      },
    },
  };
}

export const DECK_TYPE_FILE: TypeFile = {
  title: 'Deck',
  description: 'The events that can come up somewhere: a road, a sector, a night.',
  nameField: 'name',
  fields: {
    name: NAME,
    description: DESCRIPTION,
    events: {
      kind: 'list',
      min: 1,
      max: MOST_DECK_EVENTS,
      label: 'Events',
      description: 'Each draw picks one of those that can come, by weight',
      of: {
        kind: 'group',
        fields: {
          event: { kind: 'ref', to: EVENT, label: 'Event' },
          weight: { kind: 'int', min: 1, max: WEIGHT, optional: true, label: 'Weight', description: '1 when left out' },
          if: {
            kind: 'condition',
            optional: true,
            label: 'If',
            description: 'While this isn’t true, it can’t be drawn',
          },
          once: { kind: 'bool', optional: true, label: 'Once', description: 'Once seen, it is never drawn again' },
        },
      },
    },
    recent: {
      kind: 'int',
      min: 0,
      optional: true,
      label: 'Passes over the last',
      description: 'An event among this many of the last draws is passed over: 0 when left out',
    },
    unseen: {
      kind: 'int',
      min: 1,
      max: MOST_BOOST,
      optional: true,
      label: 'Unseen boost',
      description: 'An event never seen has its weight times this: 1 when left out',
    },
  },
};
