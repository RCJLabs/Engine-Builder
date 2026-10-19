/**
 * The events kit's effects (M3.7, D45, docs/specs/events.md#effects), as fields: open-event,
 * draw-event, later and cancel-later. Later's Do is a list of effects (the type files' `effects`
 * kind), so it gets a form as every other kit effect does. What its fields can't say (one kind
 * of After, a number flag, ids a condition can write) is E035's.
 */
import { FLAG } from '@eb/core';
import { DECK, EVENT, EVENTS } from '@eb/kits';
import type { EffectFile } from './kitEffects.ts';

const LATER_ID = 'For Cancel a consequence and the facts; booking it again replaces it';

export const EVENT_EFFECT_FILES: readonly EffectFile[] = [
  {
    effect: 'open-event',
    kit: EVENTS,
    label: 'Open an event',
    fields: {
      event: { kind: 'ref', to: EVENT, label: 'Event', description: 'It waits its turn while another is open' },
    },
  },
  {
    effect: 'draw-event',
    kit: EVENTS,
    label: 'Draw an event',
    fields: {
      deck: { kind: 'ref', to: DECK, label: 'Deck', description: 'One of its events that can come, by weight' },
    },
  },
  {
    effect: 'later',
    kit: EVENTS,
    label: 'Do later',
    fields: {
      after: {
        kind: 'group',
        label: 'After',
        description: 'Days, choices made, or a number flag’s rise: give one',
        fields: {
          days: { kind: 'int', min: 1, optional: true, label: 'Days' },
          choices: { kind: 'int', min: 1, optional: true, label: 'Choices' },
          flag: { kind: 'ref', to: FLAG, optional: true, label: 'Flag', description: 'A number flag' },
          by: {
            kind: 'int',
            min: 1,
            optional: true,
            label: 'Risen by',
            description: 'How far the flag rises first: 1 when left out',
          },
        },
      },
      if: {
        kind: 'condition',
        optional: true,
        label: 'If',
        description: 'Checked as it comes due: while it isn’t true, it is dropped',
      },
      do: { kind: 'effects', label: 'Do' },
      id: { kind: 'text', min: 1, optional: true, label: 'Id', description: LATER_ID },
    },
  },
  {
    effect: 'cancel-later',
    kit: EVENTS,
    label: 'Cancel a consequence',
    fields: { id: { kind: 'text', min: 1, label: 'Id', description: 'The id it was booked with' } },
  },
];
