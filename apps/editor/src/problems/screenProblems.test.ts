/**
 * A project's screens in the editor (M4.1): the Problems panel lists what `eb validate` gives,
 * each at its line in the screen's file and checked against the game once it has run; a screen's
 * problem opens the screen at its line; and the Play worker's jobs pack and play the hut.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { compileWithGame, memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { readCatalog } from '../forms/catalog.ts';
import { playJobs } from '../play/jobs.ts';
import { EMPTY_INDEX, updateIndex } from '../records/recordIndex.ts';
import { screenProblems } from '../screens/screenChecks.ts';
import { gameChecks, scriptFiles, stateOf } from '../scripts/gameState.ts';
import { checkJob } from '../scripts/jobs.ts';
import type { SentFile } from '../scripts/protocol.ts';
import { projectProblems } from './collect.ts';
import { fileTitle, placeOf } from './problemList.ts';

const HUT = resolve(import.meta.dirname, '../../../../tools/cli/test/fixtures/hut');

/** The hut, Phase 3's gate, with its screens and theme (M4.1). */
function hut(): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  for (const entry of readdirSync(HUT, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files[relative(HUT, path).split('\\').join('/')] = new Uint8Array(readFileSync(path));
  }
  return files;
}

const encode = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
const read = (files: Record<string, Uint8Array>, path: string) =>
  JSON.parse(new TextDecoder().decode(files[path])) as Record<string, unknown>;

async function both(files: Record<string, Uint8Array>) {
  const source = memorySource(files);
  const catalog = await readCatalog(source);
  const game = stateOf(await checkJob(await scriptFiles(source), true), true);
  const updated = await updateIndex(EMPTY_INDEX, source, catalog, null, gameChecks(game));
  const index = { ...updated, screens: await screenProblems(source, catalog, updated, game) };
  const validate = (await compileWithGame(source)).diagnostics;
  return { catalog, index, game, editor: projectProblems(catalog, index, game), validate };
}

/** The hut with its screens broken every way the checks name. */
function broken() {
  const files = hut();
  const store = read(files, 'ui/store.json');
  return {
    ...files,
    'ui/hut.json': encode({
      ...read(files, 'ui/hut.json'),
      shows: ['hut', 'sea'],
      top: { widget: 'text', text: 'Day {time.dya}' },
      bottom: { widget: 'button', label: 'Sail', action: { take: 'hut/sail' } },
    }),
    'ui/store.json': encode({ ...store, modal: 'yes' }),
    'ui/talk.json': new TextEncoder().encode('{ "main": '),
    'ui/notes.md': new Uint8Array(),
    'ui/feedback.json': encode({ lines: [{ on: 'hut/burned', say: 'Gone' }] }),
    'ui/theme.json': encode({
      ...read(files, 'ui/theme.json'),
      colors: { ...(read(files, 'ui/theme.json').colors as object), muted: '#3a4250' },
    }),
  };
}

describe('a project’s problems with its screens', () => {
  it('are none for the hut, as eb validate says', async () => {
    const { editor, validate, catalog } = await both(hut());
    expect(validate).toEqual([]);
    expect(editor).toEqual([]);
    expect(catalog.screens).toEqual(['closed', 'hut', 'journal', 'store', 'storm', 'talk']);
    expect(catalog.theme).toBe(true);
    expect(catalog.feedback).toBe(true);
  });

  it('are eb validate’s, each at its line in its file, when its screens are broken', async () => {
    const { editor, validate } = await both(broken());
    expect(editor).toEqual(validate);
    const brief = editor.map((d) => `${d.code} ${d.file ?? '(game)'}${d.line === undefined ? '' : `:${d.line}`}`);
    // By file, then by path: the button at the bottom, the mode, the misspelt fact.
    expect(brief).toEqual([
      'W133 (game)',
      'E051 ui/feedback.json:4',
      'E049 ui/hut.json:117',
      'E049 ui/hut.json:5',
      'E048 ui/hut.json:9',
      'W132 ui/notes.md',
      'E047 ui/store.json:6',
      'E007 ui/talk.json',
      'E050 ui/theme.json:6',
      'E050 ui/theme.json:6',
    ]);
  });

  it('are the feedback’s too, in a project with feedback and no screens, as eb validate says (M4.2)', async () => {
    const files = Object.fromEntries(Object.entries(hut()).filter(([path]) => !path.startsWith('ui/')));
    files['ui/feedback.json'] = encode({ lines: [{ on: 'hut/burned', say: 'Gone' }] });
    const { editor, validate, catalog } = await both(files);
    expect(catalog.screens).toEqual([]);
    expect(editor).toEqual(validate);
    expect(editor.map((d) => `${d.code} ${d.file}`)).toEqual(['E051 ui/feedback.json']);
  });

  it('open the screen, or the theme, at their lines', async () => {
    const { editor, catalog, index } = await both(broken());
    const fact = editor.find((d) => d.code === 'E048');
    expect(fact && placeOf(fact, catalog)).toEqual({ kind: 'ui', path: 'ui/hut.json', line: 9, column: 5 });
    expect(fileTitle('ui/hut.json', catalog, index)).toBe('Screen hut');
    expect(fileTitle('ui/theme.json', catalog, index)).toBe('Theme (ui/theme.json)');
    expect(fileTitle('', catalog, index)).toBe('The game');
    const notes = editor.find((d) => d.code === 'W132');
    expect(notes && placeOf(notes, catalog)).toBeNull();
  });
});

describe('the Play worker’s jobs', () => {
  const sent = (files: Record<string, Uint8Array>): SentFile[] => Object.entries(files);

  it('pack the hut as Export game writes it, open it from its files, and start, step and load a game of it', async () => {
    const jobs = playJobs();
    const packed = await jobs({ id: 1, kind: 'pack', files: sent(hut()) });
    expect(packed).toMatchObject({ kind: 'packed', name: 'the-hut', pack: { format: 6 } });
    const opened = await jobs({ id: 2, kind: 'open-files', files: sent(hut()) });
    if (opened.kind !== 'opened') throw new Error(JSON.stringify(opened));
    expect(opened).toMatchObject({ name: 'The hut', game: 'the-hut', shell: { title: 'The hut', daily: true } });
    const started = await jobs({ id: 3, kind: 'start', seed: '1', saving: { edition: 'playtest' }, at: 5 });
    if (started.kind !== 'started') throw new Error(JSON.stringify(started));
    expect(started.view.modes).toEqual(['hut']);
    expect(started.save).toMatchObject({ game: 'the-hut', edition: 'playtest', savedAt: 5 });
    const step = await jobs({ id: 4, kind: 'act', action: { type: 'hut/rest' }, at: 6 });
    if (step.kind !== 'stepped' || !step.save) throw new Error(JSON.stringify(step));
    expect(step).toMatchObject({ accepted: true, view: { turn: 1 } });
    const raw = JSON.stringify(step.save);
    const loaded = await jobs({ id: 5, kind: 'load', raw, saving: { edition: 'playtest' }, at: 7 });
    expect(loaded).toMatchObject({ kind: 'loaded', ok: true, view: { turn: 1 } });
  });

  it('refuse a project with errors, as nothing exports', async () => {
    const jobs = playJobs();
    const refused = await jobs({ id: 1, kind: 'open-files', files: sent(broken()) });
    expect(refused.kind).toBe('refused');
  });
});
