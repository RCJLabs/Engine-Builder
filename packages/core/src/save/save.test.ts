import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { botAction, botFor, game, salvageModules, sim } from '../../test/salvage.ts';
import {
  createGame,
  createSession,
  defineModule,
  type GameState,
  type InitContext,
  type Module,
} from '../sim/index.ts';
import { stateHash } from '../stateHash.ts';
import { createSaveFile, loadSave, SAVE_VERSION, type SaveFile } from './index.ts';

// A save written by format 1 with every module at version 1. It must keep loading, unchanged.
const FIXTURE = JSON.parse(readFileSync(new URL('../../test/fixtures/saves/salvage-v1.json', import.meta.url), 'utf8'));
const FIXTURE_HASH = '94b566fe492a48eb';
const options = { game: 'salvage-run', build: 'test' };
const info = { game: 'salvage-run', edition: 'test', build: 'test', savedAt: 1 };

const withModules = (modules: readonly Module[]) => createGame({ modules, start: 'travel' });
const swap = (id: string, module: Module) => salvageModules.map((m) => (m.id === id ? module : m));
const hold = salvageModules.find((m) => m.id === 'hold') as Module;
// The hold at version 2, migrated by `migrate`: a planted change of shape.
const holdV2 = (migrate: (slice: unknown) => unknown) =>
  defineModule({
    ...(hold as object),
    id: 'hold',
    version: 2,
    init: (ctx: InitContext) => ({ ...(hold.init(ctx) as object), debts: 0 }),
    migrate: { 2: migrate },
  } as never);
// The fixture after a change, with its checksum made right again, so only the change is wrong.
const edited = (change: (file: Record<string, unknown>) => void): SaveFile => {
  const { check: _, ...body } = structuredClone(FIXTURE) as Record<string, unknown>;
  change(body);
  return { ...body, check: stateHash(body) } as unknown as SaveFile;
};

function playOn(state: GameState, seed: string, g = game, limit = 400) {
  const session = createSession(g, sim, state);
  const bot = botFor(seed);
  for (let n = 0; n < limit; n++) {
    const action = botAction(session.state, g.allowedActions(session.state), bot);
    if (!action) break;
    session.dispatch(action as { type: string });
  }
  return session;
}

describe('the v1 fixture', () => {
  it('loads to the state it was saved with, and plays on to an ending', () => {
    const loaded = loadSave(game, FIXTURE, sim, options);
    if (!loaded.ok) throw new Error(loaded.message);
    expect(stateHash(loaded.state)).toBe(FIXTURE_HASH);
    expect(loaded.report).toEqual({ migrated: [], added: [], kept: [], replayed: 0, skipped: 0, differs: false });
    const ending = (playOn(loaded.state, 'fixture').state.voyage as { ending: string | null }).ending;
    expect(['home', 'lost']).toContain(ending);
  });

  it('loads after a planted v2 migration of the hold', () => {
    const v2 = holdV2((slice) => ({ ...(slice as object), debts: 0 }));
    const loaded = loadSave(withModules(swap('hold', v2)), FIXTURE, sim, options);
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.report.migrated).toEqual([{ module: 'hold', from: 1, to: 2 }]);
    expect(loaded.state.hold).toMatchObject({ debts: 0 });
    expect(loaded.state.kernel.versions.hold).toBe(2);
    expect(playOn(loaded.state, 'fixture', withModules(swap('hold', v2))).state.kernel.step).toBeGreaterThan(35);
  });

  it('changes and freezes only its own copy of the save', () => {
    const file = structuredClone(FIXTURE);
    const inPlace = holdV2((slice) => Object.assign(slice as object, { debts: 0 }));
    const logBook = defineModule<{ entries: string[] }>({ id: 'log-book', init: () => ({ entries: [] }) });
    const modules = [...swap('hold', inPlace).filter((m) => m.id !== 'logic'), logBook];
    expect(loadSave(withModules(modules), file, sim, options)).toMatchObject({ ok: true });
    expect(file).toEqual(FIXTURE);
    const frozenWithin = (value: unknown): boolean =>
      typeof value === 'object' &&
      value !== null &&
      (Object.isFrozen(value) || Object.values(value).some(frozenWithin));
    expect(frozenWithin(file)).toBe(false);
  });

  it('starts a module the save lacks, and keeps a slice no module owns', () => {
    const logBook = defineModule<{ entries: string[] }>({ id: 'log-book', init: () => ({ entries: [] }) });
    const loaded = loadSave(
      withModules([...salvageModules.filter((m) => m.id !== 'logic'), logBook]),
      FIXTURE,
      sim,
      options,
    );
    if (!loaded.ok) throw new Error(loaded.message);
    expect(loaded.report).toMatchObject({ added: ['log-book'], kept: ['logic'] });
    expect(loaded.state['log-book']).toEqual({ entries: [] });
    expect(loaded.state.logic).toEqual(FIXTURE.snapshot.logic);
    expect(loaded.state.kernel.versions).toMatchObject({ 'log-book': 1, logic: 1 });
  });

  it('starts a module the save lacks with the draws a new game would make', () => {
    const tally = defineModule<{ pick: number }>({
      id: 'tally',
      init: ({ rng }) => ({ pick: rng('pick').int(1, 1_000_000) }),
    });
    const bigger = withModules([...salvageModules, tally]);
    const loaded = loadSave(bigger, FIXTURE, sim, options);
    if (!loaded.ok) throw new Error(loaded.message);
    const fresh = bigger.init(FIXTURE.snapshot.kernel.seed, sim);
    expect(loaded.state.tally).toEqual(fresh.tally);
    expect(loaded.state.kernel.streams['tally/pick']).toEqual(fresh.kernel.streams['tally/pick']);
  });
});

