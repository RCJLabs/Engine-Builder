import type { Module, ModuleContext } from 'eb';
import { defineModule } from 'eb';
import { capacityOf, credits, crewOf, flies, heatOf, pursuerOf, type Read, rulesOf, supplies } from './shared';
import { hunt, jump, patchPrice, placeQuests, stationPrice } from './voyage';

interface Run {
  /** The sector the ship is in, from 1; one past the last once it is in the system. */
  sector: number;
  name: string;
  /** The node the ship stands on, as maps/arrived says. */
  at?: string;
  /** Docked at a station: its side, if it has one, and whether the crew has traded there yet. */
  docked: boolean;
  side?: string;
  traded: boolean;
  swapped: boolean;
  /** Quest events still to meet in this sector, by the layer they wait at. */
  quests: Record<string, number>;
  /** The system's worlds: each node's kind of world and name, rolled as it is entered. */
  worlds: Record<string, { kind: string; name: string }>;
  surveyed: string[];
}

type Ctx = ModuleContext<Run>;
const reader =
  (ctx: Ctx): Read =>
  (id, args) =>
    ctx.fact(id, args);
const CRATES = [10, 20];

function enterSector(ctx: Ctx) {
  const rules = rulesOf(ctx.content);
  const next = ctx.read().sector + 1;
  const draft = ctx.write();
  draft.sector = next;
  draft.swapped = false;
  if (next > rules['sector-count']) return enterSystem(ctx);
  draft.name = ctx.rng('names').pick(rules['sector-names']);
  ctx.apply({ effect: 'enter-map', map: 'sector' });
  ctx.write().quests = placeQuests(ctx as never);
}

/** Past the last charted jump point: the system's worlds, each a kind rolled and a name. */
function enterSystem(ctx: Ctx) {
  const rules = rulesOf(ctx.content);
  const rng = ctx.rng('worlds');
  const names = rng.shuffle(rules['world-names']);
  const kinds = ctx.content.ids('world-kind');
  const worlds: Run['worlds'] = {};
  const nodes = ctx.content.getOrThrow<{ nodes: { id: string; kind: string }[] }>('map', 'system').nodes;
  for (const [i, node] of nodes.filter((n) => n.kind === 'world').entries()) {
    worlds[node.id] = { kind: rng.pick(kinds), name: names[i] ?? node.id };
  }
  Object.assign(ctx.write(), { name: 'Past the charts', worlds, quests: {} });
  ctx.apply({ effect: 'enter-map', map: 'system' });
  ctx.emit('past-charts', {});
}

/** Docking (a station's arrival): its side by its name, the bar's recruits rolled for this visit. */
function dock(ctx: Ctx) {
  const name = ctx.fact('maps.name');
  const station = ctx.content
    .ids('station')
    .find((id) => ctx.content.getOrThrow<{ name: string }>('station', id).name === name);
  const side = station ? ctx.content.getOrThrow<{ side?: string }>('station', station).side : undefined;
  Object.assign(ctx.write(), { docked: true, traded: false, side });
  ctx.apply({ effect: 'refresh-hall', hall: 'station' });
  ctx.modes.replace('docked');
}

/** A trade at a station: at one of the pursuer's side, the first since docking logs the ship. */
function traded(ctx: Ctx) {
  const run = ctx.read();
  if (run.traded) return;
  ctx.write().traded = true;
  const pursuer = pursuerOf(ctx.content, reader(ctx));
  if (pursuer && run.side === pursuer.side) {
    ctx.apply({ effect: 'add-to-flag', flag: 'heat', by: rulesOf(ctx.content)['dock-heat'] });
  }
}

const wounded = (view: { content: Ctx['content']; fact: Read }) =>
  crewOf(view.content, view.fact).some(
    (actor) =>
      (view.fact('stats.current', { actor, stat: 'hp' }) as number) <
      (view.fact('stats.value', { actor, stat: 'hp' }) as number),
  );

const atWorld = (state: Readonly<Run>) => state.at !== undefined && state.worlds[state.at] !== undefined;

