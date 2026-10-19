/**
 * A project's ink scenes in the editor (M3.11): the Problems panel lists what `eb validate` gives,
 * each scene's problems at its lines, compiled with the game's facts; a scene's problem opens the
 * scene at its line; and the record index compiles a scene again as it changes.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { compileWithGame, memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { readCatalog } from '../forms/catalog.ts';
import { EMPTY_INDEX, updateIndex } from '../records/recordIndex.ts';
import { gameChecks, scriptFiles, stateOf } from '../scripts/gameState.ts';
import { checkJob } from '../scripts/jobs.ts';
import { projectProblems } from './collect.ts';
import { fileTitle, placeOf, whereOf } from './problemList.ts';

const GATEHOUSE = resolve(import.meta.dirname, '../../../../tools/cli/test/fixtures/gatehouse');

/** The gatehouse fixture: three dusk scenes in ink and a game written as scripts (M3.11). */
function gatehouse(): Record<string, string | Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of readdirSync(GATEHOUSE, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files[relative(GATEHOUSE, path).split('\\').join('/')] = new Uint8Array(readFileSync(path));
  }
  return files;
}

const text = (files: Record<string, string | Uint8Array>, path: string) =>
  new TextDecoder().decode(files[path] as Uint8Array);

async function both(files: Record<string, string | Uint8Array>) {
  const source = memorySource(files);
  const catalog = await readCatalog(source);
  const game = stateOf(await checkJob(await scriptFiles(source), true), true);
  const index = await updateIndex(EMPTY_INDEX, source, catalog, null, gameChecks(game));
  const validate = (await compileWithGame(source)).diagnostics;
  return { source, catalog, index, game, editor: projectProblems(catalog, index, game), validate };
}

/** The gatehouse with its scenes broken every way a scene can be. */
function broken() {
  const files = gatehouse();
  const letter = text(files, 'scenes/letter.ink').split('\n');
  letter[5] = '"Your brother has the cough again." # speaker: father';
  return {
    ...files,
    'scenes/letter.ink': letter.join('\n'),
    'scenes/keeper.ink': 'EXTERNAL flags_on(flag)\nVAR met = false\nHello.\n-> END\n',
    'scenes/old/a.ink': 'Hi.',
    'scenes/notes.md': '',
    'scenes/twice.ink': 'Hi.',
    'scenes/latin.ink': new Uint8Array([0x48, 0xe9, 0x2e]),
    'records/talk/twice.json': JSON.stringify({ starts: [{ line: 'a' }], lines: [{ id: 'a', text: 'A' }] }),
  };
}

