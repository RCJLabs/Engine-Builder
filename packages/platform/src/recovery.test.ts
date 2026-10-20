import {
  type Action,
  createGame,
  createSaveFile,
  createSession,
  defineModule,
  type GameState,
  type InitContext,
  loadSave,
  type Module,
  stateHash,
} from '@eb/core';
import { describe, expect, it } from 'vitest';
import { botAction, botFor, salvageModules } from '../../core/test/salvage.ts';
import { BACKUP, BUILD, edited, game, info, play, SLOT, saveOf, sim } from '../test/runs.ts';
import { createSaves, memoryStore, type Store } from './index.ts';

const Q = (n: number) => `eb/salvage-run/full/quarantine/slot-1/${String(n).padStart(4, '0')}`;
const setup = (store: Store = memoryStore(), maxLog?: number) => ({
  store,
  saves: createSaves({ store, game: 'salvage-run', edition: 'full', ...(maxLog ? { maxLog } : {}) }),
});
const savedAt = async (store: Store, key: string) => JSON.parse((await store.get(key)) ?? 'null')?.savedAt;
// A save the same build can't replay: the game throws on its log.
const crashing = (savedAt: number) => {
  const session = play('x', 5);
  return createSaveFile(
    { snapshot: session.start, log: [{ type: 'no-such/action' }], state: session.state },
    info(savedAt),
  );
};

describe('loading a slot whose save is broken', () => {
  it('quarantines it, leaves it in place, and loads the backup instead', async () => {
    const { store, saves } = setup();
    const first = play('x', 8);
    await saves.write('slot-1', saveOf(first, 1));
    await saves.write('slot-1', saveOf(play('y', 8), 2));
    await store.write({ [SLOT]: '{"format": 1, "torn' });
    const loaded = await saves.load('slot-1', game, sim, BUILD);
    expect(loaded).toMatchObject({ ok: true, fromBackup: true, quarantined: Q(0) });
    expect(loaded.ok && stateHash(loaded.state)).toBe(stateHash(first.state));
    expect(await store.get(SLOT)).toBe('{"format": 1, "torn');
    expect(await saves.quarantined()).toEqual([
      { key: Q(0), slot: 'slot-1', problem: 'damaged', message: 'The save is not JSON', raw: '{"format": 1, "torn' },
    ]);
    // The next write replaces the broken save without making it the backup.
    expect(await saves.write('slot-1', saveOf(play('z', 8), 3))).toEqual({ ok: true, quarantined: Q(0) });
    expect(await savedAt(store, BACKUP)).toBe(1);
    expect(await saves.quarantined()).toHaveLength(1);
  });

  it('quarantines a save the game fails on, with no backup to go back to', async () => {
    const { saves } = setup();
    await saves.write('slot-1', crashing(1));
    const loaded = await saves.load('slot-1', game, sim, BUILD);
    expect(loaded).toMatchObject({ ok: false, problem: 'crashed', quarantined: Q(0) });
    expect(loaded.ok ? '' : loaded.message).toContain('Unknown action "no-such/action"');
  });

  it('goes back from a save the game fails on, and keeps that backup through the next write', async () => {
    const { store, saves } = setup();
    await saves.write('slot-1', saveOf(play('x', 8), 1));
    await saves.write('slot-1', crashing(2));
    expect(await saves.load('slot-1', game, sim, BUILD)).toMatchObject({ ok: true, fromBackup: true });
    await saves.write('slot-1', saveOf(play('z', 8), 3));
    expect(await savedAt(store, BACKUP)).toBe(1);
    expect(await saves.quarantined()).toMatchObject([{ problem: 'crashed', raw: JSON.stringify(crashing(2)) }]);
  });

  it('quarantines the backup too when it is broken as well', async () => {
    const { store, saves } = setup();
    await saves.write('slot-1', saveOf(play('x', 8), 1));
    await saves.write('slot-1', saveOf(play('y', 8), 2));
    await store.write({ [SLOT]: 'torn one', [BACKUP]: 'torn two' });
    const loaded = await saves.load('slot-1', game, sim, BUILD);
    expect(loaded).toMatchObject({ ok: false, problem: 'damaged', quarantined: Q(0) });
    expect((await saves.quarantined()).map((q) => [q.raw, q.message])).toEqual([
      ['torn one', 'The save is not JSON'],
      ['torn two', 'The backup: The save is not JSON'],
    ]);
  });

  it('does not go back from a save of a newer game: the player should update', async () => {
    const { store, saves } = setup();
    await saves.write('slot-1', saveOf(play('x', 8), 1));
    await saves.write('slot-1', saveOf(play('y', 8), 2));
    const newer = edited(saveOf(play('y', 8), 3), (body) => {
      ((body.snapshot as GameState).kernel.versions as Record<string, number>).hold = 2;
    });
    await store.write({ [SLOT]: JSON.stringify(newer) });
    const loaded = await saves.load('slot-1', game, sim, BUILD);
    expect(loaded).toMatchObject({ ok: false, problem: 'newer', quarantined: Q(0) });
    expect('fromBackup' in loaded).toBe(false);
  });
});

