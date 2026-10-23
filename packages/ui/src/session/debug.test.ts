import { createGame, createPack, createRecordStore, debugModule, debugRun, defineModule } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { type Opened, resumeFrom } from './fromPack.ts';
import { startPlay } from './play.ts';
import { saveOf } from './saving.ts';

// A purse the debug step can fill, played in the editor's game (with the module) and the player
// page's (without it), from the same pack.
const purse = defineModule<{ coins: number }>({
  id: 'purse',
  init: () => ({ coins: 0 }),
  actions: {
    earn(ctx) {
      ctx.write().coins += 1;
    },
  },
  effects: {
    add(ctx, effect) {
      ctx.write().coins += effect.by as number;
    },
  },
  modes: { play: { actions: ['*'] } },
});
const sim = { content: createRecordStore({}) };
const pack = createPack({ id: 'purse', name: 'Purse', version: '1.0.0' }, {});
const opened = (debug: boolean): Opened => ({
  pack,
  setup: {
    game: createGame({ modules: debug ? [purse, debugModule()] : [purse], start: 'play' }),
    sim,
    kits: [],
    wants: { facts: [], conditions: [] },
  },
  screens: {},
  theme: undefined,
  shell: undefined,
  name: 'Purse',
  audio: { sounds: {}, ambience: {}, music: {}, files: {} },
  debug,
});
const editor = opened(true);
const player = opened(false);

/** A save of the editor's game, marked as the player page's own, as a save changed by hand would be. */
function saved(debugged: boolean) {
  const play = startPlay(editor.setup, 'seed');
  play.act({ type: 'purse/earn' });
  if (debugged) expect(play.take(debugRun([{ effect: 'add', by: 50 }])).accepted).toBe(true);
  play.act({ type: 'purse/earn' });
  return { play, raw: JSON.stringify(saveOf(editor, play, { edition: 'play' }, 1)) };
}

describe('a save the debug tools changed (M4.9, D59)', () => {
  it('is refused by the player page’s game, before its log is replayed', () => {
    const resumed = resumeFrom(player, saved(true).raw);
    expect(resumed).toMatchObject({ ok: false, problem: 'debug' });
    if (!resumed.ok) expect(resumed.message).toMatch(/plays only in the editor/);
  });

  it('is refused once compacted too, its steps counted in the snapshot', () => {
    const { play } = saved(true);
    play.compact();
    const file = saveOf(editor, play, { edition: 'play' }, 2);
    expect(file.log).toEqual([]);
    expect(resumeFrom(player, JSON.stringify(file))).toMatchObject({ ok: false, problem: 'debug' });
  });

  it('loads in the editor’s game, and says so in its summary', () => {
    const { play, raw } = saved(true);
    const resumed = resumeFrom(editor, raw);
    expect(resumed.ok).toBe(true);
    if (resumed.ok) expect(resumed.play.state.purse).toEqual(play.state.purse);
    expect(JSON.parse(raw).summary).toEqual({ turn: 3, debug: 1 });
  });

  it('leaves a save with no debug step as any save: the player page loads it', () => {
    const { raw } = saved(false);
    expect(JSON.parse(raw).summary).toEqual({ turn: 2 });
    const resumed = resumeFrom(player, raw);
    expect(resumed.ok).toBe(true);
    if (resumed.ok) expect(resumed.play.state.purse).toEqual({ coins: 2 });
  });

  it('is never offered: the debug step is the editor’s own, taken only through take()', () => {
    const play = startPlay(editor.setup, 'seed');
    expect(play.view.offered).toEqual([{ type: 'purse/earn' }]);
    expect(play.act(debugRun([{ effect: 'add', by: 1 }])).accepted).toBe(false);
    expect(play.state.purse).toEqual({ coins: 0 });
  });
});
