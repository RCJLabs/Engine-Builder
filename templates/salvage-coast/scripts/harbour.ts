import type { Module, ModuleContext } from 'eb';
import { defineModule } from 'eb';

/** Voyages the harbourmaster allows before he takes the boat: change it for a longer or shorter game. */
const VOYAGES = 5;

const ENDINGS = ['none', 'free', 'seized', 'lost'] as const;
type Ending = (typeof ENDINGS)[number];

interface Harbour {
  voyages: number;
  inPort: boolean;
  ending: Ending;
}

type Ctx = ModuleContext<Harbour>;

/** The game ends here: each ending is a mode with no actions, and its screen shows it. */
const end = (ctx: Ctx, ending: Exclude<Ending, 'none'>) => {
  if (ctx.read().ending !== 'none') return;
  ctx.write().ending = ending;
  ctx.modes.replace(ending);
};

const sailing = (ctx: Ctx) => {
  const draft = ctx.write();
  draft.voyages += 1;
  draft.inPort = false;
  ctx.modes.replace('at-sea');
  ctx.apply({ effect: 'enter-map', map: 'coast' });
};

const owes = (fact: (id: string, args?: Record<string, unknown>) => unknown) =>
  (fact('economy.amount', { resource: 'debt' }) as number) > 0;

/**
 * The harbour and the voyages from it. What the boat finds at sea, what it sells, the contracts
 * and the debt are records; this is only where the game is and how it ends: free once the debt
 * quest is done, seized when the last voyage is over and the debt stands, lost when the hull runs
 * out.
 */
export const harbour: Module = defineModule<Harbour>({
  id: 'harbour',
  init: () => ({ voyages: 0, inPort: true, ending: 'none' }),
  actions: {
    'set-sail': {
      run: sailing,
      options: ({ state }) => (state.voyages < VOYAGES ? [{}] : []),
    },
    chandlery: { run: (ctx) => ctx.apply({ effect: 'open-shop', shop: 'chandlery' }) },
    yard: { run: (ctx) => ctx.apply({ effect: 'open-event', event: 'yard' }) },
    contracts: { run: (ctx) => ctx.apply({ effect: 'open-event', event: 'board' }) },
    harbourmaster: { run: (ctx) => ctx.apply({ effect: 'open-event', event: 'harbourmaster' }) },
    'hand-over': {
      run: (ctx) => end(ctx, 'seized'),
      options: ({ state, fact }) => (state.voyages >= VOYAGES && owes(fact) ? [{}] : []),
    },
  },
  on: {
    'maps/arrived': (ctx) => {
      // A boat that sank on its last leg stays sunk.
      if (ctx.fact('maps.at-end') !== true || ctx.read().ending !== 'none') return;
      ctx.write().inPort = true;
      ctx.modes.replace('harbour');
      ctx.emit('home', { voyage: ctx.read().voyages });
    },
    'quests/done': (ctx, event) => {
      if (event.quest === 'debt') end(ctx, 'free');
    },
    'stats/emptied': (ctx, event) => {
      if (event.actor === 'boat' && event.stat === 'hull') end(ctx, 'lost');
    },
  },
  facts: {
    voyages: { read: ({ state }) => state.voyages, domain: { type: 'int', min: 0 }, label: 'voyages made' },
    'in-port': { read: ({ state }) => state.inPort, domain: { type: 'bool' }, label: 'in port' },
    ending: { read: ({ state }) => state.ending, domain: { type: 'enum', values: ENDINGS }, label: 'how it ended' },
  },
  events: {
    home: { args: { voyage: { type: 'int', min: 1 } }, label: 'The Kittiwake comes home' },
  },
  modes: {
    harbour: { actions: ['harbour/*'] },
    'at-sea': { actions: ['maps/*'] },
    free: { actions: [] },
    seized: { actions: [] },
    lost: { actions: [] },
  },
});