describe('quarantine', () => {
  it('numbers a new entry past any left by hand, so none is written over', async () => {
    const { store, saves } = setup();
    const entry = (raw: string) => JSON.stringify({ slot: 'slot-1', problem: 'damaged', message: 'by hand', raw });
    await store.write({ [Q(0)]: entry('a'), [Q(2)]: entry('b'), [SLOT]: 'c' });
    expect(await saves.load('slot-1', game, sim, BUILD)).toMatchObject({ ok: false, quarantined: Q(3) });
    expect((await saves.quarantined()).map((q) => q.raw)).toEqual(['a', 'b', 'c']);
  });
});

describe('loading a save that an update changes', () => {
  const hold = salvageModules.find((m) => m.id === 'hold') as Module;
  const holdV2 = defineModule({
    ...(hold as object),
    id: 'hold',
    version: 2,
    init: (ctx: InitContext) => ({ ...(hold.init(ctx) as object), debts: 0 }),
    migrate: { 2: (slice: unknown) => ({ ...(slice as object), debts: 0 }) },
  } as never);
  const gameV2 = createGame({ modules: salvageModules.map((m) => (m.id === 'hold' ? holdV2 : m)), start: 'travel' });

  it('keeps the original when its log plays out otherwise under this build', async () => {
    const { saves } = setup();
    const file = edited(saveOf(play('x', 30), 1, 'old'), (body) => {
      const log = body.log as { type: string; choice?: string }[];
      log[log.findIndex((a) => a.type === 'voyage/choose')] = { type: 'voyage/choose', choice: 'nowhere' };
    });
    await saves.write('slot-1', file);
    const loaded = await saves.load('slot-1', game, sim, BUILD);
    expect(loaded).toMatchObject({ ok: true, quarantined: Q(0), report: { differs: true } });
    const [kept] = await saves.quarantined();
    expect(kept).toMatchObject({ problem: 'changed', raw: JSON.stringify(file) });
    expect(kept?.message).toMatch(
      /^The save as it was before build test loaded it, which skipped \d+ logged actions?$/,
    );
  });

  it('keeps the original of a save it migrates', async () => {
    const { saves } = setup();
    await saves.write('slot-1', saveOf(play('x', 30), 1));
    const loaded = await saves.load('slot-1', gameV2, sim, BUILD);
    expect(loaded).toMatchObject({ ok: true, quarantined: Q(0), report: { migrated: [{ module: 'hold' }] } });
    expect((await saves.quarantined())[0]?.message).toBe(
      'The save as it was before build test loaded it, which migrated hold from version 1 to 2',
    );
  });

  it('keeps no copy when only the build changed', async () => {
    const { saves } = setup();
    await saves.write('slot-1', saveOf(play('x', 30), 1, 'old'));
    const loaded = await saves.load('slot-1', game, sim, BUILD);
    expect(loaded).toMatchObject({ ok: true, report: { differs: false, skipped: 0 } });
    expect('quarantined' in loaded).toBe(false);
    expect(await saves.quarantined()).toEqual([]);
  });
});