/**
 * Act 2, the run (the original's travel.js): five sectors crossed by the maps kit's jumps, and
 * past the last, the system where the crew settles. Stations dock; the pursuer's hunters wait
 * where a jump comes out; a quest's event is met in the sector after it starts.
 */
export const run: Module = defineModule<Run>({
  id: 'run',
  init: () => ({
    sector: 0,
    name: '',
    docked: false,
    traded: false,
    swapped: false,
    quests: {},
    worlds: {},
    surveyed: [],
  }),
  actions: {
    scan: {
      run: (ctx) => {
        const rules = rulesOf(ctx.content);
        ctx.apply({ effect: 'add-to-flag', flag: 'heat', by: rules['scan-heat'] });
        ctx.apply({ effect: 'reveal-map', reach: rules['scan-range'] });
      },
      options: ({ fact }) => (fact('maps.on', { map: 'sector' }) === true ? [{}] : []),
    },
    regroup: {
      run: (ctx) => {
        const rules = rulesOf(ctx.content);
        for (const actor of crewOf(ctx.content, reader(ctx)))
          ctx.apply({ effect: 'heal-stat', actor, stat: 'hp', by: rules['regroup-hp'] });
        ctx.apply({ effect: 'add-to-flag', flag: 'heat', by: rules['regroup-heat'] });
        hunt(ctx as never);
      },
      options: (view) => (view.fact('maps.on', { map: 'sector' }) === true && wounded(view) ? [{}] : []),
    },
    hide: {
      run: (ctx) => ctx.apply({ effect: 'add-to-flag', flag: 'heat', by: rulesOf(ctx.content)['hide-heat'] }),
      options: ({ fact }) => (fact('maps.at', { kind: 'nebula' }) === true && heatOf(fact) > 0 ? [{}] : []),
    },
    onward: {
      run: (ctx) => enterSector(ctx),
      options: ({ fact }) => (fact('maps.on', { map: 'sector' }) === true && fact('maps.at-end') === true ? [{}] : []),
    },
    survey: {
      run: (ctx) => {
        ctx.write().surveyed.push(ctx.read().at as string);
        ctx.apply({ effect: 'add-to-flag', flag: 'heat', by: rulesOf(ctx.content)['survey-heat'] });
      },
      options: ({ state }) => (atWorld(state) && !state.surveyed.includes(state.at as string) ? [{}] : []),
    },
    settle: {
      run: (ctx) => {
        const world = ctx.read().worlds[ctx.read().at as string];
        if (!world) return ctx.refuse('not-at-a-world');
        ctx.apply({ effect: 'settle', world: world.kind });
      },
      options: ({ state }) => (atWorld(state) ? [{}] : []),
    },
    buy: {
      run: (ctx, action) => {
        const crates = action.crates as number;
        const price = stationPrice(ctx, ctx.read().side, crates * rulesOf(ctx.content)['supply-price']);
        ctx.apply({ effect: 'pay-cost', cost: { credits: price } });
        ctx.apply({ effect: 'add-resource', resource: 'supplies', by: crates });
        traded(ctx);
      },
      options: ({ state, content, fact }) =>
        CRATES.filter((crates) => {
          const price = stationPrice({ fact }, state.side, crates * rulesOf(content)['supply-price']);
          return credits(fact) >= price && supplies(fact) + crates <= capacityOf(content, fact);
        }).map((crates) => ({ crates })),
    },
    patch: {
      run: (ctx) => {
        const price = patchPrice(ctx as never, ctx.read().side);
        if (price > 0) ctx.apply({ effect: 'pay-cost', cost: { credits: price } });
        for (const actor of crewOf(ctx.content, reader(ctx))) ctx.apply({ effect: 'heal-stat', actor, stat: 'hp' });
        traded(ctx);
      },
      options: (view) => {
        if (!wounded(view)) return [];
        return credits(view.fact) >= patchPrice(view as never, view.state.side) ? [{}] : [];
      },
    },
    hire: {
      run: (ctx) => {
        traded(ctx);
        ctx.apply({ effect: 'open-hall', hall: 'station' });
      },
      options: ({ fact }) => (((fact('roster.room') as number | undefined) ?? 0) > 0 ? [{}] : []),
    },
    swap: {
      run: (ctx) => {
        const rules = rulesOf(ctx.content);
        ctx.apply({ effect: 'pay-cost', cost: { credits: stationPrice(ctx, ctx.read().side, rules['swap-price']) } });
        ctx.apply({ effect: 'add-to-flag', flag: 'heat', by: rules['swap-heat'] });
        ctx.write().swapped = true;
        traded(ctx);
      },
      options: ({ state, content, fact }) => {
        const price = stationPrice({ fact }, state.side, rulesOf(content)['swap-price']);
        return !state.swapped && heatOf(fact) > 0 && credits(fact) >= price ? [{}] : [];
      },
    },
    undock: {
      // The ship can't leave while a flight check fails, after a refit.
      run: (ctx) => {
        if (!flies(ctx.content, reader(ctx))) return ctx.refuse('not-flightworthy');
        Object.assign(ctx.write(), { docked: false, side: undefined });
        ctx.modes.replace('run');
      },
      options: ({ content, fact }) => (flies(content, fact) ? [{}] : []),
    },
  },
  effects: {
    jump: (ctx, effect) => jump(ctx as never, effect.long === true),
    dock: (ctx) => dock(ctx),
  },
  on: {
    'campaign/launched': (ctx) => {
      const room = capacityOf(ctx.content, reader(ctx)) - supplies(reader(ctx));
      if (room > 0) ctx.apply({ effect: 'add-resource', resource: 'supplies', by: room });
      ctx.modes.replace('run');
      enterSector(ctx);
    },
    'maps/arrived': (ctx, event) => {
      ctx.write().at = String(event.node);
      if (event.map !== 'sector') return;
      hunt(ctx as never);
      const layer = ctx.fact('maps.layer') as number;
      for (const [event, at] of Object.entries(ctx.read().quests)) {
        if (layer < at) continue;
        delete ctx.write().quests[event];
        ctx.apply({ effect: 'open-event', event });
      }
    },
  },
  facts: {
    sector: { domain: { type: 'int', min: 0 }, label: 'the sector', read: ({ state }) => state.sector },
    'sector-name': {
      domain: { type: 'text' },
      label: 'the sector’s name',
      read: ({ state }) => state.name || undefined,
    },
    'past-charts': {
      domain: { type: 'bool' },
      label: 'past the charts',
      read: ({ state, content }) => state.sector > rulesOf(content)['sector-count'],
    },
    docked: { domain: { type: 'bool' }, label: 'docked at a station', read: ({ state }) => state.docked },
    capacity: {
      domain: { type: 'int', min: 0 },
      label: 'supplies the holds take',
      read: ({ content, fact }) => capacityOf(content, fact),
    },
    price: {
      args: { crates: { type: 'int', min: 1 } },
      domain: { type: 'int', min: 0 },
      label: 'what supplies cost here',
      read: ({ state, content, fact }, { crates }) =>
        stationPrice({ fact }, state.side, (crates as number) * rulesOf(content)['supply-price']),
    },
    'patch-price': {
      domain: { type: 'int', min: 0 },
      label: 'what patching everyone up costs here',
      read: (view) => patchPrice(view as never, view.state.side),
    },
    'world-name': {
      domain: { type: 'text' },
      label: 'the world the ship is at',
      read: ({ state }) => (state.at === undefined ? undefined : state.worlds[state.at]?.name),
    },
    'world-kind': {
      domain: { type: 'ref', to: 'world-kind' },
      label: 'the kind of world, once surveyed',
      read: ({ state }) =>
        state.at !== undefined && state.surveyed.includes(state.at) ? state.worlds[state.at]?.kind : undefined,
    },
  },
  events: {
    'past-charts': { args: {}, label: 'The ship jumps past the charts' },
  },
  modes: {
    run: { actions: ['maps/*', 'run/scan', 'run/regroup', 'run/hide', 'run/onward', 'run/survey', 'run/settle'] },
    docked: { actions: ['run/buy', 'run/patch', 'run/hire', 'run/swap', 'run/undock', 'refit/*'] },
  },
});
