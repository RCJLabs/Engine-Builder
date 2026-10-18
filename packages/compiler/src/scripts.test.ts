import { readPack } from '@eb/core';
import type { Diagnostic } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { GAME, HOLD } from '../../script/test/scripts.ts';
import { FIXTURE_LUDUS, readFixture } from '../test/fixture.ts';
import { compileProject, memorySource, readScripts } from './index.ts';

const brief = (diagnostics: readonly Diagnostic[]) =>
  diagnostics.map((d) => `${d.code} ${d.file}${d.line !== undefined ? `:${d.line}` : ''} ${d.message}`);

describe('reading scripts', () => {
  it('checks every file under scripts/ without running one', async () => {
    const read = await readScripts(
      memorySource({
        'scripts/game.ts': GAME,
        'scripts/hold.ts': HOLD,
        'scripts/spare.ts': "import { defineModule } from 'eb';\nexport const n = Math.random();",
        'scripts/old/game.ts': '',
        'scripts/Raid.ts': '',
        'scripts/eb.d.ts': 'declare module "eb";',
        'scripts/notes.md': '',
        'scripts/latin1.ts': new Uint8Array([0xe9]),
      }),
    );
    expect(read.ids).toEqual(['game', 'hold', 'spare']);
    expect(read.hasGame).toBe(true);
    expect(brief([...read.diagnostics].sort((a, b) => ((a.file ?? '') < (b.file ?? '') ? -1 : 1)))).toEqual([
      'E030 scripts/Raid.ts "Raid" is not a valid script name: use lowercase words joined by hyphens, at most 64 characters',
      'W111 scripts/eb.d.ts Ignored: scripts are scripts/<name>.ts',
      'E028 scripts/latin1.ts Not valid UTF-8 text',
      'W111 scripts/notes.md Ignored: scripts are scripts/<name>.ts',
      'E030 scripts/old/game.ts A script must sit at scripts/<name>.ts',
      'E029 scripts/spare.ts:2 no Math.random (use a seeded rng stream)',
      "W112 scripts/spare.ts scripts/game.ts doesn't import it, directly or through another, so the game never runs it",
    ]);
    // What the pack carries: game.ts and what it reaches, sound, and nothing else.
    expect([...read.compiled.keys()]).toEqual(['game', 'hold']);
    expect(read.compiled.get('game')).toContain("require('./hold')");
  });

  it('compiles nothing while a script game.ts reaches has an error', async () => {
    const hold = HOLD.replace('const next = ctx.read().count + 1;', 'const next = Date.now();');
    const read = await readScripts(memorySource({ 'scripts/game.ts': GAME, 'scripts/hold.ts': hold }));
    expect(brief(read.diagnostics)).toEqual(['E029 scripts/hold.ts:12 no Date (time arrives as actions)']);
    expect(read.compiled.size).toBe(0);
  });

  it('says a script runs nowhere when there is no game.ts', async () => {
    const read = await readScripts(memorySource({ 'scripts/hold.ts': HOLD }));
    expect(read.hasGame).toBe(false);
    expect(brief(read.diagnostics)).toEqual(['W112 scripts/hold.ts There is no scripts/game.ts, so nothing runs it']);
    expect(read.compiled.size).toBe(0);
  });
});

describe('compiling a project with scripts', () => {
  const ludus = () => readFixture(FIXTURE_LUDUS);

  it("packs the scripts game.ts reaches as format 2, their problems beside the records'", async () => {
    const plain = await compileProject(memorySource(ludus()), []);
    const scripted = await compileProject(
      memorySource({ ...ludus(), 'scripts/game.ts': GAME, 'scripts/hold.ts': HOLD }),
      [],
    );
    expect(scripted.diagnostics).toEqual([]);
    const pack = readPack(JSON.parse(JSON.stringify(scripted.pack)));
    expect(pack.format).toBe(2);
    expect(Object.keys(pack.scripts ?? {})).toEqual(['game', 'hold']);
    expect(pack.records).toEqual(plain.pack?.records);
    // Without scripts the pack is format 1, its hash unchanged since M2.7.
    expect(plain.pack?.format).toBe(1);
    expect(scripted.pack?.hash).not.toBe(plain.pack?.hash);

    const broken = await compileProject(memorySource({ ...ludus(), 'scripts/game.ts': 'const a = ;' }), []);
    expect(broken.pack).toBeNull();
    expect(brief(broken.diagnostics)).toEqual(['E028 scripts/game.ts:1 Unexpected token']);
  });
});
