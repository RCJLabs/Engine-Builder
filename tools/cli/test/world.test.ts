/**
 * eb with the trail (M5.8, D70, docs/specs/movement.md#the-gate): a game of two spaces, a cairn whose
 * trigger zone sets the flag its screen shows, and a bothy walked in first person. eb validates it
 * clean and builds it as format 9, with what its spaces draw from; a copy broken once for each of
 * M5.8's checks gives each.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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

  it('builds it as format 9: its spaces, the cairn’s zone through its prefab, and what they draw from', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'eb-trail-pack-')), 'trail.json');
    const run = eb(['build', TRAIL, '--out', out]);
    expect(run.code, run.out + run.err).toBe(0);
    const pack = JSON.parse(readFileSync(out, 'utf8'));
    expect(pack.format).toBe(9);
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
});
