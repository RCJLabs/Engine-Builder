/**
 * The factions kit's module (M3.5, D43, docs/specs/factions.md): the party's standing with each
 * faction, its band, the share of a shop's prices the band sets, and drift as each day starts.
 * Drift hears every event and picks out `time/day-started`, since a game may have no time module.
 */
import { defineModule, type FactTest, OP_WORDS } from '@eb/core';
import { bandOf, changeStanding, drift, factionRecord, priceOf, reached, standingOf, within } from './standing.ts';
import { FACTION, FACTIONS, type FactionsSlice } from './types.ts';

const FACTION_ARG = { faction: { type: 'ref', to: FACTION } } as const;

// "grimsgarth’s standing is at least 10": a test in words by the faction's id, as a flag's are.
const whose = (what: string) => (test: FactTest) =>
  test.op === undefined
    ? undefined
    : `${String(test.args?.faction)}’s ${what} ${OP_WORDS[test.op]} ${String(test.value)}`;

export const factionsKit = defineModule<FactionsSlice>({
  id: FACTIONS,
  init: () => ({ standing: {} }),
  facts: {
    standing: {
      args: FACTION_ARG,
      domain: { type: 'int' },
      label: 'standing',
      describe: whose('standing'),
      read: ({ content, state }, { faction }) => standingOf(content, state, faction as string),
    },
    band: {
      args: FACTION_ARG,
      domain: { type: 'text' },
      label: 'the band',
      describe: whose('band'),
      read: ({ content, state }, { faction }) =>
        bandOf(factionRecord(content, faction), standingOf(content, state, faction as string))?.id,
    },
    reached: {
      args: { ...FACTION_ARG, band: { type: 'text' } },
      domain: { type: 'bool' },
      label: 'at least the band',
      describe: (test) =>
        test.op === undefined ? `${String(test.args?.faction)} is at least ${String(test.args?.band)}` : undefined,
      read: ({ content, state }, { faction, band }) =>
        reached(
          factionRecord(content, faction),
          faction as string,
          band,
          standingOf(content, state, faction as string),
        ),
    },
    price: {
      args: FACTION_ARG,
      domain: { type: 'int', min: 0 },
      label: 'the price share',
      describe: whose('price share'),
      read: ({ content, state }, { faction }) =>
        priceOf(factionRecord(content, faction), standingOf(content, state, faction as string)),
    },
  },
  effects: {
    'change-standing': {
      run: (ctx, effect) => changeStanding(ctx, effect.faction as string, effect.by),
      preview: (ctx, effect) => {
        const id = effect.faction as string;
        const faction = factionRecord(ctx.content, id);
        const from = standingOf(ctx.content, ctx.read(), id);
        const to = Number.isSafeInteger(effect.by) ? within(faction, from + (effect.by as number)) : from;
        const banded = (faction.bands ?? []).length > 0;
        return {
          faction: id,
          from,
          to,
          ...(banded ? { band: { from: bandOf(faction, from)?.id, to: bandOf(faction, to)?.id } } : {}),
        };
      },
    },
  },
  on: {
    '*': (ctx, event) => {
      if (event.type === 'time/day-started') drift(ctx, event.day as number);
    },
  },
  events: {
    'standing-changed': {
      args: { ...FACTION_ARG, by: { type: 'int' }, to: { type: 'int' } },
      label: 'Standing changes',
    },
    'band-changed': {
      args: { ...FACTION_ARG, from: { type: 'text' }, to: { type: 'text' } },
      label: 'A faction’s band changes',
    },
  },
});
