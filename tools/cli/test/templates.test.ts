/**
 * The templates (M4.11, D61): each a small game New project starts from. eb validates each clean
 * and plays it to its golden runs; over those seeds, its own bot reaches every stage of every
 * quest and every ending, with no offer refused, so a template that changes stays one that plays.
 * The 3D two (M6.9, D81) play through the headless stage, as eb sim plays them.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame, projectGame } from '@eb/compiler';
import { createGame, createRecordStore, type ModeFrame, playRun, withPackWorld } from '@eb/core';
import { kitsInWorld, QUEST, type QuestRecord, walkedStage } from '@eb/kits';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const TEMPLATES = resolve(import.meta.dirname, '../../../templates');

interface Listed {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
}

const LISTED = JSON.parse(readFileSync(join(TEMPLATES, 'templates.json'), 'utf8')) as Listed[];

interface Played {
  readonly policy: string;
  /** The modes its endings are. */
  readonly endings: readonly string[];
  readonly seeds: number;
}

/**
 * Each template's bot, its endings and its seeds: 500, but 200 for the hamlet, whose 500 took 31 s
 * through the stage on the dev container (2026-10-26), and the test plays them twice.
 */
const PLAYED: Readonly<Record<string, Played>> = {
  'salvage-coast': { policy: 'skipper', endings: ['free', 'lost', 'seized'], seeds: 500 },
  'last-ferry': { policy: 'ferryman', endings: ['ashore'], seeds: 500 },
  'valley-hamlet': { policy: 'wanderer', endings: ['ended'], seeds: 200 },
  lighthouse: { policy: 'keeper', endings: ['lit'], seeds: 500 },
};

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

async function load(folder: string) {
  const source = folderSource(folder);
  const scripted = await projectGame(source);
  const compiled = await compileWithGame(source, scripted);
  if (scripted.kind !== 'loaded' || !compiled.pack) throw new Error(`${folder} does not load`);
  const { world, project } = compiled.pack;
  const modules = withPackWorld(kitsInWorld(scripted.game.modules, world), world);
  const game = createGame({ modules, start: scripted.game.start });
  const stage = walkedStage(project, world);
  const sim = { content: createRecordStore(compiled.pack.records) };
  return { game, policies: scripted.game.policies ?? [], sim, ...(stage ? { stage } : {}) };
}

it('lists every template there is, each with a title and a blurb', () => {
  expect(LISTED.map((t) => t.id)).toEqual(Object.keys(PLAYED));
  for (const t of LISTED) expect(t.title.length * t.blurb.length).toBeGreaterThan(0);
});

describe.each(LISTED.map((t) => t.id))('the %s template', (id) => {
  const folder = join(TEMPLATES, id);
  const { policy, endings, seeds } = PLAYED[id] as Played;
  const golden = resolve(import.meta.dirname, `fixtures/${id}-${policy}.golden.json`);

  it('validates clean: no errors and no warnings', () => {
    const checked = eb(['validate', folder]);
    expect(checked.code, checked.out + checked.err).toBe(0);
    expect(checked.out).toMatch(/^\d+ records: no problems, hash [0-9a-f]{16}\.$/m);
  });

  it(`plays ${seeds} seeds with its own bot to its golden runs, with no offer refused`, () => {
    // The golden file holds its seeds and its policy: written with `--policy <bot> --seeds <n> --update`.
    const run = eb(['sim', folder, '--golden', golden]);
    expect(run.code, run.out + run.err).toBe(0);
    expect(run.out).toContain(`Ends: ${seeds} ended`);
    expect(run.out).toContain('Refused offers: none.');
    expect(run.out.trim().split('\n').at(-1)).toBe(`All ${seeds} runs match ${golden}.`);
  }, 60_000);

  it('reaches every stage of every quest, and every ending, over those seeds', async () => {
    const { game, policies, sim, stage } = await load(folder);
    const bot = policies.find((p) => p.name === policy);
    if (!bot) throw new Error(`${id} has no policy "${policy}"`);
    const quests = sim.content.entries(QUEST) as [string, QuestRecord][];
    const stages = quests.flatMap(([quest, record]) => record.stages.map((stage) => `${quest}/${stage.id}`));
    const reached = new Set<string>();
    const ended = new Set<string>();
    for (let seed = 1; seed <= seeds; seed++) {
      const { state, end, refused } = playRun(game, sim, {
        seed: String(seed),
        policy: bot,
        ...(stage ? { stage } : {}),
      });
      expect({ seed, end, refused }).toEqual({ seed, end: 'ended', refused: [] });
      ended.add((state.kernel.modes.at(-1) as ModeFrame).id);
      for (const at of stages) {
        const [quest, stage] = at.split('/');
        if (game.fact(state, 'quests.reached', { quest, stage }, sim) === true) reached.add(at);
      }
    }
    expect([...ended].sort()).toEqual([...endings].sort());
    expect(stages.filter((at) => !reached.has(at))).toEqual([]);
  }, 60_000);
});

