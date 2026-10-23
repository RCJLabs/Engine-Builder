/**
 * The encounters kit's module (M4.7, D57, docs/specs/encounters.md): the fight effect, worked out
 * round by round and rolled once, its preview the table it rolls. Built knowing whether the
 * roster kit is on, since only then do its members fight when a fight names nobody, and leave
 * when they fall: a module can't ask whether another's fact exists.
 */
import { defineModule, type Module, type ModuleDef } from '@eb/core';
import { ACTOR } from '../stats/types.ts';
import { fight, fightShown } from './fight.ts';
import type { Built } from './lines.ts';
import { ENCOUNTER, ENCOUNTERS, type EncountersSlice } from './types.ts';

type Def = ModuleDef<EncountersSlice>;

const ENCOUNTER_ARG = { encounter: { type: 'ref', to: ENCOUNTER } } as const;
const COUNT = { type: 'int', min: 0 } as const;

const countOf = (counts: Readonly<Record<string, number>>, encounter: unknown) =>
  typeof encounter === 'string' && Object.hasOwn(counts, encounter) ? (counts[encounter] as number) : 0;

const facts: Def['facts'] = {
  fought: {
    args: ENCOUNTER_ARG,
    domain: COUNT,
    label: 'fights',
    read: ({ state }, { encounter }) => countOf(state.fought, encounter),
  },
  won: {
    args: ENCOUNTER_ARG,
    domain: COUNT,
    label: 'fights won',
    read: ({ state }, { encounter }) => countOf(state.won, encounter),
  },
  lost: {
    args: ENCOUNTER_ARG,
    domain: COUNT,
    label: 'fights lost',
    read: ({ state }, { encounter }) => countOf(state.lost, encounter),
  },
};

const events: Def['events'] = {
  fought: {
    args: { ...ENCOUNTER_ARG, result: { type: 'text' }, hurt: COUNT, roll: { type: 'int', min: 1 } },
    label: 'A fight is fought',
  },
  fell: { args: { ...ENCOUNTER_ARG, actor: { type: 'ref', to: ACTOR } }, label: 'One of the party falls' },
};

export function encountersModule(roster: boolean): Module {
  const built: Built = { roster };
  return defineModule<EncountersSlice>({
    id: ENCOUNTERS,
    init: () => ({ fought: {}, won: {}, lost: {} }),
    facts,
    events,
    effects: {
      fight: {
        run: (ctx, effect) => fight(ctx, built, effect),
        preview: (ctx, effect) => fightShown(ctx, built, effect, ctx.preview),
      },
    },
  });
}
