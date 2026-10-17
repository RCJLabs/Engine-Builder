import { describe, expect, it } from 'vitest';
import { type Bank, type Counter, game, run, sim, slice, start } from '../../test/kernel-modules.ts';
import { CanonicalError, canonicalJson } from '../canonical.ts';
import { Rng } from '../rng.ts';
import { ActionError, createSession, type GameState } from './index.ts';

describe('init', () => {
  it('makes the kernel state, every slice and the streams init drew from, all frozen', () => {
    const state = start();
    expect(state.kernel).toMatchObject({ seed: 'test-seed', step: 0, modes: [{ id: 'play' }] });
    expect(Object.keys(state.kernel.streams)).toEqual(['bank/dice']);
    expect(state.counter).toEqual({ n: 0, rolls: [] });
    expect(
      Object.isFrozen(state) &&
        Object.isFrozen(state.kernel.modes) &&
        Object.isFrozen(slice<Bank>(state, 'bank').rolls),
    ).toBe(true);
  });

  it('gives the same state for the same seed', () => {
    expect(canonicalJson(start())).toBe(canonicalJson(start()));
    expect(game.init('other', sim).kernel.streams).not.toEqual(start().kernel.streams);
  });
});

describe('reduce', () => {
  it('applies an accepted action, never touching the state it was given', () => {
    const before = start();
    const text = canonicalJson(before);
    const step = game.reduce(before, { type: 'counter/add', by: 2 }, sim);
    expect(step.accepted).toBe(true);
    expect(step.beats).toEqual([{ type: 'counter/added', n: 2 }]);
    expect(slice<Counter>(step.state, 'counter').n).toBe(2);
    expect(step.state.kernel.step).toBe(1);
    expect(canonicalJson(before)).toBe(text);
    expect(() => {
      slice<Counter>(step.state, 'counter').n = 9;
    }).toThrow(TypeError);
  });

  it('shares the slices an action did not write', () => {
    const before = start();
    const after = game.reduce(before, { type: 'counter/add', by: 1 }, sim).state;
    expect(after.bank).toBe(before.bank);
    expect(after.counter).not.toBe(before.counter);
  });

  it('counts an accepted action that changes nothing, and says it was accepted', () => {
    const step = game.reduce(start(), { type: 'counter/nothing' }, sim);
    expect(step.accepted).toBe(true);
    expect(step.state.kernel.step).toBe(1);
  });

  it('keeps nothing from a refused action and returns one rejected beat', () => {
    const before = start();
    const step = game.reduce(before, { type: 'counter/add-then-refuse' }, sim);
    expect(step.accepted).toBe(false);
    expect(step.state).toBe(before);
    expect(step.beats).toEqual([
      { type: 'rejected', action: 'counter/add-then-refuse', reason: 'changed-my-mind', why: 1 },
    ]);
  });

  it("refuses the whole action when another module's effect refuses", () => {
    const step = game.reduce(start(), { type: 'counter/pay', amount: 50 }, sim);
    expect(step).toMatchObject({ accepted: false, beats: [{ type: 'rejected', reason: 'no-credits', credits: 10 }] });
    const paid = game.reduce(start(), { type: 'counter/pay', amount: 3 }, sim);
    expect([slice<Counter>(paid.state, 'counter').n, slice<Bank>(paid.state, 'bank').credits]).toEqual([1, 7]);
    expect(paid.beats).toEqual([{ type: 'bank/spent', amount: 3 }]);
  });

  it('reads facts through the changes made earlier in the same action', () => {
    expect(game.reduce(start(), { type: 'counter/peek' }, sim).beats).toEqual([
      { type: 'counter/peeked', before: 0, after: 5 },
    ]);
  });

  it('throws on actions the game cannot take at all', () => {
    expect(() => game.reduce(start(), { type: 'counter/fly' }, sim)).toThrow(
      new ActionError('Unknown action "counter/fly"'),
    );
    expect(() => game.reduce(start(), { type: 'counter/add', by: Number.NaN }, sim)).toThrow(ActionError);
    expect(() => game.reduce(start(), null as never, sim)).toThrow(ActionError);
  });

  it('throws when an action stores something a save cannot hold, naming where', () => {
    const before = start();
    const text = canonicalJson(before);
    expect(() => game.reduce(before, { type: 'counter/nan' }, sim)).toThrow(
      new CanonicalError('/counter/n', 'NaN has no JSON form'),
    );
    expect(canonicalJson(before)).toBe(text);
  });

  it('checks and freezes a state read back from a save on its first action', () => {
    const loaded = JSON.parse(canonicalJson(start())) as GameState;
    const next = game.reduce(loaded, { type: 'counter/add', by: 1 }, sim).state;
    expect(Object.isFrozen(loaded.bank) && Object.isFrozen(next.bank)).toBe(true);
    const broken = { ...JSON.parse(canonicalJson(start())), counter: { n: 0, rolls: [new Date(0)] } } as GameState;
    expect(() => game.reduce(broken, { type: 'counter/nothing' }, sim)).toThrow(CanonicalError);
  });
});

