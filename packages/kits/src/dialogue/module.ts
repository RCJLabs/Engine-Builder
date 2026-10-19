/**
 * The dialogue kit's module (M3.8, D46, docs/specs/dialogue.md): talks opened at the line their
 * starts give, in the mode `talking`, and said through to their end, each option an event's
 * choice that leads to a line. Built knowing whether the economy kit is on, since only then is a
 * cost charged (W119): a module can't ask whether another's effect exists.
 */
import { defineModule, type FactTest, type Module, type ModuleContext, type ModuleDef, OP_WORDS } from '@eb/core';
import type { Choosing } from '../events/choices.ts';
import { own } from '../own.ts';
import { openTalk } from './open.ts';
import { namedLine, namedOption } from './records.ts';
import { goOn, say } from './say.ts';
import { DIALOGUE, type DialogueSlice, TALK, TALKING } from './types.ts';
import { openOptions, sayOptions, talkView } from './view.ts';

type Def = ModuleDef<DialogueSlice>;

const TALK_ARG = { talk: { type: 'ref', to: TALK } } as const;
const TEXT = { type: 'text' } as const;
const COUNT = { type: 'int', min: 0 } as const;

const arg = (test: FactTest, key: string) => String(test.args?.[key]);
// "the times beta has been heard in marge is at least 1": tests in words by the ids they name.
const compared = (subject: (test: FactTest) => string) => (test: FactTest) =>
  test.op === undefined ? undefined : `${subject(test)} ${OP_WORDS[test.op]} ${String(test.value)}`;

const facts: Def['facts'] = {
  open: { domain: { type: 'ref', to: TALK }, label: 'the open talk', read: ({ state }) => state.open?.talk },
  talked: {
    args: TALK_ARG,
    domain: COUNT,
    label: 'times talked to',
    describe: compared((test) => `the times ${arg(test, 'talk')} has been talked to`),
    read: ({ state }, { talk }) => own(state.talked, talk as string) ?? 0,
  },
  heard: {
    args: { ...TALK_ARG, line: TEXT },
    domain: COUNT,
    label: 'times heard',
    describe: compared((test) => `the times ${arg(test, 'line')} has been heard in ${arg(test, 'talk')}`),
    read: ({ content, state }, { talk, line }) => {
      namedLine(content, talk, line);
      return own(own(state.heard, talk as string) ?? {}, line as string) ?? 0;
    },
  },
  said: {
    args: { ...TALK_ARG, option: TEXT },
    domain: { type: 'bool' },
    label: 'said',
    describe: (test) => (test.op === undefined ? `${arg(test, 'option')} was said to ${arg(test, 'talk')}` : undefined),
    read: ({ content, state }, { talk, option }) => {
      namedOption(content, talk, option);
      return own(state.said, talk as string)?.includes(option as string) ?? false;
    },
  },
};

const events: Def['events'] = {
  opened: { args: { ...TALK_ARG, line: TEXT }, label: 'A talk opens' },
  heard: { args: { ...TALK_ARG, line: TEXT }, label: 'A line is heard' },
  said: { args: { ...TALK_ARG, line: TEXT, option: TEXT }, label: 'An option is said' },
  rolled: {
    args: { ...TALK_ARG, option: TEXT, outcome: COUNT, roll: { type: 'int', min: 1, max: 100 } },
    label: 'An option’s outcome is rolled',
  },
  ended: { args: TALK_ARG, label: 'A talk ends' },
  'nothing-to-say': { args: TALK_ARG, label: 'A talk has nothing to say' },
};

export function dialogueModule(economy: boolean): Module {
  const choosingOf = (view: Omit<Choosing, 'costs'>): Choosing => ({
    content: view.content,
    fact: view.fact,
    check: view.check,
    costs: economy,
  });
  const inTalk = (view: { mode: { id: string }; state: { open?: unknown } }) =>
    view.mode.id === TALKING && view.state.open !== undefined;

  return defineModule<DialogueSlice>({
    id: DIALOGUE,
    init: () => ({ waiting: [], talked: {}, heard: {}, said: {} }),
    facts,
    effects: {
      'open-talk': {
        run: (ctx: ModuleContext<DialogueSlice>, effect) => openTalk(ctx, choosingOf(ctx), effect.talk),
        preview: (ctx, effect) => talkView(choosingOf(ctx), ctx.read(), effect.talk, ctx.preview),
      },
    },
    events,
    actions: {
      say: {
        run: (ctx, action) => say(ctx, choosingOf(ctx), action.option),
        options: (view) => (inTalk(view) ? sayOptions(choosingOf(view), view.state) : []),
      },
      'go-on': {
        run: (ctx) => goOn(ctx, choosingOf(ctx)),
        options: (view) => {
          const { open } = view.state;
          if (!inTalk(view) || open === undefined) return [];
          return openOptions(choosingOf(view), view.state, open).length === 0 ? [{}] : [];
        },
      },
    },
    modes: { [TALKING]: { actions: [`${DIALOGUE}/*`] } },
  });
}
