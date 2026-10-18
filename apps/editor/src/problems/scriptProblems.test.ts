import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { compileWithGame, memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { readCatalog } from '../forms/catalog.ts';
import { EMPTY_INDEX, updateIndex } from '../records/recordIndex.ts';
import { gameChecks, scriptFiles, stateOf } from '../scripts/gameState.ts';
import { checkJob } from '../scripts/jobs.ts';
import { projectProblems, tally } from './collect.ts';
import { fileTitle, placeOf, whereOf } from './problemList.ts';

const HOLD = resolve(import.meta.dirname, '../../../../tools/cli/test/fixtures/hold');

/** The hold fixture: a game written as scripts, with a flag and a sheet (M3.2). */
function hold(): Record<string, string | Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of readdirSync(HOLD, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files[relative(HOLD, path).split('\\').join('/')] = new Uint8Array(readFileSync(path));
  }
  return files;
}

/** What the Problems panel lists, with the game run as a trusted project's is, and what eb validate gives. */
async function both(files: Record<string, string | Uint8Array>) {
  const source = memorySource(files);
  const catalog = await readCatalog(source);
  const game = stateOf(await checkJob(await scriptFiles(source), true), true);
  const index = await updateIndex(EMPTY_INDEX, source, catalog, null, gameChecks(game));
  const validate = (await compileWithGame(source)).diagnostics;
  return { catalog, index, game, editor: projectProblems(catalog, index, game), validate };
}

const sheet = (row: object) => JSON.stringify({ rows: [{ id: 'r', when: { event: 'hold/looted' }, do: [], ...row }] });

/** The hold with its scripts broken every way the compiler can tell, and content the game doesn't know. */
const broken = () => ({
  ...hold(),
  'scripts/spare.ts': 'export const roll = () =>\n  Math.random();',
  'scripts/notes.md': 'notes',
  'scripts/Raid.ts': '',
  'scripts/odd.ts': 'export const = 1;',
  'records/sheet/odd.json': sheet({ when: { event: 'hold/sunk' }, do: [{ effect: 'bail' }] }),
});

describe('a project’s problems with its scripts', () => {
  it('are eb validate’s: the scripts’, and the content checked against the game they make', async () => {
    const { editor, validate, game } = await both(broken());
    expect(game.status).toBe('loaded');
    expect(editor).toEqual(validate);
    expect([...new Set(validate.map((d) => d.code))].sort()).toEqual([
      'E022',
      'E025',
      'E028',
      'E029',
      'E030',
      'W111',
      'W112',
    ]);
  });

  it('are eb validate’s when game.ts fails as it loads (E031), the content then checked as written', async () => {
    const fails = { ...broken(), 'scripts/game.ts': "import { hold } from './hold';\nexport const start = 'sea';" };
    const { editor, validate, game, catalog, index } = await both(fails);
    expect(game.status).toBe('failed');
    expect(editor).toEqual(validate);
    expect(editor.filter((d) => d.code === 'E032')).toHaveLength(1);
    // Without a game, a sheet's event and effect are taken as written (D36).
    expect(editor.some((d) => d.code === 'E022' || d.code === 'E025')).toBe(false);
    expect(tally(catalog, index, game).errors).toBe(editor.filter((d) => d.severity === 'error').length);
  });

  it('open a script at its line, titled by its name; an ignored or misplaced file opens nothing', async () => {
    const { catalog, index, editor } = await both(broken());
    const find = (code: string, file: string) => editor.find((d) => d.code === code && d.file === file);
    const e029 = find('E029', 'scripts/spare.ts');
    expect(e029 && placeOf(e029, catalog)).toEqual({ kind: 'script', id: 'spare', line: 2 });
    expect(e029 && whereOf(e029, catalog)).toBe('line 2');
    const e028 = find('E028', 'scripts/odd.ts');
    expect(e028 && whereOf(e028, catalog)).toMatch(/^line 1, column \d+$/);
    expect(fileTitle('scripts/spare.ts', catalog, index)).toBe('Script spare.ts');
    const w111 = find('W111', 'scripts/notes.md');
    expect(w111 && placeOf(w111, catalog)).toBeNull();
    const e030 = find('E030', 'scripts/Raid.ts');
    expect(e030 && placeOf(e030, catalog)).toBeNull();
  });
});
