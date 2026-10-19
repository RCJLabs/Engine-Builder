/**
 * The quests kit's facts (docs/specs/quests.md#facts): a quest's state, stage, log, objectives and
 * counts, how many quests are in a state, and M3.10's slots, who is away and runs counted. Each is
 * worded by the ids it names ("pay of debt is done").
 */
import { type FactTest, type ModuleDef, OP_WORDS } from '@eb/core';
import { own } from '../own.ts';
import { namedObjective, namedSlot, namedStage, questRecord } from './records.ts';
import { isAway } from './slots.ts';
import { QUEST, QUEST_STATES, type QuestsSlice } from './types.ts';

type Def = ModuleDef<QuestsSlice>;

export const QUEST_ARG = { quest: { type: 'ref', to: QUEST } } as const;
export const TEXT = { type: 'text' } as const;
const COUNT = { type: 'int', min: 0 } as const;
const STATE = { type: 'enum', values: QUEST_STATES } as const;

const arg = (test: FactTest, key: string) => String(test.args?.[key]);
// "the count of dig of debt is at least 2": tests in words by the ids they name.
const compared = (subject: (test: FactTest) => string) => (test: FactTest) =>
  test.op === undefined ? undefined : `${subject(test)} ${OP_WORDS[test.op]} ${String(test.value)}`;
const equals = (said: (test: FactTest, not: boolean) => string) => (test: FactTest) =>
  test.op === '==' || test.op === '!=' ? said(test, test.op === '!=') : undefined;

export const facts: Def['facts'] = {
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
  slot: {
    args: { ...QUEST_ARG, slot: TEXT },
    domain: TEXT,
    label: 'slot',
    describe: equals(
      (test, not) => `the ${arg(test, 'slot')} of ${arg(test, 'quest')} is ${not ? 'not ' : ''}${String(test.value)}`,
    ),
    read: ({ content, state }, { quest, slot }) => {
      namedSlot(content, quest, slot);
      return own(own(state.quests, quest as string)?.slots ?? {}, slot as string);
    },
  },
  away: {
    args: { record: TEXT },
    domain: { type: 'bool' },
    label: 'away',
    describe: (test) => (test.op === undefined ? `${arg(test, 'record')} is away` : undefined),
    read: ({ content, state }, { record }) => isAway({ content, read: () => state }, record as string),
  },
  times: {
    args: { ...QUEST_ARG, state: { type: 'enum', values: ['done', 'failed'] } },
    domain: COUNT,
    label: 'times a quest ended so',
    describe: compared((test) => `the times ${arg(test, 'quest')} was ${arg(test, 'state')}`),
    read: ({ content, state }, { quest, state: ended }) => {
      questRecord(content, quest);
      const entry = own(state.quests, quest as string);
      const past = entry?.times?.[ended as 'done' | 'failed'] ?? 0;
      return past + (entry?.state === ended ? 1 : 0);
    },
  },
};
