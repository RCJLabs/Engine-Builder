/**
 * A hall's offers as facts (M4.12): who stands in each slot this round, the template they were
 * rolled from, their traits and their fee, so a screen can say who a hire button hires and for
 * what. Each is worked out from the salt as the hire is, and has no value for a slot the hall
 * doesn't have or one already hired this round.
 */
import type { DeepReadonly, ModuleDef, RecordStore } from '@eb/core';
import { own } from '../own.ts';
import { STATUS } from '../stats/types.ts';
import { hallRecord, type Offer, offerAt } from './offers.ts';
import { HALL, RECRUIT, type RosterSlice } from './types.ts';

const SLOT_ARGS = { hall: { type: 'ref', to: HALL }, slot: { type: 'int', min: 0 } } as const;

/** The offer standing in a slot now, or nothing. */
function standing(
  content: RecordStore,
  slice: DeepReadonly<RosterSlice>,
  hall: unknown,
  slot: unknown,
): Offer | undefined {
  if (typeof hall !== 'string' || typeof slot !== 'number') return undefined;
  if (slot >= (hallRecord(content, hall).offers ?? 1)) return undefined;
  if (own(slice.halls, hall)?.hired?.includes(slot)) return undefined;
  return offerAt(content, slice, hall, slot);
}

const nameOf = (content: RecordStore, id: string) => {
  const name = (content.get(STATUS, id) as { name?: string } | undefined)?.name;
  return name === undefined || name === '' ? id : name;
};

export const offerFacts: ModuleDef<RosterSlice>['facts'] = {
  offer: {
    args: SLOT_ARGS,
    domain: { type: 'text' },
    label: 'who stands in a hall’s slot',
    read: ({ content, state }, { hall, slot }) => standing(content, state, hall, slot)?.name,
  },
  'offer-recruit': {
    args: SLOT_ARGS,
    domain: { type: 'ref', to: RECRUIT },
    label: 'the recruit a hall’s offer was rolled from',
    read: ({ content, state }, { hall, slot }) => standing(content, state, hall, slot)?.recruit,
  },
  'offer-traits': {
    args: SLOT_ARGS,
    domain: { type: 'text' },
    label: 'a hall’s offer’s traits, in words',
    read: ({ content, state }, { hall, slot }) => {
      const traits = standing(content, state, hall, slot)?.traits ?? [];
      return traits.length === 0 ? undefined : traits.map((trait) => nameOf(content, trait)).join(', ');
    },
  },
  'offer-fee': {
    args: { ...SLOT_ARGS, resource: { type: 'text' } },
    domain: { type: 'int', min: 0 },
    label: 'what hiring a hall’s offer costs in a resource',
    read: ({ content, state }, { hall, slot, resource }) => {
      const offer = standing(content, state, hall, slot);
      return offer === undefined ? undefined : (offer.fee[resource as string] ?? 0);
    },
  },
};
