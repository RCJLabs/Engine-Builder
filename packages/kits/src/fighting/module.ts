/**
 * The fighting kit's module (M6.4, D76, docs/specs/combat.md): the stage's hits, shots and searches
 * resolved, falls kept, and the fallen mode a fallen player's game stops in. Built with project.json's
 * fighting when the game has a world to walk; without one, nothing is struck and nothing falls.
 */
import { type Beat, type Domain, defineModule, type Module, type ModuleContext } from '@eb/core';
import { ITEM } from '../inventory/types.ts';
import { ACTOR } from '../stats/types.ts';
import { fall, rise, search } from './falls.ts';
import { hit, loosed } from './hits.ts';
import { FALLEN, FIGHTING, type FightingDef, type FightingSlice } from './types.ts';
import { combatOf, hurtOf, wielded } from './weapons.ts';

type Ctx = ModuleContext<FightingSlice>;

const ACTOR_REF = { type: 'ref', to: ACTOR } as const;
const ACTOR_ARG = { actor: ACTOR_REF } as const;
const BOOL: Domain = { type: 'bool' };
const COUNT = { type: 'int', min: 0 } as const;
const STAGE = { options: () => [] };

/** A fall no hit made: the health the combat record names, run out by an effect or a status. */
function emptied(ctx: Ctx, def: FightingDef, event: Beat): void {
  const { actor, stat } = event as Beat & { actor?: unknown; stat?: unknown };
  if (typeof actor === 'string' && stat === combatOf(ctx.content, def).health) fall(ctx, def, actor, '');
}

export function fightingModule(def?: FightingDef): Module {
  return defineModule<FightingSlice>({
    id: FIGHTING,
    init: () => ({ fallen: [], searched: [], down: [] }),
    // Version 2 (M6.10) adds `down`: a version 1 save had no essential NPCs, so no one is down.
    version: 2,
    migrate: { 2: (slice) => ({ ...(slice as object), down: [] }) },
    modes: { [FALLEN]: { actions: [] } },
    actions: {
      // The stage's, never on offer: what Rapier found reaching its target, and a shot as it looses.
      hit: { run: (ctx, action) => hit(ctx, def, action), ...STAGE },
      loosed: { run: (ctx, action) => loosed(ctx, def, action), ...STAGE },
      search: { run: (ctx, action) => search(ctx, def, action), ...STAGE },
      rise: { run: (ctx, action) => rise(ctx, def, action), ...STAGE },
    },
    facts: {
      fallen: {
        args: ACTOR_ARG,
        domain: BOOL,
        label: 'has fallen',
        read: ({ state }, { actor }) => typeof actor === 'string' && state.fallen.includes(actor),
      },
      down: {
        args: ACTOR_ARG,
        domain: BOOL,
        label: 'is down for now',
        read: ({ state }, { actor }) => typeof actor === 'string' && state.down.includes(actor),
      },
      searched: {
        args: ACTOR_ARG,
        domain: BOOL,
        label: 'has been searched',
        read: ({ state }, { actor }) => typeof actor === 'string' && state.searched.includes(actor),
      },
      // What a hit by `by` takes off `on`: the preview a screen shows, as there is no roll (D76).
      hurt: {
        args: { by: ACTOR_REF, on: ACTOR_REF },
        domain: COUNT,
        label: 'what a hit takes',
        read: ({ content, fact }, { by, on }) => {
          if (def === undefined || typeof by !== 'string' || typeof on !== 'string') return undefined;
          return hurtOf(fact, combatOf(content, def), by, on, wielded(content, fact, by).weapon);
        },
      },
      weapon: {
        args: ACTOR_ARG,
        domain: { type: 'ref', to: ITEM },
        label: 'the weapon wielded',
        read: ({ content, fact }, { actor }) => {
          const item = typeof actor === 'string' ? wielded(content, fact, actor).item : '';
          return item === '' ? undefined : item;
        },
      },
    },
    events: {
      hit: { args: { by: ACTOR_REF, on: ACTOR_REF, hurt: COUNT }, label: 'A blow or a shot lands' },
      fell: { args: { ...ACTOR_ARG, by: { type: 'text' } }, label: 'An actor falls' },
      searched: { args: ACTOR_ARG, label: 'A body is searched' },
      downed: { args: { ...ACTOR_ARG, by: { type: 'text' } }, label: 'An essential actor goes down' },
      rose: { args: ACTOR_ARG, label: 'An essential actor gets up' },
      loosed: { args: { weapon: { type: 'ref', to: ITEM } }, label: 'The player looses a shot' },
    },
    // Without a world there is no fighting to read, and so nothing falls (E082 asks for it with a space).
    on: { 'stats/emptied': (ctx, event) => def && emptied(ctx, def, event) },
  });
}
