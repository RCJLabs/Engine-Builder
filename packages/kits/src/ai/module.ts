/**
 * The ai kit's module (M6.3, D75, docs/specs/ai.md): each placed actor with a behaviour runs it as
 * a new game starts and after every event, as the quests kit hears every event, setting the goals
 * the stage walks (D74); and the stage's ai/sensed keeps each NPC's awareness of the player. Built
 * with the calendar, whose `hours` unit and weekdays its guards read.
 */
import {
  type Calendar,
  type CalendarDef,
  calendarOf,
  type Domain,
  defineModule,
  type Module,
  type ModuleContext,
  type RecordStore,
  ticksOf,
} from '@eb/core';
import { own } from '../own.ts';
import { ACTOR } from '../stats/types.ts';
import { sensed } from './aware.ts';
import type { Now } from './choose.ts';
import type { Ai } from './goals.ts';
import { kindOf, nodeAt } from './nodes.ts';
import { runBehaviour } from './run.ts';
import {
  AI,
  type AiSlice,
  BEHAVIOUR,
  type BehaviourNode,
  type BehaviourRecord,
  LEAVES,
  LEVELS,
  levelOf,
  SIGHT_M,
} from './types.ts';

type Ctx = ModuleContext<AiSlice>;

const ACTOR_ARG = { actor: { type: 'ref', to: ACTOR } } as const;
const DOING: Domain = { type: 'enum', values: [...LEAVES] };
const LEVEL: Domain = { type: 'enum', values: [...LEVELS] };

interface Behaving {
  readonly actor: string;
  readonly tree: BehaviourNode;
  readonly sight: number;
}

/** The actors with a behaviour, in id order, each with its tree and how far it sees. */
function behaving(content: RecordStore): Behaving[] {
  return content.ids(ACTOR).flatMap((actor) => {
    const record = content.get(ACTOR, actor) as { behaviour?: unknown; sight?: unknown } | undefined;
    const id = record?.behaviour;
    const behaviour = typeof id === 'string' ? (content.get(BEHAVIOUR, id) as BehaviourRecord | undefined) : undefined;
    if (!behaviour) return [];
    const sight = typeof record?.sight === 'number' ? record.sight : SIGHT_M;
    return [{ actor, tree: behaviour.do, sight }];
  });
}

const spaceOf = (ctx: Ctx, actor: string) => ctx.fact('world.npc-space', { actor }) as string | undefined;

function aiOf(ctx: Ctx, calendar: Calendar): Ai {
  const npcs = () => (ctx.write() as { npcs: Record<string, AiSlice['npcs'][string]> }).npcs;
  return {
    npc: (actor) => own(ctx.read().npcs, actor),
    save: (actor, run) => {
      npcs()[actor] = run;
    },
    doing: (actor, leaf) => ctx.emit('doing', { actor, doing: leaf ?? 'nothing' }),
    ticks: (length) => ticksOf(calendar, length),
    arrivedAt: (actor) => ctx.fact('world.npc-at', { actor }) as string | undefined,
    draw: (actor, n) => ctx.rng(`npc-${actor}`).int(0, n - 1),
    apply: (effect) => ctx.apply(effect),
  };
}

function nowOf(ctx: Ctx, calendar: Calendar): Now {
  const tick = ctx.fact('time.tick') as number;
  const hours = calendar.units.hours;
  const ofDay = hours === undefined ? undefined : (ctx.fact('time.of-day') as number);
  const weekday = calendar.def.weekdays ? (ctx.fact('time.weekday') as string) : undefined;
  return {
    tick,
    ...(hours !== undefined && ofDay !== undefined ? { hour: Math.floor(ofDay / hours) } : {}),
    ...(weekday !== undefined ? { weekday } : {}),
    check: (condition) => ctx.check(condition),
  };
}

/** Every placed actor's behaviour run on. One placed nowhere has nothing to walk, and E081 keeps it from content. */
function runAll(ctx: Ctx, calendar: Calendar): void {
  const list = behaving(ctx.content);
  if (list.length === 0) return;
  const ai = aiOf(ctx, calendar);
  const now = nowOf(ctx, calendar);
  for (const { actor, tree } of list) if (spaceOf(ctx, actor) !== undefined) runBehaviour(ai, actor, tree, now);
}

export function aiModule(def: CalendarDef): Module {
  const calendar = calendarOf(def);
  return defineModule<AiSlice>({
    id: AI,
    init: () => ({ npcs: {}, aware: {} }),
    start: (ctx) => runAll(ctx, calendar),
    actions: {
      // The stage's, never on offer: what the NPCs near the player sensed in the last real second.
      sensed: {
        run: (ctx, action) =>
          sensed(ctx, action, (space) => {
            const list = behaving(ctx.content).filter(({ actor }) => spaceOf(ctx, actor) === space);
            return new Map(list.map(({ actor, sight }) => [actor, sight]));
          }),
        options: () => [],
      },
    },
    facts: {
      doing: {
        args: ACTOR_ARG,
        domain: DOING,
        label: 'what the NPC is doing',
        read: ({ state, content }, { actor }) => {
          const leaf = typeof actor === 'string' ? own(state.npcs, actor)?.leaf : undefined;
          const tree = leaf === undefined ? undefined : behaving(content).find((b) => b.actor === actor)?.tree;
          return tree === undefined || leaf === undefined ? undefined : kindOf(nodeAt(tree, leaf));
        },
      },
      awareness: {
        args: ACTOR_ARG,
        domain: { type: 'int', min: 0, max: 100 },
        label: 'how aware the NPC is of the player',
        read: ({ state }, { actor }) => (typeof actor === 'string' ? (own(state.aware, actor) ?? 0) : undefined),
      },
      level: {
        args: ACTOR_ARG,
        domain: LEVEL,
        label: 'unaware, suspicious or alerted',
        read: ({ state }, { actor }) => (typeof actor === 'string' ? levelOf(own(state.aware, actor) ?? 0) : undefined),
      },
    },
    events: {
      doing: {
        args: { ...ACTOR_ARG, doing: { type: 'enum', values: [...LEAVES, 'nothing'] } },
        label: 'An NPC starts something else',
      },
      aware: { args: { ...ACTOR_ARG, level: LEVEL }, label: 'An NPC grows more or less aware of the player' },
    },
    on: {
      // Its own ai/doing changes nothing a behaviour reads; everything else might.
      'ai/doing': () => {},
      '*': (ctx) => runAll(ctx, calendar),
    },
  });
}
