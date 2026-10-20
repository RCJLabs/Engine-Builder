/**
 * The maps kit's module (M4.6, D56, docs/specs/maps.md): maps entered by an effect, travelled by
 * the action maps/travel, and arrived at. Built knowing whether the economy kit is on, since only
 * then is a cost charged, and with the calendar when the time kit is, since only then does a move
 * take time: a module can't ask whether another's effect exists.
 */
import { type CalendarDef, calendarOf, defineModule, type Module, type ModuleDef } from '@eb/core';
import type { Choosing } from '../events/choices.ts';
import { arrive, enterMap, revealMap } from './arrive.ts';
import { facts } from './facts.ts';
import { type Built, setOff, travelOf, travels, travelVerdict } from './travel.ts';
import { MAP, MAPS, type MapsSlice, NODE_KIND } from './types.ts';

type Def = ModuleDef<MapsSlice>;

const events: Def['events'] = {
  entered: { args: { map: { type: 'ref', to: MAP } }, label: 'A map is entered' },
  arrived: {
    args: { map: { type: 'ref', to: MAP }, node: { type: 'text' }, kind: { type: 'ref', to: NODE_KIND } },
    label: 'The party arrives at a node',
  },
};

export function mapsModule(economy: boolean, calendar?: CalendarDef): Module {
  const built: Built = calendar ? { economy, calendar: calendarOf(calendar) } : { economy };
  const choosingOf = (view: Omit<Choosing, 'costs'>): Choosing => ({
    content: view.content,
    fact: view.fact,
    check: view.check,
    costs: economy,
  });

  return defineModule<MapsSlice>({
    id: MAPS,
    init: () => ({ visited: [], known: [], entered: 0 }),
    facts,
    events,
    effects: {
      'enter-map': (ctx, effect) => enterMap(ctx, effect.map, effect.at),
      'reveal-map': (ctx, effect) => revealMap(ctx, effect.reach),
    },
    actions: {
      travel: {
        run: (ctx, action) => {
          const travel = travelOf(ctx.content, ctx.read() as MapsSlice, action.move, action.to, built);
          if (!travel) return ctx.refuse('out-of-reach', { move: String(action.move), to: String(action.to) });
          const verdict = travelVerdict(choosingOf(ctx), travel);
          if (!verdict.ok) {
            return ctx.refuse(
              verdict.reason,
              verdict.reason === 'cant-afford' ? { ...verdict.short } : { move: travel.move.id },
            );
          }
          setOff(ctx, travel, built);
          arrive(ctx, travel.to);
        },
        options: (view) =>
          travels(view.content, view.state as MapsSlice, built)
            .filter((travel) => travelVerdict(choosingOf(view), travel).ok)
            .map((travel) => ({ move: travel.move.id, to: travel.to })),
      },
    },
  });
}
