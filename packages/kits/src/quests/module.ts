/**
 * The quests kit's module (M3.9, D47, docs/specs/quests.md): quests started by an effect, with
 * the game or when a condition holds, moved on as their objectives are done, and failed on a
 * condition or a deadline. It hears every event, as the events kit does, to count and check.
 * M3.10 (D48) fills a quest's slots as it starts, runs it again when it repeats, and seals its jobs.
 * M6.7 (D79) builds it with the pack's places, where its slots can find spaces and what is in them.
 */
import {
  defineModule,
  evaluate,
  type Module,
  type ModuleDef,
  NO_PLACES,
  type RecordStore,
  type WorldPlaces,
} from '@eb/core';
import { own } from '../own.ts';
import { facts, QUEST_ARG, TEXT } from './facts.ts';
import { questShown } from './journal.ts';
import { namedStage, questRecord } from './records.ts';
import { fail } from './run.ts';
import { canStart, hear, setStage, startQuest, startWaiting } from './start.ts';
import { track, withTracked } from './tracking.ts';
import { QUEST, QUESTS, type QuestsSlice } from './types.ts';

type Def = ModuleDef<QuestsSlice>;

/** What the journal says of a quest failed by fail-quest with no why. */
const GIVEN_UP = 'It was given up.';

const events: Def['events'] = {
  started: { args: { ...QUEST_ARG, stage: TEXT }, label: 'A quest starts' },
  staged: { args: { ...QUEST_ARG, stage: TEXT }, label: 'A quest reaches a stage' },
  'objective-done': { args: { ...QUEST_ARG, stage: TEXT, objective: TEXT }, label: 'An objective is done' },
  done: { args: QUEST_ARG, label: 'A quest is done' },
  failed: { args: { ...QUEST_ARG, why: TEXT }, label: 'A quest fails' },
  refused: { args: { ...QUEST_ARG, stage: TEXT, reason: TEXT }, label: 'A stage’s effects are refused' },
  gone: { args: { ...QUEST_ARG, slot: TEXT, record: TEXT }, label: 'A slot’s record is gone' },
};

/** The kit's module, its handlers reaching the places as well as the kernel's context. */
export function questsModule(places: WorldPlaces = NO_PLACES): Module {
  const at = <C extends object>(ctx: C): C & { places: WorldPlaces } => ({ ...ctx, places });
  return defineModule<QuestsSlice>({
    id: QUESTS,
    // Version 2 (M3.10) adds an entry's slots, lost, times and again, which a quest of version 1
    // has none of: its entries load as they are. Version 3 (M6.6) adds the tracked quest.
    version: 3,
    migrate: { 2: (slice) => slice, 3: withTracked },
    init: () => ({ quests: {} }),
    // Quests that start with the game, then those whose start holds already.
    start: (kernel) => {
      const ctx = at(kernel);
      for (const id of ctx.content.ids(QUEST))
        if (questRecord(ctx.content, id)['at-start'] === true) startQuest(ctx, id);
      startWaiting(ctx);
    },
    facts: {
      ...facts,
      // M6.9: whether start-quest would start it now, its slots found in the places.
      'can-start': {
        args: QUEST_ARG,
        domain: { type: 'bool' },
        label: 'can start',
        describe: (test) => (test.op === undefined ? `${String(test.args?.quest)} can start` : undefined),
        read: ({ content, state, fact }, { quest }) =>
          canStart(
            {
              content,
              places,
              read: () => state,
              fact,
              check: (condition) => evaluate(condition, (test) => fact(test.fact, test.args)),
            },
            questKey(content, quest),
          ),
      },
    },
    events,
    actions: {
      // The journal's Track (M6.6): outside play, so it takes no mode's leave and no bot takes it.
      track: { run: (ctx, action) => track(ctx, action.quest), anyMode: true },
    },
    effects: {
      'start-quest': {
        run: (ctx, effect) => {
          const quest = questKey(ctx.content, effect.quest);
          const slot = startQuest(at(ctx), quest);
          if (slot !== undefined) ctx.refuse('unfilled', { quest, slot });
        },
        preview: (ctx, effect) => questShown(at(ctx), questKey(ctx.content, effect.quest)),
      },
      'set-stage': {
        run: (ctx, effect) => {
          const quest = questKey(ctx.content, effect.quest);
          const slot = setStage(at(ctx), quest, stageKey(ctx.content, effect));
          if (slot !== undefined) ctx.refuse('unfilled', { quest, slot });
        },
        preview: (ctx, effect) => {
          const quest = questKey(ctx.content, effect.quest);
          const stage = stageKey(ctx.content, effect);
          const from = own(ctx.read().quests, quest)?.stage;
          return from === undefined ? { quest, stage } : { quest, stage, from };
        },
      },
      'fail-quest': {
        run: (ctx, effect) => fail(at(ctx), questKey(ctx.content, effect.quest), whyOf(effect)),
        preview: (ctx, effect) => ({ quest: questKey(ctx.content, effect.quest), why: whyOf(effect) }),
      },
    },
    on: { '*': (ctx, event) => hear(at(ctx), event) },
  });
}

/** The quest's id, once it is known to be one. */
function questKey(content: RecordStore, id: unknown): string {
  questRecord(content, id);
  return id as string;
}

/** The effect's stage, once its quest is known to have it. */
function stageKey(content: RecordStore, effect: Readonly<Record<string, unknown>>): string {
  return namedStage(content, effect.quest, effect.stage).id;
}

const whyOf = (effect: Readonly<Record<string, unknown>>) => (typeof effect.why === 'string' ? effect.why : GIVEN_UP);
