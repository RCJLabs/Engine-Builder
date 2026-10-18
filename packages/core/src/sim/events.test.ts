/**
 * Events and listeners (M3.1, docs/specs/triggers.md): declared, checked when raised, and heard
 * when the work that raised them finishes, depth first.
 */
import { describe, expect, it } from 'vitest';
import { createRecordStore } from '../records.ts';
import {
  type Beat,
  createGame,
  defineModule,
  eventCatalog,
  type GameState,
  type Listener,
  MAX_EVENT_DEPTH,
  type Module,
} from './index.ts';

const sim = { content: createRecordStore({ item: { medkit: {} } }) };

/** Raises events from its actions; the order beats come out in is what the tests read. */
const bell = defineModule<{ rung: number }>({
  id: 'bell',
  init: () => ({ rung: 0 }),
  events: {
    rang: { args: { times: { type: 'int', min: 1 } }, label: 'The bell rings' },
    found: { args: { item: { type: 'ref', to: 'item' } } },
  },
  actions: {
    ring(ctx, action) {
      ctx.write().rung += 1;
      ctx.emit('rang', { times: (action.times as number) ?? 1 });
      ctx.emit('after-ring');
    },
    peal(ctx) {
      ctx.emit('rang', { times: 1 });
      ctx.emit('rang', { times: 2 });
    },
    twice(ctx) {
      ctx.attempt(() => ctx.emit('rang', { times: 1 }));
      ctx.emit('between');
      ctx.emit('rang', { times: 2 });
    },
    refused(ctx) {
      ctx.attempt(() => {
        ctx.emit('rang', { times: 1 });
        ctx.refuse('no');
      });
    },
    raise(ctx, action) {
      ctx.emit(action.event as string, action.data as Record<string, unknown>);
    },
  },
});

interface Heard {
  heard: string[];
}

const hearRang: Listener<Heard> = (ctx, event) => {
  ctx.write().heard.push(`rang ${event.times}`);
  ctx.emit('heard', { times: event.times });
};

/** Hears every bell and says so, as a beat of its own. */
const ear = (id: string, on: Readonly<Record<string, Listener<Heard>>> = { 'bell/rang': hearRang }): Module =>
  defineModule<Heard>({ id, init: () => ({ heard: [] }), on });

const types = (beats: readonly Beat[]) => beats.map((b) => (b.type === 'ear/heard' ? `ear ${b.times}` : b.type));

function play(modules: readonly Module[], action: Record<string, unknown>) {
  const game = createGame({ modules, start: 'any' });
  const state = game.init('seed', sim);
  return { game, state, step: game.reduce(state, { type: 'bell/ring', ...action }, sim) };
}

const anyMode = defineModule<Record<string, never>>({
  id: 'modes',
  init: () => ({}),
  modes: { any: { actions: ['*'] } },
});

describe('declaring events', () => {
  it('registers them as module/name, with a catalog sorted by id', () => {
    const game = createGame({ modules: [bell, anyMode], start: 'any' });
    expect(Object.keys(game.events())).toEqual(['bell/found', 'bell/rang']);
    expect(game.events()['bell/rang']).toEqual({ args: { times: { type: 'int', min: 1 } }, label: 'The bell rings' });
    expect(eventCatalog([bell])).toEqual(game.events());
    expect(Object.isFrozen(game.events())).toBe(true);
    // Declared rang, found, then struck: neither that order nor its reverse is sorted.
    const gong = defineModule({ id: 'gong', init: () => ({}), events: { struck: {} } });
    expect(Object.keys(eventCatalog([bell, gong]))).toEqual(['bell/found', 'bell/rang', 'gong/struck']);
  });

  it('throws on a malformed event, or a listener for one nobody declares', () => {
    const declare = (events: object) => () =>
      createGame({
        modules: [defineModule({ id: 'x', init: () => ({}), events: events as never }), anyMode],
        start: 'any',
      });
    expect(declare({ Bad: {} })).toThrow('"Bad" is not a valid x event');
    expect(declare({ e: { args: { 'no good': { type: 'bool' } } } })).toThrow('"no good" is not a valid argument name');
    expect(declare({ e: { args: { n: { type: 'int', min: 3, max: 1 } } } })).toThrow(
      'argument "n": min 3 is above max 1',
    );
    expect(declare({ e: { label: '' } })).toThrow('Event "x/e": a label is text that is not empty');
    expect(() => createGame({ modules: [bell, ear('ear', { 'bell/rung': () => {} }), anyMode], start: 'any' })).toThrow(
      'Module "ear" listens for "bell/rung", which no module declares',
    );
    expect(() => createGame({ modules: [bell, ear('ear', { '*': 'no' as never }), anyMode], start: 'any' })).toThrow(
      'its listener for "*" must be a function',
    );
  });
});

describe('raising events', () => {
  const raise = (event: string, data: unknown) => {
    const game = createGame({ modules: [bell, anyMode], start: 'any' });
    return () => game.reduce(game.init('seed', sim), { type: 'bell/raise', event, data }, sim);
  };

  it('checks the data against the declared arguments', () => {
    expect(raise('rang', { times: 2 })().accepted).toBe(true);
    expect(raise('rang', {})).toThrow('Event "bell/rang": the argument "times" is missing');
    expect(raise('rang', { times: 2, loud: true })).toThrow('it has no argument "loud"');
    expect(raise('rang', { times: 0 })).toThrow('argument "times": Expected at least 1');
    expect(raise('found', { item: 'medkit' })().accepted).toBe(true);
    expect(raise('found', { item: 'idol' })).toThrow('argument "item": No item record "idol"');
  });

  it('leaves beats that are not events alone', () => {
    expect(raise('anything', { at: 'all' })().beats).toEqual([{ type: 'bell/anything', at: 'all' }]);
  });
});

