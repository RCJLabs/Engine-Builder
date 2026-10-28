/**
 * The tactics kit's module (M7.5, D87, docs/specs/tactics.md): start-battle, the battle mode and its actions,
 * each offering what the rules allow, the odds as facts from the same shotOdds a shot rolls, and the counts.
 * Built with the world's tilemaps, which a battle is fought on.
 */
import { type Action, type DeepReadonly, defineModule, type FactView, type Module, type ModuleDef } from '@eb/core';
import { fieldOf, unitOf } from './field.ts';
import { playMove, startBattle, type Tiles } from './fight.ts';
import { shotOdds } from './odds.ts';
import { optionsOf } from './options.ts';
import { arenaOf, battleRecord } from './records.ts';
import { BATTLE, type Battle, FIGHTING_BATTLE, type Move, TACTICS, type TacticsSlice, TEAMS } from './types.ts';

type Def = ModuleDef<TacticsSlice>;
type View = FactView<TacticsSlice>;

const VERBS = ['move', 'shoot', 'watch', 'reload', 'steady', 'open', 'order', 'end'] as const;
const BATTLE_ARG = { battle: { type: 'ref', to: BATTLE } } as const;
const COUNT = { type: 'int', min: 0 } as const;
const PERCENT = { type: 'int', min: 0, max: 100 } as const;
const SHOT_ARGS = { unit: { type: 'text' }, target: { type: 'text' } } as const;

const countOf = (counts: DeepReadonly<Record<string, number>>, battle: unknown) =>
  typeof battle === 'string' && Object.hasOwn(counts, battle) ? (counts[battle] as number) : 0;

/** An action as the rules take it: the verb, and only the fields that verb reads. */
function moveOf(verb: (typeof VERBS)[number], action: Action): Move {
  const unit = action.unit as string;
  switch (verb) {
    case 'move':
      return { type: 'move', unit, to: action.to as [number, number] };
    case 'shoot':
    case 'steady':
      return { type: verb, unit, target: action.target as string };
    case 'open':
      return { type: 'open', unit, side: action.side as string };
    case 'order':
      return {
        type: 'order',
        unit,
        target: action.target as string | undefined,
        side: action.side as string | undefined,
      };
    case 'end':
      return { type: 'end' };
    default:
      return { type: verb, unit };
  }
}

/** The odds of a shot between two units of the battle under way, or undefined. */
function oddsOf(view: View, tiles: Tiles, args: Readonly<Record<string, unknown>>) {
  const battle = view.state.battle as Battle | null;
  if (!battle) return undefined;
  const [shooter, target] = [unitOf(battle, args.unit), unitOf(battle, args.target)];
  if (!shooter || !target || shooter.gun === null || shooter.side === target.side) return undefined;
  const arena = arenaOf(view.content, tiles, battle.battle);
  return shotOdds(arena, battle, fieldOf(arena, battle), shooter, target);
}

function facts(tiles: Tiles): Def['facts'] {
  return {
    'in-battle': { domain: { type: 'bool' }, label: 'in a battle', read: ({ state }) => state.battle !== null },
    round: { domain: COUNT, label: 'the round', read: ({ state }) => state.battle?.round ?? 0 },
    hit: {
      args: SHOT_ARGS,
      domain: PERCENT,
      label: 'the chance to hit',
      read: (view, args) => oddsOf(view, tiles, args)?.hit,
    },
    crit: {
      args: SHOT_ARGS,
      domain: PERCENT,
      label: 'the chance to crit',
      read: (view, args) => oddsOf(view, tiles, args)?.crit,
    },
    fought: {
      args: BATTLE_ARG,
      domain: COUNT,
      label: 'battles fought',
      read: ({ state }, { battle }) => countOf(state.fought, battle),
    },
    won: {
      args: BATTLE_ARG,
      domain: COUNT,
      label: 'battles won',
      read: ({ state }, { battle }) => countOf(state.won, battle),
    },
    lost: {
      args: BATTLE_ARG,
      domain: COUNT,
      label: 'battles lost',
      read: ({ state }, { battle }) => countOf(state.lost, battle),
    },
  };
}

const events: Def['events'] = {
  started: { args: BATTLE_ARG, label: 'A battle starts' },
  turn: {
    args: { side: { type: 'enum', values: TEAMS }, round: { type: 'int', min: 1 } },
    label: "A side's turn starts",
  },
  won: { args: BATTLE_ARG, label: 'A battle is won' },
  lost: { args: BATTLE_ARG, label: 'A battle is lost' },
};

/** What the crew may do now, of one verb, as payloads. The foes' turn is the AI's, offered to no one. */
function offered(view: View, tiles: Tiles, verb: (typeof VERBS)[number]) {
  const battle = view.state.battle as Battle | null;
  if (battle?.side !== 'crew') return [];
  return optionsOf(arenaOf(view.content, tiles, battle.battle), battle)
    .filter((move) => move.type === verb)
    .map(({ type: _, ...payload }) => payload);
}

export function tacticsModule(tiles: Tiles = {}): Module {
  return defineModule<TacticsSlice>({
    id: TACTICS,
    init: () => ({ battle: null, fought: {}, won: {}, lost: {} }),
    actions: Object.fromEntries(
      VERBS.map((verb) => [
        verb,
        {
          run: (ctx, action) => playMove(ctx, tiles, moveOf(verb, action)),
          options: (view) => offered(view, tiles, verb),
        },
      ]),
    ),
    facts: facts(tiles),
    events,
    effects: {
      'start-battle': {
        run: (ctx, effect) => startBattle(ctx, tiles, effect),
        preview: (ctx, effect) => {
          const record = battleRecord(ctx.content, effect.battle);
          return {
            space: record.space,
            crew: record.crew.map((post) => post.actor),
            foes: record.foes.map((post) => post.actor),
          };
        },
      },
    },
    modes: { [FIGHTING_BATTLE]: { actions: [`${TACTICS}/*`] } },
  });
}