describe('eb new', () => {
  const made = () => mkdtempSync(join(tmpdir(), 'eb-new-'));

  it('writes a template into a new folder under the name given, which validates clean', () => {
    const folder = join(made(), 'grey-sound');
    const run = eb(['new', folder, '--template', 'salvage-coast', '--name', 'The Grey Sound']);
    expect(run.code, run.out + run.err).toBe(0);
    expect(JSON.parse(readFileSync(join(folder, 'project.json'), 'utf8'))).toMatchObject({
      id: 'the-grey-sound',
      name: 'The Grey Sound',
    });
    // Over 12 characters, so a short name of the words that fit, never the template's.
    expect(JSON.parse(readFileSync(join(folder, 'export.json'), 'utf8'))).toMatchObject({ 'short-name': 'The Grey' });
    expect(readFileSync(join(folder, 'scripts/harbour.ts'), 'utf8')).toBe(
      readFileSync(join(TEMPLATES, 'salvage-coast/scripts/harbour.ts'), 'utf8'),
    );
    expect(eb(['validate', folder]).out).toMatch(/: no problems, hash /);
  });

  it('writes a 3D template’s models and navmeshes byte for byte (M6.9)', () => {
    const folder = join(made(), 'beacon');
    expect(eb(['new', folder, '--template', 'valley-hamlet', '--name', 'Beacon Fell']).code).toBe(0);
    for (const file of ['assets/starter-kit/oak.glb', 'spaces/green.nav', 'spaces/cave.nav']) {
      expect(readFileSync(join(folder, file)).equals(readFileSync(join(TEMPLATES, 'valley-hamlet', file))), file).toBe(
        true,
      );
    }
    expect(eb(['validate', folder]).out).toMatch(/: no problems, hash /);
  });

  it('names the project after its folder unless told otherwise', () => {
    const folder = join(made(), 'nightboat');
    expect(eb(['new', folder, '--template', 'last-ferry']).code).toBe(0);
    expect(JSON.parse(readFileSync(join(folder, 'export.json'), 'utf8'))).toMatchObject({
      name: 'nightboat',
      'short-name': 'nightboat',
    });
  });

  it('lists the templates when none or an unknown one is named, and refuses a folder that isn’t empty', () => {
    const none = eb(['new', join(made(), 'x')]);
    expect(none.code).toBe(2);
    for (const t of LISTED) expect(none.err).toContain(`${t.id}: ${t.title}.`);
    expect(eb(['new', join(made(), 'x'), '--template', 'tower-defence']).err).toContain('No template "tower-defence".');
    const full = made();
    writeFileSync(join(full, 'notes.txt'), 'mine');
    const refused = eb(['new', full, '--template', 'last-ferry']);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("isn't empty");
    expect(readFileSync(join(full, 'notes.txt'), 'utf8')).toBe('mine');
  });
});