describe('hearing events', () => {
  it('after the work that raised them, in module order, each with its own context', () => {
    const { step } = play([bell, ear('ear'), ear('echo'), anyMode], { times: 3 });
    expect(types(step.beats)).toEqual(['bell/rang', 'bell/after-ring', 'ear 3', 'echo/heard']);
    expect(step.state.ear).toEqual({ heard: ['rang 3'] });
    expect(step.state.echo).toEqual({ heard: ['rang 3'] });
  });

  it('in the order they were raised', () => {
    const game = createGame({ modules: [bell, ear('ear'), anyMode], start: 'any' });
    const step = game.reduce(game.init('seed', sim), { type: 'bell/peal' }, sim);
    expect(types(step.beats)).toEqual(['bell/rang', 'bell/rang', 'ear 1', 'ear 2']);
    expect(step.state.ear).toEqual({ heard: ['rang 1', 'rang 2'] });
  });

  it('within an attempt when raised in one, so its consequences come before the work after it', () => {
    const game = createGame({ modules: [bell, ear('ear'), anyMode], start: 'any' });
    const step = game.reduce(game.init('seed', sim), { type: 'bell/twice' }, sim);
    expect(types(step.beats)).toEqual(['bell/rang', 'ear 1', 'bell/between', 'bell/rang', 'ear 2']);
  });

  it('never, when the attempt that raised them refused', () => {
    const game = createGame({ modules: [bell, ear('ear'), anyMode], start: 'any' });
    const step = game.reduce(game.init('seed', sim), { type: 'bell/refused' }, sim);
    expect(step.accepted).toBe(true);
    expect(step.beats).toEqual([]);
    expect(step.state.ear).toEqual({ heard: [] });
  });

  it('depth first: what one listener raises is heard before the next listener hears the first', () => {
    const relay = defineModule<Record<string, never>>({
      id: 'relay',
      init: () => ({}),
      events: { passed: {} },
      on: { 'bell/rang': (ctx) => ctx.emit('passed'), 'relay/passed': (ctx) => ctx.emit('done') },
    });
    const { step } = play([bell, relay, ear('ear'), anyMode], {});
    expect(types(step.beats)).toEqual(['bell/rang', 'bell/after-ring', 'relay/passed', 'relay/done', 'ear 1']);
  });

  it('a module with "*" hears every event it has no entry of its own for', () => {
    const all = defineModule<{ heard: string[] }>({
      id: 'all',
      init: () => ({ heard: [] }),
      events: { mine: {} },
      on: {
        '*': (ctx, event) => ctx.write().heard.push(event.type),
        'all/mine': (ctx) => ctx.write().heard.push('mine, by name'),
      },
      actions: { go: (ctx) => ctx.emit('mine') },
    });
    const game = createGame({ modules: [bell, all, anyMode], start: 'any' });
    let state: GameState = game.init('seed', sim);
    state = game.reduce(state, { type: 'bell/ring' }, sim).state;
    state = game.reduce(state, { type: 'all/go' }, sim).state;
    expect(state.all).toEqual({ heard: ['bell/rang', 'mine, by name'] });
  });

  it('a listener that refuses outside an attempt refuses the action', () => {
    const veto = defineModule({ id: 'veto', init: () => ({}), on: { 'bell/rang': (ctx) => ctx.refuse('vetoed') } });
    const { state, step } = play([bell, veto, anyMode], {});
    expect(step.accepted).toBe(false);
    expect(step.state).toBe(state);
    expect(step.beats).toEqual([{ type: 'rejected', action: 'bell/ring', reason: 'vetoed' }]);
  });

  it('hears any number of events one after another: only how deep they go is limited', () => {
    const many = defineModule<{ heard: number }>({
      id: 'many',
      init: () => ({ heard: 0 }),
      events: { tick: {} },
      on: {
        'many/tick': (ctx) => {
          ctx.write().heard += 1;
        },
      },
      actions: {
        go: (ctx) => {
          for (let i = 0; i < MAX_EVENT_DEPTH * 4; i++) ctx.attempt(() => ctx.emit('tick'));
          for (let i = 0; i < MAX_EVENT_DEPTH * 4; i++) ctx.emit('tick');
        },
      },
    });
    const game = createGame({ modules: [many, anyMode], start: 'any' });
    const step = game.reduce(game.init('seed', sim), { type: 'many/go' }, sim);
    expect(step.state.many).toEqual({ heard: MAX_EVENT_DEPTH * 8 });
  });

  it(`throws when listeners raise events ${MAX_EVENT_DEPTH} deep`, () => {
    // Stops after `left` rounds: 63 are fine, 64 is one too many.
    const self = defineModule<Record<string, never>>({
      id: 'self',
      init: () => ({}),
      events: { tick: { args: { left: { type: 'int', min: 0 } } } },
      on: {
        'self/tick': (ctx, event) =>
          (event.left as number) > 0 && ctx.emit('tick', { left: (event.left as number) - 1 }),
      },
      actions: { start: (ctx, action) => ctx.emit('tick', { left: action.left as number }) },
    });
    const game = createGame({ modules: [self, anyMode], start: 'any' });
    const start = (left: number) => () => game.reduce(game.init('seed', sim), { type: 'self/start', left }, sim);
    expect(start(MAX_EVENT_DEPTH - 1)().beats).toHaveLength(MAX_EVENT_DEPTH);
    expect(start(MAX_EVENT_DEPTH)).toThrow(`Events raised ${MAX_EVENT_DEPTH} deep, at "self/tick"`);
  });
});