describe('writeSession', () => {
  it('compacts the session after a write that saved maxLog actions, and every save still loads', async () => {
    const { store, saves } = setup(memoryStore(), 10);
    const session = createSession(game, sim, game.init('long', sim));
    const bot = botFor('long');
    const lengths: number[] = [];
    for (let n = 0; n < 400; n++) {
      const action = botAction(session.state, game.allowedActions(session.state), bot);
      if (!action) break;
      session.dispatch(action as Action);
      if (n % 4 !== 3) continue;
      expect(await saves.writeSession('slot-1', session, { build: BUILD, savedAt: n })).toEqual({ ok: true });
      lengths.push(JSON.parse((await store.get(SLOT)) ?? '').log.length);
      const loaded = await saves.load('slot-1', game, sim, BUILD);
      expect(loaded.ok && stateHash(loaded.state)).toBe(stateHash(session.state));
      if ((lengths.at(-1) as number) >= 10) expect([session.log.length, session.start]).toEqual([0, session.state]);
    }
    expect(lengths.length).toBeGreaterThan(5);
    expect(lengths.some((l) => l >= 10)).toBe(true);
    expect(Math.max(...lengths)).toBeLessThan(10 + 4);
  });

  it('keeps the log of a session whose write failed', async () => {
    const saves = createSaves({ store: memoryStore({ quota: 100 }), game: 'salvage-run', edition: 'full', maxLog: 1 });
    const session = play('x', 30);
    const log = session.log;
    const result = await saves.writeSession('slot-1', session, { build: BUILD, savedAt: 1 });
    expect(result).toMatchObject({ ok: false, reason: 'full' });
    expect(session.log).toBe(log);
  });

  it('leaves a session whose log is under maxLog as it was', async () => {
    const { saves } = setup();
    const session = play('x', 30);
    const log = session.log;
    await saves.writeSession('slot-1', session, { build: BUILD, savedAt: 1 });
    expect(session.log).toBe(log);
    expect(log.length).toBeGreaterThan(0);
  });
});

describe('loadWith: a save read by a reader of its own (M4.3)', () => {
  // A reader that holds the game elsewhere, as a game's worker does, giving back no state.
  const reader =
    (build = BUILD) =>
    async (raw: string) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { ok: false as const, problem: 'damaged' as const, message: 'The save is not JSON' };
      }
      const result = loadSave(game, parsed, sim, { game: 'salvage-run', build });
      return result.ok
        ? { ok: true as const, file: result.file, report: result.report, hash: stateHash(result.state) }
        : result;
    };

  it('loads as load does, and goes back to the backup of a broken save', async () => {
    const { store, saves } = setup();
    const first = play('x', 8);
    await saves.write('slot-1', saveOf(first, 1));
    expect(await saves.loadWith('slot-1', BUILD, reader())).toMatchObject({ ok: true, hash: stateHash(first.state) });
    await saves.write('slot-1', saveOf(play('y', 8), 2));
    await store.write({ [SLOT]: '{"torn' });
    expect(await saves.loadWith('slot-1', BUILD, reader())).toMatchObject({
      ok: true,
      fromBackup: true,
      quarantined: Q(0),
      hash: stateHash(first.state),
    });
    expect(await saves.loadWith('slot-9', BUILD, reader())).toMatchObject({ ok: false, problem: 'empty' });
  });

  it('keeps the original of a save another build changes, naming the build that loaded it', async () => {
    const { saves } = setup();
    await saves.write('slot-1', saveOf(play('x', 8), 1));
    const changing = async (raw: string) => {
      const read = await reader('next')(raw);
      return read.ok ? { ...read, report: { ...read.report, differs: true } } : read;
    };
    expect(await saves.loadWith('slot-1', 'next', changing)).toMatchObject({ ok: true, quarantined: Q(0) });
    expect((await saves.quarantined())[0]?.message).toContain('before build next loaded it');
  });

  it('gives a slot’s save as stored, even one that won’t load, and forgets only quarantined copies', async () => {
    const { store, saves } = setup();
    await saves.write('slot-1', saveOf(play('x', 4), 1));
    await store.write({ [SLOT]: '{"torn' });
    expect(await saves.raw('slot-1')).toBe('{"torn');
    expect(await saves.raw('slot-2')).toBeUndefined();
    await saves.loadWith('slot-1', BUILD, reader());
    expect(await saves.forget(Q(0))).toEqual({ ok: true });
    expect(await saves.quarantined()).toEqual([]);
    expect(await saves.forget(SLOT)).toMatchObject({ ok: false });
    expect(await saves.raw('slot-1')).toBe('{"torn');
  });
});
