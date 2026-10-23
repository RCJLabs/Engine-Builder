import { describe, expect, it } from 'vitest';
import { createRecordStore } from '../records.ts';
import { createGame, defineModule, type GameState, type Module, type SimContext } from '../sim/index.ts';
import { stateHash } from '../stateHash.ts';
import { placeOf, type RecordedStep, replayRecording } from './replay.ts';

// A camp whose loads and fees are content: editing a record is what changes a replay.
type Camp = { loads: number; coins: number };
const camp = (extra: Module['actions'] = {}): Module =>
  defineModule<Camp>({
    id: 'camp',
    init: ({ content }) => ({ loads: 0, coins: content.getOrThrow<{ coins: number }>('rule', 'start').coins }),
    actions: {
      carry(ctx) {
        ctx.write().loads += ctx.content.getOrThrow<{ by: number }>('rule', 'carry').by;
      },
      pay(ctx) {
        const fee = ctx.content.getOrThrow<{ fee: number }>('rule', 'pay').fee;
        if (ctx.read().coins < fee) ctx.refuse('too-poor');
        ctx.write().coins -= fee;
      },
      ...extra,
    },
    modes: { camp: { actions: ['camp/*'] } },
  });
const rules = (by: number, fee: number, coins = 5): SimContext => ({
  content: createRecordStore({ rule: { carry: { by }, pay: { fee }, start: { coins } } }),
});

const old = createGame({ modules: [camp({ rest: () => {} })], start: 'camp' });
const oldSim = rules(1, 2);
const actions = [{ type: 'camp/carry' }, { type: 'camp/pay' }, { type: 'camp/rest' }, { type: 'camp/carry' }];

/** The old run: its start, each step's state, and the recording a playtest would hold. */
function recorded() {
  const states: GameState[] = [old.init('7', oldSim)];
  const steps: RecordedStep[] = [];
  for (const action of actions) {
    const step = old.reduce(states.at(-1) as GameState, action, oldSim);
    states.push(step.state);
    steps.push({ action, hash: stateHash(step.state) });
  }
  const read: number[] = [];
  const was = (at: number) => {
    read.push(at);
    return states[at] as GameState;
  };
  return { states, steps, startHash: stateHash(states[0]), was, read };
}

describe('replayRecording', () => {
  it('plays every step the same on an unchanged game, reading no old state', () => {
    const run = recorded();
    const result = replayRecording({ game: old, sim: oldSim, start: old.init('7', oldSim), ...run });
    expect(result.stop).toBeUndefined();
    expect(result.state).toEqual(run.states.at(-1));
    expect(result.hashes).toEqual(run.steps.map((step) => step.hash));
    expect(run.read).toEqual([]);
  });

  it('stops after the first step that leaves another state, naming its slice, path and both values', () => {
    const run = recorded();
    const sim = rules(2, 2);
    const result = replayRecording({ game: old, sim, start: old.init('7', sim), ...run });
    expect(result.stop).toEqual({
      at: 1,
      why: 'differs',
      place: { slice: 'camp', path: '/loads', was: 1, now: 2, also: [] },
    });
    expect(result.state.camp).toEqual({ loads: 2, coins: 5 });
    expect(result.hashes).toHaveLength(1);
    expect(run.read).toEqual([1]);
  });

  it('stops at a changed start before any step', () => {
    const run = recorded();
    const sim = rules(1, 2, 9);
    const result = replayRecording({ game: old, sim, start: old.init('7', sim), ...run });
    expect(result.stop).toEqual({
      at: 0,
      why: 'differs',
      place: { slice: 'camp', path: '/coins', was: 5, now: 9, also: [] },
    });
    expect(result.hashes).toEqual([]);
  });

  it('stops before a step the game refuses now, or no longer has, with the state before it', () => {
    const run = recorded();
    const dear = rules(1, 9);
    const refused = replayRecording({ game: old, sim: dear, start: old.init('7', dear), ...run });
    expect(refused.stop).toEqual({ at: 2, why: 'refused', reason: 'too-poor' });
    expect(refused.state).toEqual(run.states[1]);
    // The edited game has no rest: step 3 can't be taken.
    const edited = createGame({ modules: [camp()], start: 'camp' });
    const gone = replayRecording({ game: edited, sim: oldSim, start: edited.init('7', oldSim), ...recorded() });
    expect(gone.stop).toEqual({ at: 3, why: 'refused', reason: 'unknown-action' });
    expect(gone.hashes).toHaveLength(2);
  });
});

describe('placeOf', () => {
  it('names a module’s slice before the kernel, and the kernel when nothing else changed', () => {
    const run = recorded();
    const [start, first] = run.states as [GameState, GameState];
    expect(placeOf(start, first)).toEqual({ slice: 'camp', path: '/loads', was: 0, now: 1, also: [] });
    const later = { ...start, kernel: { ...start.kernel, step: 4 } };
    expect(placeOf(start, later)).toEqual({ slice: 'kernel', path: '/step', was: 0, now: 4, also: [] });
    // A slice that sorts after the kernel's is still named before it.
    const after = { ...start, kernel: { ...start.kernel, step: 1 }, purse: { coins: 1 } } as GameState;
    expect(placeOf(start, after)).toMatchObject({ slice: 'purse', path: '', also: [] });
    // Two slices changed: the first by its key, and the other named.
    const both = { ...first, purse: { coins: 1 } } as GameState;
    expect(placeOf(start, both)).toMatchObject({ slice: 'camp', also: ['purse'] });
  });
});
