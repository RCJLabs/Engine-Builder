/**
 * Made records (D44, docs/specs/sim.md#made-records): records a module makes in play, which every
 * module reads, checks and names beside the pack's.
 */
import { describe, expect, it } from 'vitest';
import { createRecordStore } from '../records.ts';
import { createGame, defineModule, type GameState, type Module } from './index.ts';

const sim = { content: createRecordStore({ pet: { fido: { name: 'Fido' } }, toy: { ball: {} } }) };

interface Kennel {
  readonly pets: Readonly<Record<string, { readonly name: string }>>;
}

/** Makes pets in play: each adopted pet is a pet record from then on. */
const kennel = defineModule<Kennel>({
  id: 'kennel',
  init: () => ({ pets: {} }),
  made: {
    types: ['pet'],
    ids: ({ state }) => Object.keys(state.pets).sort(),
    get: ({ state }, _type, id) => state.pets[id],
  },
  effects: {
    adopt(ctx, effect) {
      (ctx.write().pets as Record<string, { name: string }>)[effect.pet as string] = { name: effect.name as string };
      ctx.emit('adopted', { pet: effect.pet });
    },
  },
  events: { adopted: { args: { pet: { type: 'ref', to: 'pet' } } } },
  actions: {
    take(ctx, action) {
      for (const effect of action.effects as never[]) ctx.apply(effect);
    },
  },
  modes: { open: { actions: ['kennel/take'] } },
});

/** Reads pets as content, knowing nothing of who made them. */
const vet = defineModule<{ seen: string[] }>({
  id: 'vet',
  init: () => ({ seen: [] }),
  facts: {
    named: {
      args: { pet: { type: 'ref', to: 'pet' } },
      domain: { type: 'text' },
      read: ({ content }, { pet }) => content.get<{ name: string }>('pet', pet as string)?.name,
    },
    pets: { domain: { type: 'int', min: 0 }, read: ({ content }) => content.ids('pet').length },
  },
  effects: {
    'check-up'(ctx, effect) {
      const pet = ctx.content.getOrThrow<{ name: string }>('pet', effect.pet as string);
      ctx.write().seen.push(pet.name);
    },
    'turn-away': (ctx) => ctx.refuse('closed'),
  },
});

const game = createGame({ modules: [kennel, vet], start: 'open' });
const take = (state: GameState, ...effects: object[]) => game.reduce(state, { type: 'kennel/take', effects }, sim);
const adopted = (state: GameState, pet: string, name: string) => {
  const step = take(state, { effect: 'adopt', pet, name });
  expect(step.accepted).toBe(true);
  return step.state;
};

describe('made records', () => {
  it('are read as written records are, listed with them in id order', () => {
    const state = adopted(adopted(game.init('kennel', sim), 'rex', 'Rex'), 'ace', 'Ace');
    expect(game.fact(state, 'vet.named', { pet: 'rex' }, sim)).toBe('Rex');
    expect(game.fact(state, 'vet.named', { pet: 'fido' }, sim)).toBe('Fido');
    expect(game.fact(state, 'vet.pets', {}, sim)).toBe(3);
    // Nothing made, and the pack's content as it is.
    expect(game.fact(game.init('kennel', sim), 'vet.pets', {}, sim)).toBe(1);
  });

  it('are named by events, whose arguments the kernel checks against them', () => {
    const step = take(game.init('kennel', sim), { effect: 'adopt', pet: 'rex', name: 'Rex' });
    expect(step.beats).toContainEqual({ type: 'kennel/adopted', pet: 'rex' });
    // A pet that is neither written nor made is still refused by the event's check.
    const lost = defineModule<object>({
      id: 'lost',
      init: () => ({}),
      events: { found: { args: { pet: { type: 'ref', to: 'pet' } } } },
      actions: { find: (ctx) => ctx.emit('found', { pet: 'ghost' }) },
      modes: { lost: { actions: ['lost/find'] } },
    });
    const both = createGame({ modules: [kennel, lost], start: 'lost' });
    expect(() => both.reduce(both.init('x', sim), { type: 'lost/find' }, sim)).toThrow('No pet record "ghost"');
  });

  it('are there for later effects in the same action, and gone with an action that is refused', () => {
    const step = take(
      game.init('kennel', sim),
      { effect: 'adopt', pet: 'rex', name: 'Rex' },
      { effect: 'check-up', pet: 'rex' },
    );
    expect(step.accepted).toBe(true);
    expect((step.state.vet as { seen: string[] }).seen).toEqual(['Rex']);
    const refused = take(
      game.init('kennel', sim),
      { effect: 'adopt', pet: 'rex', name: 'Rex' },
      { effect: 'turn-away' },
    );
    expect(refused.accepted).toBe(false);
    expect(game.fact(refused.state, 'vet.pets', {}, sim)).toBe(1);
  });

  it('never shadow a written record, and are frozen as content is', () => {
    const clash = adopted(game.init('kennel', sim), 'fido', 'Not Fido');
    expect(() => game.fact(clash, 'vet.pets', {}, sim)).toThrow(
      'Made record pet:fido (module kennel) is already a record',
    );
    // The written one wins wherever it is read by id.
    expect(game.fact(clash, 'vet.named', { pet: 'fido' }, sim)).toBe('Fido');
    const frozen = defineModule<object>({
      id: 'peek',
      init: () => ({}),
      effects: {
        rename(ctx) {
          (ctx.content.get('pet', 'rex') as { name: string }).name = 'Max';
        },
      },
    });
    const peeking = createGame({ modules: [kennel, frozen], start: 'open' });
    const state = peeking.reduce(
      peeking.init('p', sim),
      { type: 'kennel/take', effects: [{ effect: 'adopt', pet: 'rex', name: 'Rex' }] },
      sim,
    ).state;
    expect(() => peeking.reduce(state, { type: 'kennel/take', effects: [{ effect: 'rename' }] }, sim)).toThrow();
  });

  it('must say what they make, and how to read it', () => {
    const bad = (made: unknown) => defineModule<object>({ id: 'bad', init: () => ({}), made: made as never });
    const make = (modules: Module[]) => () => createGame({ modules, start: 'open' });
    expect(make([kennel, bad({ types: [], ids: () => [], get: () => undefined })])).toThrow(
      'Module "bad": made.types must list the record types it makes',
    );
    expect(make([kennel, bad({ types: ['pet'] })])).toThrow('Module "bad": made needs ids and get functions');
  });
});
