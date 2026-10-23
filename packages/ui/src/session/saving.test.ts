import { createGame, createPack, createRecordStore, defineModule, loadSave, stateHash } from '@eb/core';
import { MAX_LOG } from '@eb/platform';
import { describe, expect, it } from 'vitest';
import type { Opened } from './fromPack.ts';
import { startPlay } from './play.ts';
import { saveOf } from './saving.ts';

// A game whose one action is always on offer, so a play can run as long as a test needs.
const tick = defineModule<{ n: number }>({
  id: 'tick',
  init: () => ({ n: 0 }),
  actions: {
    up(ctx) {
      ctx.write().n += 1;
    },
  },
  facts: { n: ({ state }) => state.n },
  modes: { play: { actions: ['*'] } },
});
const sim = { content: createRecordStore({}) };
const game = createGame({ modules: [tick], start: 'play' });
const pack = createPack({ id: 'counting', name: 'Counting', version: '1.0.0' }, {});
const opened = (line?: string): Opened => ({
  pack,
  setup: { game, sim, kits: [], wants: { facts: ['tick.n'], conditions: [] } },
  screens: {},
  theme: undefined,
  shell: line === undefined ? undefined : { 'slot-line': line },
  name: 'Counting',
  audio: { sounds: {}, ambience: {}, music: {}, files: {} },
  debug: false,
});

describe('a play’s saves (M4.3)', () => {
  it('saves its game, edition, build, time and a summary of the step, its line and its Daily', () => {
    const play = startPlay(opened('n = {tick.n}').setup, 'seed');
    for (let i = 0; i < 3; i++) play.act({ type: 'tick/up' });
    const file = saveOf(opened('n = {tick.n}'), play, { edition: 'play', daily: 292 }, 1234);
    expect(file).toMatchObject({ game: 'counting', edition: 'play', build: pack.hash, savedAt: 1234 });
    expect(file.summary).toEqual({ turn: 3, line: 'n = 3', daily: 292 });
    expect(saveOf(opened(), play, { edition: 'play' }, 1).summary).toEqual({ turn: 3 });
  });

  it('compacts once a save holds MAX_LOG actions, and every save still loads to its state', () => {
    const play = startPlay(opened().setup, 'seed');
    const lengths: number[] = [];
    for (let i = 0; i < MAX_LOG * 2 + 5; i++) {
      play.act({ type: 'tick/up' });
      const file = saveOf(opened(), play, { edition: 'play' }, i);
      lengths.push(file.log.length);
      const loaded = loadSave(game, JSON.parse(JSON.stringify(file)), sim, { game: 'counting', build: pack.hash });
      if (!loaded.ok) throw new Error(loaded.message);
      expect(stateHash(loaded.state)).toBe(stateHash(play.state));
    }
    expect(Math.max(...lengths)).toBe(MAX_LOG);
    // The save that reached MAX_LOG is the last long one: the next starts from its state.
    expect(lengths[MAX_LOG - 1]).toBe(MAX_LOG);
    expect(lengths[MAX_LOG]).toBe(1);
  });
});
