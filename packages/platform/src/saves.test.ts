import { createGame, createSaveFile, createSession, defineModule, type GameState, stateHash } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { salvageModules } from '../../core/test/salvage.ts';
import { BACKUP, BUILD, game, info, play, SLOT, saveOf, sim, stores } from '../test/runs.ts';
import { createSaves, memoryStore, type Store, StoreError } from './index.ts';

const setup = (store: Store = memoryStore()) => ({
  store,
  saves: createSaves({ store, game: 'salvage-run', edition: 'full' }),
});
const savedAt = async (store: Store, key: string) => JSON.parse((await store.get(key)) ?? 'null')?.savedAt;

describe.each(stores)('save slots in %s', (_name, open) => {
  it('continues a run saved and loaded halfway to the same end as the run that never stopped', async () => {
    const saves = createSaves({ store: await open(), game: 'salvage-run', edition: 'full' });
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const whole = play(seed);
      const half = Math.floor(whole.log.length / 2);
      const first = createSession(game, sim, game.init(seed, sim));
      for (const action of whole.log.slice(0, half)) first.dispatch(action);
      expect(await saves.write(seed, saveOf(first))).toEqual({ ok: true });
      const loaded = await saves.load(seed, game, sim, BUILD);
      if (!loaded.ok) throw new Error(loaded.message);
      const rest = createSession(game, sim, loaded.state);
      for (const action of whole.log.slice(half)) rest.dispatch(action);
      expect(stateHash(rest.state)).toBe(stateHash(whole.state));
    }
  });

  it('lists slots by their summaries, the most recent first, and forgets a removed one', async () => {
    const saves = createSaves({ store: await open(), game: 'salvage-run', edition: 'full' });
    await saves.write('slot-1', saveOf(play('x', 10), 100));
    await saves.write('auto', saveOf(play('y', 10), 300));
    await saves.write('slot-2', saveOf(play('z', 10), 200));
    expect(await saves.list()).toEqual([
      { slot: 'auto', readable: true, savedAt: 300, build: BUILD, summary: { savedAt: 300 } },
      { slot: 'slot-2', readable: true, savedAt: 200, build: BUILD, summary: { savedAt: 200 } },
      { slot: 'slot-1', readable: true, savedAt: 100, build: BUILD, summary: { savedAt: 100 } },
    ]);
    expect(await saves.remove('slot-2')).toEqual({ ok: true });
    expect((await saves.list()).map((s) => s.slot)).toEqual(['auto', 'slot-1']);
    expect(await saves.load('slot-2', game, sim, BUILD)).toMatchObject({ ok: false, problem: 'empty' });
  });
});

describe('slot lists', () => {
  it('lists a slot whose summary is unreadable after the rest, and skips keys it did not write', async () => {
    const { store, saves } = setup();
    await saves.write('slot-1', saveOf(play('x', 5), 100));
    await saves.write('slot-2', saveOf(play('y', 5), 200));
    await saves.write('slot-3', saveOf(play('z', 5), 300));
    await store.write({
      'eb/salvage-run/full/summary/slot-2': '{"torn',
      'eb/salvage-run/full/summary/slot-3': undefined,
      'eb/salvage-run/full/summary/gone': JSON.stringify({ slot: 'gone', savedAt: 1, build: 'x', summary: {} }),
      'eb/salvage-run/full/slot/Not A Slot': '{}',
    });
    expect(await saves.list()).toEqual([
      { slot: 'slot-1', readable: true, savedAt: 100, build: BUILD, summary: { savedAt: 100 } },
      { slot: 'slot-2', readable: false },
      { slot: 'slot-3', readable: false },
    ]);
    expect((await saves.load('slot-2', game, sim, BUILD)).ok).toBe(true);
  });
});

