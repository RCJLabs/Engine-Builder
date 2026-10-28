/**
 * The boarding fight (M7.5's gate, D87, docs/specs/tactics.md#the-gate): Space-Wrecked's example ship from the
 * starter tileset, three crew on the bridge and boarders at the airlock, by Space-Wrecked's numbers. It
 * validates clean and builds as format 18 with each unit's actor and sprite; broken once for each new check it
 * is E096 (a battle on a space with no tilemap, a unit on no object, on a crate, on another's tile), E035 (an
 * order without its number) and W160 (a boarder with no gun). Headless, the alarm's use starts the battle and
 * the crew, played by the kit's own AI, fight it to an end on every seed: won or lost, each of the crew's
 * health written back and the fallen hurt. The random bot's runs end with no offer refused. Through the
 * session, the stage's view of the battle: its odds the facts', the foes' turn's beats with the crew's end.
 */
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame, projectGame } from '@eb/compiler';
import {
  type Action,
  createGame,
  createRecordStore,
  type GameState,
  playRun,
  Rng,
  randomPolicy,
  turnFor,
  withPackWorld,
} from '@eb/core';
import { aiAction, arenaOf, kitsInWorld, type TacticsSlice, walkedStage } from '@eb/kits';
import { openPack, startPlay } from '@eb/ui/session';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const FIGHT = resolve(import.meta.dirname, 'fixtures/fight');
/** 50 seeds took 2 s on the dev container (2026-10-28); the kit's own sweep plays 200 (sweep.test.ts). */
const SEEDS = 50;
const CREW = ['ines', 'oren', 'sal'];

// biome-ignore lint/suspicious/noExplicitAny: a fixture's JSON, edited in place
type Change = (value: any) => void;

