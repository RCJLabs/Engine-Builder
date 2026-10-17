/**
 * "Salvage run": a test-only text game for the sim kernel. A crew jumps from sector to sector,
 * meets choice events from content, loots wrecks, sells salvage and gets hurt, until the crew
 * is lost or day 30 brings them home. Three modules that only reach each other through facts
 * and effects, as kits will, plus the logic module for rolls. Choices are locked by conditions
 * in content, and their odds come from roll effects.
 */
import {
  type Condition,
  createGame,
  createRecordStore,
  type DeepReadonly,
  defineModule,
  type Effect,
  type GameState,
  logicModule,
  Rng,
} from '../src/index.ts';

export interface Choice {
  /** Offered, and allowed, only while this holds. */
  when?: Condition;
  effects: Effect[];
}
interface EventRecord {
  choices: Record<string, Choice>;
}

export const content = createRecordStore({
  item: { medkit: { value: 15 }, salvage: { value: 5 } },
  'loot-table': {
    'dead-hauler': {
      entries: [
        { item: 'salvage', weight: 3 },
        { item: 'medkit', weight: 1 },
      ],
    },
  },
  event: {
    derelict: {
      choices: {
        board: {
          effects: [
            {
              effect: 'roll',
              outcomes: [
                { chance: 70, text: 'Salvage in the hold', effects: [{ effect: 'loot', table: 'dead-hauler' }] },
                { chance: 30, text: 'The hull gives way', effects: [{ effect: 'wound', hp: 3 }] },
              ],
            },
          ],
        },
        leave: { effects: [] },
      },
    },
    trader: {
      choices: {
        sell: {
          when: { fact: 'hold.count', args: { item: 'salvage' }, op: '>=', value: 1 },
          effects: [{ effect: 'sell', item: 'salvage' }],
        },
        leave: { effects: [] },
      },
    },
    raiders: {
      choices: {
        fight: {
          effects: [
            {
              effect: 'roll',
              outcomes: [
                {
                  chance: 50,
                  effects: [
                    { effect: 'wound', hp: 2 },
                    { effect: 'loot', table: 'dead-hauler' },
                  ],
                },
                { chance: 50, effects: [{ effect: 'wound', hp: 4 }] },
              ],
            },
          ],
        },
        pay: { when: { fact: 'hold.credits', op: '>=', value: 10 }, effects: [{ effect: 'credits', delta: -10 }] },
      },
    },
    'quiet-sector': { choices: { rest: { effects: [{ effect: 'heal', hp: 2 }] } } },
  },
});

export const sim = { content };
const HOME_DAY = 30;

interface Crew {
  members: Record<string, { hp: number; max: number }>;
}

const living = (crew: DeepReadonly<Crew>) => Object.keys(crew.members).filter((id) => (crew.members[id]?.hp ?? 0) > 0);

const crew = defineModule<Crew>({
  id: 'crew',
  init: (ctx) => {
    const roster = ctx.rng('roster');
    const members: Crew['members'] = {};
    for (const id of ['kit', 'mara', 'rook']) {
      const max = roster.int(5, 8);
      members[id] = { hp: max, max };
    }
    return { members };
  },
  actions: {
    rest(ctx) {
      const members = ctx.write().members;
      const hurt = Object.values(members).filter((m) => m.hp > 0 && m.hp < m.max);
      if (hurt.length === 0) return ctx.refuse('no-one-hurt');
      for (const member of hurt) member.hp += 1;
      ctx.emit('rested', { healed: hurt.length });
    },
  },
  effects: {
    wound(ctx, effect) {
      const alive = living(ctx.read());
      if (alive.length === 0) return;
      const id = ctx.rng('wound').pick(alive);
      const member = ctx.write().members[id] as { hp: number };
      member.hp = Math.max(0, member.hp - (effect.hp as number));
      ctx.emit('wounded', { member: id, hp: member.hp });
    },
    heal: {
      run(ctx, effect) {
        for (const member of Object.values(ctx.write().members)) {
          if (member.hp > 0) member.hp = healed(member, effect.hp as number);
        }
      },
      // What each member would gain, capped at their max: Space-Wrecked's preview missed the cap.
      preview: (ctx, effect) => ({
        gains: Object.fromEntries(
          Object.entries(ctx.read().members)
            .filter(([, member]) => member.hp > 0)
            .map(([id, member]) => [id, healed(member, effect.hp as number) - member.hp]),
        ),
      }),
    },
  },
  facts: { alive: { read: ({ state }) => living(state).length, domain: { type: 'int', min: 0, max: 3 } } },
});

const healed = (member: { hp: number; max: number }, hp: number) => Math.min(member.max, member.hp + hp);

