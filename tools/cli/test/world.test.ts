/**
 * eb with the trail (M5.8, D70, docs/specs/movement.md#the-gate): a game of two spaces, a cairn whose
 * trigger zone sets the flag its screen shows, and a bothy walked in first person. eb validates it
 * clean and builds it as format 10 (M5.9), with what its spaces draw from, their spawn points and its
 * start; a copy broken once for each of M5.8's checks gives each.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame } from '@eb/compiler';
import { openPack, resumeFrom } from '@eb/ui/session';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const CLI = resolve(import.meta.dirname, '../src/cli.ts');
const TRAIL = resolve(import.meta.dirname, 'fixtures/trail');

function eb(args: readonly string[]) {
  const run = spawnSync(process.execPath, [CLI, ...args], { cwd: tmpdir(), encoding: 'utf8' });
  return { code: run.status, out: run.stdout, err: run.stderr };
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function copy(): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'eb-trail-')), 'trail');
  cpSync(TRAIL, dir, { recursive: true });
  return dir;
}

describe('eb with the trail', () => {
  it('validates the trail clean', () => {
    const run = eb(['validate', TRAIL]);
    expect(run.code, run.out + run.err).toBe(0);
    expect(run.out.trim()).toMatch(/^4 records: no problems, hash [0-9a-f]{16}\.$/);
  });

  it('builds it as format 10: its spaces, the cairn’s zone through its prefab, what they draw from, its spawn points', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'eb-trail-pack-')), 'trail.json');
    const run = eb(['build', TRAIL, '--out', out]);
    expect(run.code, run.out + run.err).toBe(0);
    const pack = JSON.parse(readFileSync(out, 'utf8'));
    expect(pack.format).toBe(10);
    expect(Object.keys(pack.world.spaces).sort()).toEqual(['bothy', 'trailhead']);
    expect(Object.keys(pack.world.prefabs)).toEqual(['cairn']);
    expect(pack.world.triggers).toEqual({
      trailhead: {
        'cairn/zone': { effects: [{ effect: 'set-flag', flag: 'cairn-seen', to: true }], once: true },
      },
    });
    expect(Object.keys(pack.world.files).sort()).toEqual([
      'assets/starter-kit/crate.glb',
      'spaces/trailhead.heights.png',
      'spaces/trailhead.paint.png',
    ]);
    expect(Buffer.from(pack.world.files['assets/starter-kit/crate.glb'], 'base64')).toEqual(
      readFileSync(join(TRAIL, 'assets/starter-kit/crate.glb')),
    );
    expect(Object.keys(pack.world.records).sort()).toEqual([
      'material:kit-metal',
      'material:kit-wood',
      'model:kit-crate',
    ]);
    expect(pack.world.fields).toEqual({});
    expect(pack.world.uses).toEqual({});
    expect(pack.world.spawns).toEqual({ bothy: ['door'], trailhead: ['start'] });
    expect(pack.world.start).toBe('trailhead');
  });

  it('gives a Space widget naming a space there isn’t as E049, and a module named world as E031', () => {
    const dir = copy();
    const screen = JSON.parse(readFileSync(join(dir, 'ui/bothy.json'), 'utf8'));
    writeFileSync(join(dir, 'ui/bothy.json'), json({ ...screen, main: { widget: 'space', space: 'barn' } }));
    const broken = eb(['validate', dir]);
    expect(broken.code).toBe(1);
    expect(broken.out).toMatch(/ui\/bothy\.json:\d+#\/main\/space: error E049: No space "barn" in spaces\//);
    const own = copy();
    const trail = readFileSync(join(own, 'scripts/trail.ts'), 'utf8');
    writeFileSync(
      join(own, 'scripts/trail.ts'),
      trail.replace("id: 'trail'", "id: 'world'").replaceAll("'trail/", "'world/"),
    );
    const clash = eb(['validate', own]);
    expect(clash.code).toBe(1);
    expect(clash.out).toMatch(/error E031: Its module "world" has the id of the engine's world module/);
  });

  it('exports it with walk.js beside the page, and refuses a runtime without one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'eb-trail-runtime-'));
    writeFileSync(join(dir, 'game.js'), 'console.log("the engine");\n');
    writeFileSync(join(dir, 'game.css'), 'body { margin: 0 }\n');
    writeFileSync(join(dir, 'files.json'), JSON.stringify({ version: '0.0.1', files: ['game.js', 'game.css'] }));
    const without = eb(['export', TRAIL, '--target', 'web', '--out', join(dir, 'none'), '--runtime', dir]);
    expect(without.code).not.toBe(0);
    expect(without.err).toContain('has no walk.js');
    writeFileSync(join(dir, 'walk.js'), 'window.__ebWalkStage = {};\n');
    writeFileSync(
      join(dir, 'files.json'),
      JSON.stringify({ version: '0.0.1', files: ['game.js', 'game.css'], walk: 'walk.js' }),
    );
    const out = join(dir, 'web');
    const run = eb(['export', TRAIL, '--target', 'web', '--out', out, '--runtime', dir]);
    expect(run.code, run.out + run.err).toBe(0);
    const page = readFileSync(join(out, 'index.html'), 'utf8');
    const walk = /"walk":"(walk\.[0-9a-f]{8}\.js)"/.exec(page)?.[1];
    expect(walk).toBeDefined();
    expect(readFileSync(join(out, walk as string), 'utf8')).toBe('window.__ebWalkStage = {};\n');
  });

  // Saves never break (M5.9): the world module's version 1 kept only the zones fired. Made by M5.8's
  // build of the trail, after the cairn's zone; that build's hash is not this one's, so it replays.
  it('loads a save made by the world module’s version 1, migrated, and plays on from it', async () => {
    const compiled = await compileWithGame(folderSource(TRAIL));
    const opened = openPack(JSON.parse(JSON.stringify(compiled.pack)));
    if (!opened.ok) throw new Error(opened.message);
    const raw = readFileSync(resolve(import.meta.dirname, 'fixtures/saves/trail-world-v1.json'), 'utf8');
    const resumed = resumeFrom(opened.opened, raw);
    if (!resumed.ok) throw new Error(resumed.message);
    expect(resumed.report.migrated).toEqual([{ module: 'world', from: 1, to: 2 }]);
    expect(resumed.report).toMatchObject({ replayed: 1, skipped: 0 });
    const { play } = resumed;
    // Where it was: the cairn's zone fired and its flag set, nothing taken, in the start.
    expect(play.state.world).toEqual({ fired: ['trailhead/cairn/zone'], taken: [], space: 'trailhead' });
    expect(play.state.flag).toEqual({ values: { 'cairn-seen': true } });
    expect(play.take({ type: 'world/trigger', space: 'trailhead', object: 'cairn/zone' }).beats).toEqual([
      { type: 'rejected', action: 'world/trigger', reason: 'spent' },
    ]);
    // And on, at version 2: where the player stands is kept.
    expect(play.take({ type: 'world/at', space: 'trailhead', feet: [1, 0, -9], yaw: 180 }).accepted).toBe(true);
    expect(play.state.world).toMatchObject({ at: { space: 'trailhead', feet: [1, 0, -9], yaw: 180 } });
  });
});