describe('writing a slot', () => {
  it('keeps each game and edition to its own keys', async () => {
    const store = memoryStore();
    const full = createSaves({ store, game: 'salvage-run', edition: 'full' });
    const demo = createSaves({ store, game: 'salvage-run', edition: 'demo' });
    await full.write('slot-1', saveOf(play('x', 5)));
    expect(await demo.list()).toEqual([]);
    expect(await store.keys('')).toEqual([SLOT, 'eb/salvage-run/full/summary/slot-1']);
    await expect(demo.write('slot-1', saveOf(play('x', 5)))).rejects.toThrow("can't go in salvage-run/demo");
  });

  it('keeps the save it replaces as the backup, and removes the backup with the slot', async () => {
    const { store, saves } = setup();
    await saves.write('slot-1', saveOf(play('x', 5), 1));
    expect(await store.get(BACKUP)).toBeUndefined();
    await saves.write('slot-1', saveOf(play('y', 5), 2));
    await saves.write('slot-1', saveOf(play('z', 5), 3));
    expect([await savedAt(store, SLOT), await savedAt(store, BACKUP)]).toEqual([3, 2]);
    await saves.write('slot-1', saveOf(play('z', 5), 3));
    expect(await savedAt(store, BACKUP)).toBe(2);
    await saves.remove('slot-1');
    expect(await store.keys('eb/')).toEqual([]);
  });

  it('quarantines a damaged save before writing over it, and keeps it out of the backup', async () => {
    const { store, saves } = setup();
    await saves.write('slot-1', saveOf(play('x', 5), 1));
    await saves.write('slot-1', saveOf(play('y', 5), 2));
    await store.write({ [SLOT]: 'garbage' });
    const result = await saves.write('slot-1', saveOf(play('z', 5), 3));
    expect(result).toEqual({ ok: true, quarantined: 'eb/salvage-run/full/quarantine/slot-1/0000' });
    expect((await saves.quarantined())[0]?.raw).toBe('garbage');
    expect(await savedAt(store, BACKUP)).toBe(1);
    // JSON whose checksum is off is as damaged as text that isn't JSON.
    await store.write({ [SLOT]: JSON.stringify({ ...saveOf(play('q', 5), 4), savedAt: 99 }) });
    expect(await saves.write('slot-1', saveOf(play('z', 5), 5))).toMatchObject({ ok: true, quarantined: /0001$/ });
    expect((await saves.quarantined())[1]?.message).toBe("The save's checksum doesn't match its contents");
  });

  it('backs up a save with a module this game lacks, rather than calling it newer', async () => {
    const { store, saves } = setup();
    const extra = defineModule<{ n: number }>({ id: 'log-book', init: () => ({ n: 0 }) });
    const state = createGame({ modules: [...salvageModules, extra], start: 'travel' }).init('x', sim);
    await saves.write('slot-1', createSaveFile({ snapshot: state, log: [], state }, info(1)));
    expect(await saves.write('slot-1', saveOf(play('y', 5), 2))).toEqual({ ok: true });
    expect(await savedAt(store, BACKUP)).toBe(1);
  });

  it('quarantines a save from a newer game before an older one writes over it', async () => {
    const { store, saves } = setup();
    const newer = play('x', 5);
    const state = {
      ...newer.state,
      kernel: { ...newer.state.kernel, versions: { ...newer.state.kernel.versions, hold: 9 } },
    };
    const file = createSaveFile({ snapshot: state as GameState, log: [], state: state as GameState }, info(1));
    await store.write({ [SLOT]: JSON.stringify(file) });
    const result = await saves.write('slot-1', saveOf(play('y', 5)));
    expect(result).toMatchObject({ ok: true, quarantined: expect.any(String) });
    expect((await saves.quarantined())[0]).toMatchObject({ problem: 'newer', message: 'Saved by a newer game: hold' });
  });

  it("quarantines another tab's save before writing over it, but lets a new game replace an old one", async () => {
    const store = memoryStore();
    const tabA = createSaves({ store, game: 'salvage-run', edition: 'full' });
    const tabB = createSaves({ store, game: 'salvage-run', edition: 'full' });
    expect(await tabA.write('slot-1', saveOf(play('a', 5), 1))).toEqual({ ok: true });
    await tabB.load('slot-1', game, sim, BUILD);
    expect(await tabA.write('slot-1', saveOf(play('a', 9), 2))).toEqual({ ok: true });
    const result = await tabB.write('slot-1', saveOf(play('b', 9), 3));
    expect(result).toMatchObject({ ok: true, quarantined: expect.any(String) });
    expect(await tabB.quarantined()).toMatchObject([{ problem: 'conflict' }]);
    // The backup is still the save tab B's run went on from.
    expect(await savedAt(store, BACKUP)).toBe(1);
    const fresh = createSaves({ store, game: 'salvage-run', edition: 'full' });
    expect(await fresh.write('slot-1', saveOf(play('c', 3), 4))).toEqual({ ok: true });
  });

  it('reports a write the store refuses, and keeps the save that was there', async () => {
    const failures: unknown[] = [];
    const store = memoryStore({ quota: 30_000 });
    const saves = createSaves({ store, game: 'salvage-run', edition: 'full', onFailure: (f) => failures.push(f) });
    const small = saveOf(play('x', 3));
    expect(await saves.write('slot-1', small)).toEqual({ ok: true });
    const big = createSaveFile(
      { snapshot: play('x', 3).start, log: [], state: play('x', 3).start },
      { ...info(2), summary: { note: 'x'.repeat(40_000) } },
    );
    expect(await saves.write('slot-1', big)).toMatchObject({ ok: false, reason: 'full' });
    expect(failures).toEqual([{ slot: 'slot-1', reason: 'full', message: 'The memory store is full' }]);
    const loaded = await saves.load('slot-1', game, sim, BUILD);
    expect(loaded.ok && loaded.file.check).toBe(small.check);
  });

  it('reports a write as failed when storage refuses even to read the slot, and a load throws', async () => {
    const failures: unknown[] = [];
    const refusing: Store = {
      ...memoryStore(),
      get: async () => {
        throw new StoreError('blocked', 'Storage is turned off');
      },
    };
    const saves = createSaves({
      store: refusing,
      game: 'salvage-run',
      edition: 'full',
      onFailure: (f) => failures.push(f),
    });
    const failed = { ok: false, reason: 'blocked', message: 'Storage is turned off' };
    expect(await saves.write('slot-1', saveOf(play('x', 3)))).toEqual(failed);
    expect(failures).toEqual([{ slot: 'slot-1', reason: 'blocked', message: 'Storage is turned off' }]);
    await expect(saves.load('slot-1', game, sim, BUILD)).rejects.toThrow('Storage is turned off');
  });

  it('refuses slot names that are not kebab-case, and files that are not saves', async () => {
    const { saves } = setup();
    await expect(saves.write('Slot 1', saveOf(play('x', 3)))).rejects.toThrow('"Slot 1" is not a valid slot name');
    const changed = { ...saveOf(play('x', 3)), savedAt: 5 };
    await expect(saves.write('slot-1', changed)).rejects.toThrow("not a save to keep: The save's checksum");
  });
});