/** The fight's problems once each file is changed, warnings too, as code, id and path. */
async function broken(changes: Readonly<Record<string, Change>>): Promise<string[]> {
  const folder = await mkdtemp(join(tmpdir(), 'fight-'));
  try {
    await cp(FIGHT, folder, { recursive: true });
    for (const [file, change] of Object.entries(changes)) {
      const value = JSON.parse(await readFile(join(folder, file), 'utf8'));
      change(value);
      await writeFile(join(folder, file), JSON.stringify(value));
    }
    const { diagnostics } = await compileWithGame(folderSource(folder));
    return diagnostics.map((d) => `${d.code} ${d.id ?? d.file ?? ''} ${d.path}`);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

async function load() {
  const source = folderSource(FIGHT);
  const scripted = await projectGame(source);
  const compiled = await compileWithGame(source, scripted);
  if (scripted.kind !== 'loaded' || !compiled.pack?.world) throw new Error('The fight does not load');
  const { world, project } = compiled.pack;
  const modules = withPackWorld(kitsInWorld(scripted.game.modules, world), world);
  const game = createGame({ modules, start: scripted.game.start });
  const sim = { content: createRecordStore(compiled.pack.records) };
  return { game, sim, stage: walkedStage(project, world), tiles: world.tiles ?? {}, compiled };
}

const loaded = load();

/** One seed fought to its end: the alarm sounded, then every crew action the kit's AI's. */
async function fought(seed: string): Promise<GameState> {
  const { game, sim, stage, tiles } = await loaded;
  let state = game.init(seed, sim);
  for (let turn = 0; turn < 1000; turn++) {
    const { options } = turnFor(game, sim, state, Rng.create(seed), turn, stage);
    if (options.length === 0) return state;
    const battle = (state.tactics as TacticsSlice).battle;
    let action = options[0] as Action;
    if (battle) {
      const move = aiAction(arenaOf(sim.content, tiles, battle.battle), battle);
      action = { ...move, type: `tactics/${move.type}` };
    }
    const step = game.reduce(state, action, sim);
    if (!step.accepted) throw new Error(`Seed ${seed} refused ${JSON.stringify(action)}`);
    state = step.state;
  }
  throw new Error(`Seed ${seed} never ended`);
}

describe('the boarding fight', () => {
  it('validates clean and builds as format 18, with each unit’s actor and sprite', async () => {
    const { compiled } = await loaded;
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.pack?.format).toBe(18);
    expect(compiled.pack?.world?.tiles?.deck?.places).toMatchObject({
      'bridge-1': [9, 1],
      'bridge-2': [9, 2],
      'bridge-3': [10, 2],
      'hatch-1': [5, 3],
      'hatch-2': [6, 3],
      'hatch-3': [4, 3],
    });
    const records = Object.keys(compiled.pack?.world?.records ?? {});
    expect(records).toEqual(
      expect.arrayContaining(['actor:brute', 'actor:ines', 'actor:oren', 'actor:pirate', 'actor:sal']),
    );
    expect(records).toEqual(
      expect.arrayContaining(['sprite:figure-guard', 'sprite:figure-keeper', 'sprite:figure-villager']),
    );
    expect(Object.keys(compiled.pack?.world?.files ?? {})).toContain('assets/starter-sprites/figure-villager.png');
  });

  it('is E096 for a battle on a space with no tilemap, and a unit on no object, a crate or another’s tile', async () => {
    const tilemap = (space: { objects: { id: string }[] }) => {
      space.objects = space.objects.filter((o) => o.id !== 'deck');
    };
    expect(await broken({ 'spaces/deck.json': tilemap })).toEqual(['E096 boarders /space']);
    const posts: Change = (battle) => {
      battle.crew[1].at = 'galley';
      battle.foes[0].at = 'bridge-1';
      battle.foes[1].at = 'brig';
    };
    // The crate at (10, 1), its centre 16 + 160 + 8 across and 16 + 48 + 8 up.
    const crate: Change = (space) => {
      space.objects.find((o: { id: string }) => o.id === 'hatch-3').at = [184, 72, 1];
    };
    expect(await broken({ 'records/battle/boarders.json': posts, 'spaces/deck.json': crate })).toEqual([
      'E096 boarders /crew/1/at',
      'E096 boarders /foes/0/at',
      'E096 boarders /foes/1/at',
      'E096 boarders /foes/2/at',
    ]);
  });

  it('is E035 for an order without its number, and W160 for a boarder with no gun', async () => {
    const patch: Change = (order) => {
      delete order.hp;
    };
    const unarmed: Change = (actor) => {
      delete actor.gun;
    };
    expect(await broken({ 'records/order/patch.json': patch, 'records/actor/brute.json': unarmed })).toEqual([
      'W160 boarders /foes/2/actor',
      'E035 patch /hp',
    ]);
  });

  it(`fights ${SEEDS} seeds to an end, the crew’s health written back and the fallen hurt`, async () => {
    const { game, sim } = await loaded;
    const fact = (state: GameState, id: string, args: Record<string, unknown>) => game.fact(state, id, args, sim);
    let [won, fallen] = [0, 0];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const state = await fought(String(seed));
      const [crewWon, crewLost] = ['won', 'lost'].map((flag) => fact(state, 'flag.on', { flag }));
      expect(crewWon !== crewLost, `seed ${seed}`).toBe(true);
      expect(fact(state, 'tactics.fought', { battle: 'boarders' })).toBe(1);
      expect((state.tactics as TacticsSlice).battle).toBeNull();
      const health = CREW.map((actor) => fact(state, 'stats.current', { actor, stat: 'health' }) as number);
      // Out or dead is 0 and hurt; still down when it ends is 0 too, as it ended on, but not fallen.
      for (const [i, actor] of CREW.entries()) {
        const hurt = fact(state, 'stats.has', { actor, status: 'hurt' });
        expect(health[i], `seed ${seed}, ${actor}`).toBeLessThanOrEqual(actor === 'ines' ? 10 : 8);
        if (hurt === 1) expect(health[i], `seed ${seed}, ${actor}`).toBe(0);
        else expect(hurt, `seed ${seed}, ${actor}`).toBe(0);
        if (hurt === 1) fallen++;
      }
      expect(
        health.some((h) => h > 0),
        `seed ${seed}`,
      ).toBe(crewWon === true);
      if (crewWon === true) won++;
    }
    // A reading, not a bound: Readings in ROADMAP.md.
    console.log(`The crew, played by the AI, won ${won} of ${SEEDS}; ${fallen} of the crew fell`);
    expect(won).toBeGreaterThan(0);
    expect(fallen).toBeGreaterThan(0);
  });

  it('ends every random run once the battle is over, with no offer refused', async () => {
    const { game, sim, stage } = await loaded;
    for (let seed = 1; seed <= 20; seed++) {
      const run = playRun(game, sim, { seed: String(seed), policy: randomPolicy, ...(stage ? { stage } : {}) });
      expect(run.end, `seed ${seed}`).toBe('ended');
      expect(run.refused).toEqual([]);
      expect(run.beats['tactics/started']).toBe(1);
    }
  });
  it('shows the battle to the stage: its choices, odds that are the facts’, and each step’s beats once', async () => {
    const { compiled, sim, tiles } = await loaded;
    const open = openPack(JSON.parse(JSON.stringify(compiled.pack)));
    if (!open.ok) throw new Error(open.message);
    const play = startPlay(open.opened.setup, '7');
    expect(play.view.world?.battle).toBeUndefined();
    expect(play.act({ type: 'world/use', space: 'deck', object: 'alarm' }).accepted).toBe(true);
    const shown = play.view.world?.battle;
    expect(shown?.space).toBe('deck');
    expect(shown?.view?.side).toBe('crew');
    expect(shown?.view?.choices.map((c) => c.unit)).toEqual(['c1', 'c2', 'c3']);
    expect(shown?.told.map((b) => b.type)).toEqual(['tactics/started', 'tactics/turn']);
    const started = shown?.step ?? 0;
    // Every odds shown is the fact's, which is the roll's (shotOdds).
    for (const choice of shown?.view?.choices ?? [])
      for (const shot of choice.shots)
        expect(shot.hit).toBe(
          play.state &&
            open.opened.setup.game.fact(play.state, 'tactics.hit', { unit: choice.unit, target: shot.target }, sim),
        );
    // The crew's end hands the foes their turn, played inside it: its beats come back with it.
    expect(play.act({ type: 'tactics/end' }).accepted).toBe(true);
    const after = play.view.world?.battle;
    expect(after?.step).toBeGreaterThan(started);
    expect(after?.told.some((b) => typeof b.unit === 'string' && b.unit.startsWith('e'))).toBe(true);
    expect(after?.told.filter((b) => b.type === 'tactics/turn').map((b) => b.side)).toEqual(['foes', 'crew']);
    // Fought to the end by the AI: the view goes, the last step's beats stay for the stage.
    for (let i = 0; i < 500 && play.view.world?.battle?.view; i++) {
      const battle = (play.state.tactics as TacticsSlice).battle;
      if (!battle) break;
      const move = aiAction(arenaOf(sim.content, tiles, battle.battle), battle);
      play.act({ ...move, type: `tactics/${move.type}` });
    }
    const over = play.view.world?.battle;
    expect(over?.view).toBeUndefined();
    expect(over?.told.some((b) => b.type === 'tactics/won' || b.type === 'tactics/lost')).toBe(true);
  });
});