describe('a project’s problems with its scenes', () => {
  it('are none for the gatehouse, as eb validate says', async () => {
    const { editor, validate, catalog, index } = await both(gatehouse());
    expect(validate).toEqual([]);
    expect(editor).toEqual([]);
    expect([...catalog.scenes].sort()).toEqual(['first-dusk', 'keeper', 'letter']);
    expect(catalog.records.get('talk')).toEqual(['first-dusk', 'keeper', 'letter']);
    expect(index.records.get('talk:keeper')?.value).toMatchObject({ name: 'The keeper of the bridge' });
  });

  it('are eb validate’s, each scene’s at its lines, when its scenes are broken', async () => {
    const { editor, validate } = await both(broken());
    expect(editor).toEqual(validate);
    const brief = editor.map((d) => `${d.code} ${d.file}${d.line === undefined ? '' : `:${d.line}`}`);
    expect(brief.sort()).toEqual(
      [
        'E004 records/talk/twice.json',
        'E004 scenes/twice.ink',
        'E005 scenes/letter.ink:6',
        'E012 scenes/keeper.ink:1',
        'E046 scenes/keeper.ink:2',
        'E046 scenes/latin.ink',
        'E046 scenes/old/a.ink',
        'W123 records/talk/twice.json',
        'W131 scenes/notes.md',
        // Only the keeper's scene read these, and it no longer compiles.
        'W108 records/flag/promised.json',
        'W108 records/flag/sent-healer.json',
        'W108 records/flag/truth.json',
      ].sort(),
    );
  });

  it('are eb validate’s with the dialogue kit off: each scene one problem', async () => {
    const files = gatehouse();
    const off = JSON.parse(text(files, 'project.json'));
    off.kits = off.kits.filter((kit: string) => kit !== 'dialogue');
    const { editor, validate } = await both({ ...files, 'project.json': JSON.stringify(off) });
    const scenes = editor.filter((d) => d.file?.startsWith('scenes/'));
    expect(scenes.map((d) => d.message)).toEqual(
      Array(3).fill('A scene compiles into a talk: turn the dialogue kit on in project.json'),
    );
    expect(scenes).toEqual(validate.filter((d) => d.file?.startsWith('scenes/')));
  });

  it('open a scene at its line, titled by its name; a misplaced or ignored file opens nothing', async () => {
    const { catalog, index, editor } = await both(broken());
    const e005 = editor.find((d) => d.code === 'E005');
    expect(e005 && placeOf(e005, catalog)).toEqual({ kind: 'scene', id: 'letter', line: 6 });
    expect(e005 && whereOf(e005, catalog)).toBe('line 6');
    expect(fileTitle('scenes/letter.ink', catalog, index)).toBe('Scene letter.ink');
    const misplaced = editor.find((d) => d.file === 'scenes/old/a.ink');
    expect(misplaced && placeOf(misplaced, catalog)).toBeNull();
    const ignored = editor.find((d) => d.code === 'W131');
    expect(ignored && placeOf(ignored, catalog)).toBeNull();
  });
});

describe('the record index and scenes', () => {
  it('compiles a scene again as it is edited, and keeps one that didn’t change', async () => {
    const files = gatehouse();
    const { index, game } = await both(files);
    const before = index.records.get('talk:keeper')?.value;
    const edited = memorySource({ ...files, 'scenes/letter.ink': 'Just a note.\n-> END\n' });
    const after = await updateIndex(index, edited, await readCatalog(edited), ['scenes/letter.ink'], gameChecks(game));
    // Checked again with the other talks, but not compiled again.
    expect(after.records.get('talk:keeper')?.value).toBe(before);
    expect(after.records.get('talk:letter')?.value).toMatchObject({ lines: [{ id: 'start', text: 'Just a note.' }] });
    // A scene's own problem in place of its checks, at its line; fixing it brings the talk back.
    const wrong = memorySource({ ...files, 'scenes/letter.ink': 'Hi.\n~ x = 1\n' });
    const failed = await updateIndex(after, wrong, await readCatalog(wrong), ['scenes/letter.ink'], gameChecks(game));
    expect(failed.records.get('talk:letter')?.problems.map((p) => [p.code, p.line])).toEqual([['E046', 2]]);
    expect(failed.records.get('talk:letter')?.value).toBeUndefined();
  });

  it('compiles its scenes again when the game’s facts change, since their EXTERNALs name them', async () => {
    const files = gatehouse();
    const { catalog, index } = await both(files);
    // With no game known, gate.day is no fact, so an EXTERNAL naming it is E012.
    const asking = { ...files, 'scenes/letter.ink': 'EXTERNAL gate_day()\n{ gate_day() > 1: Late. }\n-> END\n' };
    const source = memorySource(asking);
    const game = stateOf(await checkJob(await scriptFiles(source), true), true);
    const withGame = await updateIndex(
      index,
      source,
      await readCatalog(source),
      ['scenes/letter.ink'],
      gameChecks(game),
    );
    expect(withGame.records.get('talk:letter')?.problems).toEqual([]);
    const without = await updateIndex(withGame, source, catalog, [], {});
    expect(without.records.get('talk:letter')?.problems.map((p) => p.code)).toEqual(['E012']);
  });
});