describe('beats', () => {
  it('are named after their module, which data cannot override', () => {
    expect(game.reduce(start(), { type: 'counter/odd-beat' }, sim).beats).toEqual([{ type: 'counter/odd', when: 1 }]);
  });

  it('must have kebab-case names and JSON data', () => {
    expect(() => game.reduce(start(), { type: 'counter/bad-beat-name' }, sim)).toThrow(
      '"Odd Beat" is not a valid beat name',
    );
    expect(() => game.reduce(start(), { type: 'counter/nan-beat' }, sim)).toThrow(CanonicalError);
  });
});

describe('random streams', () => {
  it('carry on across actions, and across a save and reload', () => {
    // A stream is the game seed forked by "module/name" (docs/specs/sim.md).
    const fresh = Rng.create('test-seed').fork('counter/dice');
    const expected = [fresh.int(1, 1000), fresh.int(1, 1000), fresh.int(1, 1000)];
    const once = run(start(), { type: 'counter/roll' }, { type: 'counter/roll' }, { type: 'counter/roll' });
    expect(slice<Counter>(once, 'counter').rolls).toEqual(expected);
    const halfway = JSON.parse(canonicalJson(run(start(), { type: 'counter/roll' }))) as GameState;
    const resumed = run(halfway, { type: 'counter/roll' }, { type: 'counter/roll' });
    expect(slice<Counter>(resumed, 'counter').rolls).toEqual(expected);
  });

  it("are separate per module, so one module's draws never shift another's", () => {
    const alone = run(start(), { type: 'bank/roll' }, { type: 'bank/roll' });
    const mixed = run(
      start(),
      { type: 'counter/roll' },
      { type: 'bank/roll' },
      { type: 'counter/roll' },
      { type: 'bank/roll' },
    );
    expect(slice<Bank>(mixed, 'bank').rolls).toEqual(slice<Bank>(alone, 'bank').rolls);
    expect(Object.keys(mixed.kernel.streams).sort()).toEqual(['bank/dice', 'counter/dice']);
  });
});

describe('modes', () => {
  it('push, replace and pop, with a beat for each change', () => {
    const opened = game.reduce(start(), { type: 'counter/open', page: 2 }, sim);
    expect(opened.state.kernel.modes).toEqual([{ id: 'play' }, { id: 'menu', data: { page: 2 } }]);
    expect(opened.beats).toEqual([{ type: 'mode', modes: ['play', 'menu'] }]);
    const swapped = game.reduce(opened.state, { type: 'counter/swap' }, sim).state;
    expect(swapped.kernel.modes).toEqual([{ id: 'play' }, { id: 'menu' }]);
    expect(game.reduce(swapped, { type: 'counter/close' }, sim).state.kernel.modes).toEqual([{ id: 'play' }]);
  });

  it('refuse actions the current mode does not allow', () => {
    const opened = run(start(), { type: 'counter/open', page: 1 });
    expect(game.allowedActions(opened)).toEqual(['counter/close', 'counter/open', 'counter/swap']);
    const step = game.reduce(opened, { type: 'counter/add', by: 1 }, sim);
    expect(step).toMatchObject({
      accepted: false,
      beats: [{ type: 'rejected', action: 'counter/add', reason: 'mode', mode: 'menu' }],
    });
  });

  it('never empty the stack, and only hold registered modes', () => {
    expect(() => game.reduce(start(), { type: 'counter/close' }, sim)).toThrow('the mode stack is never empty');
    expect(() => game.reduce(start(), { type: 'counter/unknown-mode' }, sim)).toThrow('Unknown mode "limbo"');
  });
});

describe('facts and effects', () => {
  it('reads facts outside an action too', () => {
    expect(game.fact(start(), 'bank.credits', undefined, sim)).toBe(10);
    expect(() => game.fact(start(), 'bank.debt', undefined, sim)).toThrow('Unknown fact "bank.debt"');
  });

  it('throws on an unknown effect, and on effects that never stop', () => {
    expect(() => game.reduce(start(), { type: 'counter/unknown-effect' }, sim)).toThrow('Unknown effect "teleport"');
    expect(() => game.reduce(start(), { type: 'counter/loop' }, sim)).toThrow('Effects nested 64 deep');
  });
});

describe('createSession', () => {
  it('drains beats, refused ones included, and logs only accepted actions, as copies', () => {
    const session = createSession(game, sim, start());
    const action = { type: 'counter/add', by: 2 };
    session.dispatch(action);
    session.dispatch({ type: 'counter/add-then-refuse' });
    action.by = 99;
    expect(session.drain().map((b) => b.type)).toEqual(['counter/added', 'rejected']);
    expect(session.drain()).toEqual([]);
    expect(session.log).toEqual([{ type: 'counter/add', by: 2 }]);
    const replayed = session.log.reduce<GameState>((s, a) => game.reduce(s, a, sim).state, start());
    expect(canonicalJson(replayed)).toBe(canonicalJson(session.state));
  });
});