interface Hold {
  credits: number;
  items: Record<string, number>;
}

const hold = defineModule<Hold>({
  id: 'hold',
  init: () => ({ credits: 20, items: {} }),
  effects: {
    loot(ctx, effect) {
      const table = ctx.content.getOrThrow<{ entries: { item: string; weight: number }[] }>(
        'loot-table',
        effect.table as string,
      );
      const entry = table.entries[ctx.rng('loot').weightedIndex(table.entries.map((e) => e.weight))];
      if (!entry) return;
      const items = ctx.write().items;
      items[entry.item] = (items[entry.item] ?? 0) + 1;
      ctx.emit('looted', { item: entry.item });
    },
    sell(ctx, effect) {
      const item = effect.item as string;
      const slice = ctx.write();
      if ((slice.items[item] ?? 0) === 0) return ctx.refuse('nothing-to-sell', { item });
      slice.items[item] = (slice.items[item] ?? 0) - 1;
      slice.credits += ctx.content.getOrThrow<{ value: number }>('item', item).value;
    },
    credits(ctx, effect) {
      const slice = ctx.write();
      if (slice.credits + (effect.delta as number) < 0) return ctx.refuse('no-credits', { credits: slice.credits });
      slice.credits += effect.delta as number;
    },
  },
  facts: {
    credits: { read: ({ state }) => state.credits, domain: { type: 'int', min: 0 }, label: 'credits' },
    count: {
      read: ({ state }, args) => state.items[args.item as string] ?? 0,
      args: { item: { type: 'ref', to: 'item' } },
      domain: { type: 'int', min: 0 },
      describe: (test) => (test.op === '>=' ? `${test.value} ${test.args?.item} to sell` : undefined),
    },
  },
});

interface Voyage {
  day: number;
  ending: 'home' | 'lost' | null;
}

const voyage = defineModule<Voyage>({
  id: 'voyage',
  init: () => ({ day: 0, ending: null }),
  modes: {
    travel: { actions: ['voyage/jump', 'crew/rest'] },
    encounter: { actions: ['voyage/choose'] },
    ended: { actions: [] },
  },
  actions: {
    jump(ctx) {
      const slice = ctx.write();
      slice.day += 1;
      const event = ctx.rng('encounters').pick(ctx.content.ids('event'));
      ctx.modes.push('encounter', { event });
      ctx.emit('arrived', { day: slice.day, event });
    },
    choose(ctx, action) {
      const { event } = ctx.modes.current.data as { event: string };
      const id = action.choice as string;
      const choice = ctx.content.getOrThrow<EventRecord>('event', event).choices[id];
      if (!choice) return ctx.refuse('no-such-choice', { event });
      // The same check a menu makes to offer the choice, so what is offered is what is allowed.
      if (choice.when && ctx.check(choice.when) !== true) return ctx.refuse('locked', { event, choice: id });
      ctx.emit('chose', { event, choice: id });
      for (const effect of choice.effects) ctx.apply(effect);
      ctx.modes.pop();
      const ending = (ctx.fact('crew.alive') as number) === 0 ? 'lost' : ctx.read().day >= HOME_DAY ? 'home' : null;
      if (ending) {
        ctx.write().ending = ending;
        ctx.modes.replace('ended');
        ctx.emit('ended', { ending });
      }
    },
  },
});

export const salvageModules = [logicModule, crew, hold, voyage];
export const game = createGame({ modules: salvageModules, start: 'travel' });

/** The choices a menu would offer now: those whose condition holds. */
export function offered(state: GameState, event: string): string[] {
  const { choices } = content.getOrThrow<EventRecord>('event', event);
  return Object.keys(choices).filter((id) => {
    const when = choices[id]?.when;
    return when === undefined || game.check(state, when, sim) === true;
  });
}

/**
 * A bot that plays through `reduce` like a player would: it only offers what the mode allows,
 * and draws its own choices from a stream of its own (landnam's bot skipped the mode checks and
 * made 18,733 moves the UI would have refused).
 */
export function botAction(state: GameState, allowed: readonly string[], rng: Rng): Record<string, unknown> | null {
  if (allowed.includes('voyage/choose')) {
    const data = state.kernel.modes[state.kernel.modes.length - 1]?.data as { event: string } | undefined;
    if (!data) return null;
    return { type: 'voyage/choose', choice: rng.pick(offered(state, data.event)) };
  }
  if (allowed.length === 0) return null;
  return { type: allowed.includes('crew/rest') && rng.chance(1, 3) ? 'crew/rest' : 'voyage/jump' };
}

export const botFor = (seed: string) => Rng.create(`bot:${seed}`);
