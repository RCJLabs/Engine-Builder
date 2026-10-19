/**
 * The quests kit's module (M3.9, D47, docs/specs/quests.md): quests started by an effect, with
 * the game or when a condition holds, moved on as their objectives are done, and failed on a
 * condition or a deadline. It hears every event, as the events kit does, to count and check.
 */
import { defineModule, type FactTest, type Module, type ModuleDef, OP_WORDS, type RecordStore } from '@eb/core';
import { own } from '../own.ts';
import { questShown } from './journal.ts';
import { namedObjective, namedStage, questRecord } from './records.ts';
import { fail, hear, setStage, startQuest, startWaiting } from './run.ts';
import { QUEST, QUEST_STATES, QUESTS, type QuestsSlice } from './types.ts';

type Def = ModuleDef<QuestsSlice>;

const QUEST_ARG = { quest: { type: 'ref', to: QUEST } } as const;
const TEXT = { type: 'text' } as const;
const COUNT = { type: 'int', min: 0 } as const;
const STATE = { type: 'enum', values: QUEST_STATES } as const;
/** What the journal says of a quest failed by fail-quest with no why. */
const GIVEN_UP = 'It was given up.';

const arg = (test: FactTest, key: string) => String(test.args?.[key]);
// "the count of dig of debt is at least 2": tests in words by the ids they name.
const compared = (subject: (test: FactTest) => string) => (test: FactTest) =>
  test.op === undefined ? undefined : `${subject(test)} ${OP_WORDS[test.op]} ${String(test.value)}`;
const equals = (said: (test: FactTest, not: boolean) => string) => (test: FactTest) =>
  test.op === '==' || test.op === '!=' ? said(test, test.op === '!=') : undefined;

const facts: Def['facts'] = {
  state: {
    args: QUEST_ARG,
    domain: STATE,
    label: 'state',
    describe: equals((test, not) => `${arg(test, 'quest')} is ${not ? 'not ' : ''}${String(test.value)}`),
    read: ({ content, state }, { quest }) => {
      questRecord(content, quest);
      return own(state.quests, quest as string)?.state ?? 'waiting';
    },
  },
  stage: {
    args: QUEST_ARG,
    domain: TEXT,
    label: 'stage',
    describe: equals((test, not) => `${arg(test, 'quest')} is ${not ? 'not ' : ''}at its stage ${String(test.value)}`),
    read: ({ content, state }, { quest }) => {
      questRecord(content, quest);
      return own(state.quests, quest as string)?.stage;
    },
  },
  reached: {
    args: { ...QUEST_ARG, stage: TEXT },
    domain: { type: 'bool' },
    label: 'reached',
    describe: (test) => (test.op === undefined ? `${arg(test, 'quest')} has reached ${arg(test, 'stage')}` : undefined),
    read: ({ content, state }, { quest, stage }) => {
      namedStage(content, quest, stage);
      return own(state.quests, quest as string)?.log.includes(stage as string) ?? false;
    },
  },
  objective: {
    args: { ...QUEST_ARG, objective: TEXT },
    domain: { type: 'bool' },
    label: 'objective done',
    describe: (test) =>
      test.op === undefined ? `${arg(test, 'objective')} of ${arg(test, 'quest')} is done` : undefined,
    read: ({ content, state }, { quest, objective }) => {
      namedObjective(content, quest, objective);
      return own(state.quests, quest as string)?.done.includes(objective as string) ?? false;
    },
  },
  count: {
    args: { ...QUEST_ARG, objective: TEXT },
    domain: COUNT,
    label: 'objective count',
    describe: compared((test) => `the count of ${arg(test, 'objective')} of ${arg(test, 'quest')}`),
    read: ({ content, state }, { quest, objective }) => {
      namedObjective(content, quest, objective);
      return own(own(state.quests, quest as string)?.counts ?? {}, objective as string) ?? 0;
    },
  },
  tally: {
    args: { state: STATE },
    domain: COUNT,
    label: 'quests in a state',
    describe: compared((test) => `the number of quests ${arg(test, 'state')}`),
    read: ({ content, state }, { state: wanted }) => {
      const ids = content.ids(QUEST);
      return ids.filter((id) => (own(state.quests, id)?.state ?? 'waiting') === wanted).length;
    },
  },
};

const events: Def['events'] = {
  started: { args: { ...QUEST_ARG, stage: TEXT }, label: 'A quest starts' },
  staged: { args: { ...QUEST_ARG, stage: TEXT }, label: 'A quest reaches a stage' },
  'objective-done': { args: { ...QUEST_ARG, stage: TEXT, objective: TEXT }, label: 'An objective is done' },
  done: { args: QUEST_ARG, label: 'A quest is done' },
  failed: { args: { ...QUEST_ARG, why: TEXT }, label: 'A quest fails' },
};

export const questsModule: Module = defineModule<QuestsSlice>({
  id: QUESTS,
  init: () => ({ quests: {} }),
  // Quests that start with the game, then those whose start holds already.
  start: (ctx) => {
    for (const id of ctx.content.ids(QUEST)) if (questRecord(ctx.content, id)['at-start'] === true) startQuest(ctx, id);
    startWaiting(ctx);
  },
  facts,
  events,
  effects: {
    'start-quest': {
      run: (ctx, effect) => startQuest(ctx, questKey(ctx.content, effect.quest)),
      preview: (ctx, effect) => questShown(ctx.content, ctx.read(), questKey(ctx.content, effect.quest)),
    },
    'set-stage': {
      run: (ctx, effect) => setStage(ctx, questKey(ctx.content, effect.quest), stageKey(ctx.content, effect)),
      preview: (ctx, effect) => {
        const quest = questKey(ctx.content, effect.quest);
        const stage = stageKey(ctx.content, effect);
        const from = own(ctx.read().quests, quest)?.stage;
        return from === undefined ? { quest, stage } : { quest, stage, from };
      },
    },
    'fail-quest': {
      run: (ctx, effect) => fail(ctx, questKey(ctx.content, effect.quest), whyOf(effect)),
      preview: (ctx, effect) => ({ quest: questKey(ctx.content, effect.quest), why: whyOf(effect) }),
    },
  },
  on: { '*': hear },
});

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