describe('saves this game cannot read', () => {
  it.each([
    ['a file that is not a save', () => ['not a save'], 'damaged', 'Not a save file'],
    ['a damaged file', () => ({ ...FIXTURE, savedAt: FIXTURE.savedAt + 1 }), 'damaged', "checksum doesn't match"],
    ['a newer format', () => ({ ...FIXTURE, format: SAVE_VERSION + 1 }), 'newer', 'formats up to 1'],
    [
      'another game',
      () =>
        edited((f) => {
          f.game = 'other-game';
        }),
      'other-game',
      'from "other-game"',
    ],
    [
      'a newer hold',
      () =>
        edited((f) => {
          ((f.snapshot as GameState).kernel.versions as Record<string, number>).hold = 3;
        }),
      'newer',
      'needs a newer game',
    ],
    [
      'a mode the game no longer has',
      () =>
        edited((f) => {
          ((f.snapshot as GameState).kernel.modes as unknown[]).push({ id: 'limbo' });
        }),
      'cannot-migrate',
      'mode "limbo"',
    ],
    [
      'a slice with no version',
      () =>
        edited((f) => {
          delete ((f.snapshot as GameState).kernel.versions as Record<string, number>).hold;
        }),
      'cannot-migrate',
      'has no version for its hold slice',
    ],
    [
      'a log that is not actions',
      () =>
        edited((f) => {
          f.log = [1];
        }),
      'damaged',
      'not a list of actions',
    ],
  ] as const)('refuses %s', (_name, make, problem, message) => {
    const loaded = loadSave(game, make(), sim, options);
    expect(loaded).toMatchObject({ ok: false, problem });
    expect(loaded.ok ? '' : loaded.message).toContain(message);
  });

  it('refuses a migration that leaves what a save cannot hold', () => {
    const broken = holdV2((slice) => ({ ...(slice as object), debts: Number.NaN }));
    const loaded = loadSave(withModules(swap('hold', broken)), FIXTURE, sim, options);
    expect(loaded).toMatchObject({ ok: false, problem: 'cannot-migrate' });
    expect(loaded.ok ? '' : loaded.message).toContain("A migration left something a save can't hold");
  });
});

describe('the log', () => {
  const played = playOn(game.init('logged', sim), 'logged', game, 30);
  const file = () =>
    JSON.parse(JSON.stringify(createSaveFile({ snapshot: played.start, log: played.log, state: played.state }, info)));

  it('replays to exactly the state saved, on the same build', () => {
    const loaded = loadSave(game, file(), sim, options);
    if (!loaded.ok) throw new Error(loaded.message);
    expect(stateHash(loaded.state)).toBe(stateHash(played.state));
    expect(loaded.report).toMatchObject({ replayed: played.log.length, skipped: 0, differs: false });
    expect(played.log.length).toBeGreaterThan(20);
  });

  it('refuses a log that replays elsewhere on the same build, and loads it under another', () => {
    const changed = file();
    const choose = changed.log.findIndex((a: { type: string }) => a.type === 'voyage/choose');
    changed.log[choose] = { type: 'voyage/choose', choice: 'nowhere' };
    const { check: _, ...body } = changed;
    const tampered = { ...body, check: stateHash(body) };
    expect(loadSave(game, tampered, sim, options)).toMatchObject({ ok: false, problem: 'replay-differs' });
    const later = loadSave(game, tampered, sim, { ...options, build: 'next' });
    expect(later).toMatchObject({ ok: true, report: { differs: true } });
    expect(later.ok && later.report.skipped).toBeGreaterThan(0);
  });

  it('refuses a save whose hash is not where its log leads, on the same build', () => {
    const { check: _, ...body } = { ...file(), hash: '0000000000000000' };
    expect(loadSave(game, { ...body, check: stateHash(body) }, sim, options)).toEqual({
      ok: false,
      problem: 'replay-differs',
      message: 'The log replays to another state than the one saved',
    });
  });

  it('continues a run saved and loaded halfway to the same end as the run that never stopped', () => {
    for (const seed of Array.from({ length: 50 }, (_, i) => `half-${i}`)) {
      const whole = playOn(game.init(seed, sim), seed);
      const half = Math.floor(whole.log.length / 2);
      const first = createSession(game, sim, game.init(seed, sim));
      for (const action of whole.log.slice(0, half)) first.dispatch(action);
      const text = JSON.stringify(createSaveFile({ snapshot: first.start, log: first.log, state: first.state }, info));
      const loaded = loadSave(game, JSON.parse(text), sim, options);
      if (!loaded.ok) throw new Error(loaded.message);
      const rest = createSession(game, sim, loaded.state);
      for (const action of whole.log.slice(half)) expect(rest.dispatch(action).accepted).toBe(true);
      expect(stateHash(rest.state)).toBe(stateHash(whole.state));
    }
  });
});

describe('module versions', () => {
  const mod = (def: Record<string, unknown>) => defineModule({ id: 'a', init: () => ({}), ...def } as never);
  it.each([
    ['a version of 0', { version: 0 }, 'version must be a whole number, at least 1'],
    ['a gap in the migrations', { version: 3, migrate: { 3: (s: unknown) => s } }, 'has no migration to 2'],
    [
      'a migration past the version',
      { version: 2, migrate: { 2: (s: unknown) => s, 3: (s: unknown) => s } },
      'a migration to 3',
    ],
  ])('throws for %s', (_name, def, message) => {
    expect(() =>
      createGame({ modules: [mod({ ...def, actions: { go() {} }, modes: { m: { actions: ['*'] } } })], start: 'm' }),
    ).toThrow(message);
  });
});
