import { readPack } from '@eb/core';
import { type Diagnostic, ENGINE_FACTS } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { compileProject, memorySource, readScenes } from './index.ts';

const brief = (diagnostics: readonly Diagnostic[]) =>
  diagnostics.map((d) => `${d.code} ${d.file}${d.line !== undefined ? `:${d.line}` : ''} ${d.message}`);
const byFile = (a: Diagnostic, b: Diagnostic) => ((a.file ?? '') < (b.file ?? '') ? -1 : 1);
const project = (kits: string[]) => JSON.stringify({ format: 1, id: 'gate', name: 'Gate', version: '0.1.0', kits });

const HELLO = [
  'EXTERNAL flag_on(flag)',
  'Hello. # speaker: hild',
  '* {flag_on("met")} [Again.]',
  '* [Bye.]',
  '- -> END',
];

describe('reading scenes', () => {
  it('compiles each scenes/<id>.ink into the talk <id>, and says what else is there', async () => {
    const read = await readScenes(
      memorySource({
        'scenes/hello.ink': HELLO.join('\n'),
        'scenes/broken.ink': 'VAR x = 1\nHi.',
        'scenes/old/a.ink': 'Hi.',
        'scenes/Big Hall.ink': 'Hi.',
        'scenes/notes.md': '',
        'scenes/latin1.ink': new Uint8Array([0xe9]),
      }),
      ENGINE_FACTS,
      ['dialogue'],
    );
    expect(read.ids).toEqual(['broken', 'hello', 'latin1']);
    expect(brief([...read.diagnostics].sort(byFile))).toEqual([
      'E046 scenes/Big Hall.ink "Big Hall" isn’t a talk’s id: name a scene in lowercase words joined by hyphens',
      'E046 scenes/broken.ink:1 ink’s variables aren’t read: keep state in the game, as facts and effects',
      'E046 scenes/latin1.ink Not valid UTF-8 text',
      'W131 scenes/notes.md Ignored: scenes are scenes/<id>.ink',
      'E046 scenes/old/a.ink A scene sits at scenes/<id>.ink, not in a folder of its own',
    ]);
    // A scene with a problem of its own is still a talk, unreadable, so what names it doesn't fail too.
    const records = Object.fromEntries(read.records.map((r) => [r.id, r]));
    expect(records.broken).toMatchObject({ type: 'talk', file: 'scenes/broken.ink', unreadable: true });
    expect(records.hello).toMatchObject({ type: 'talk', file: 'scenes/hello.ink' });
    expect(records.hello?.value).toMatchObject({ starts: [{ line: 'start' }] });
  });

  it('needs the dialogue kit', async () => {
    const read = await readScenes(memorySource({ 'scenes/hello.ink': 'Hi.' }), ENGINE_FACTS, ['inventory']);
    expect(brief(read.diagnostics)).toEqual([
      'E046 scenes/hello.ink A scene compiles into a talk: turn the dialogue kit on in project.json',
    ]);
  });
});

describe('compiling a project with scenes', () => {
  it('checks a scene’s talk as any talk, at the scene’s lines, and packs it', async () => {
    const files = {
      'project.json': project(['dialogue']),
      'records/speaker/hild.json': '{ "name": "Hild" }',
      'records/flag/met.json': '{}',
      'records/sheet/dusk.json': JSON.stringify({
        rows: [
          {
            id: 'a',
            when: { event: 'dialogue/ended' },
            do: [
              { effect: 'set-flag', flag: 'met', to: true },
              { effect: 'open-talk', talk: 'hello' },
            ],
          },
        ],
      }),
      'scenes/hello.ink': HELLO.join('\n'),
    };
    const sound = await compileProject(memorySource(files), [], { facts: ENGINE_FACTS });
    expect(brief(sound.diagnostics)).toEqual([]);
    const pack = readPack(JSON.parse(JSON.stringify(sound.pack)));
    expect(pack.records.talk?.hello).toMatchObject({ lines: [{ id: 'start', speaker: 'hild' }] });

    const wrong = HELLO.map((line, i) => (i === 1 ? 'Hello. # speaker: hilda' : line)).join('\n');
    const broken = await compileProject(memorySource({ ...files, 'scenes/hello.ink': wrong }), [], {
      facts: ENGINE_FACTS,
    });
    expect(brief(broken.diagnostics)).toEqual(['E005 scenes/hello.ink:2 No record speaker:hilda']);
    expect(broken.diagnostics[0]).toMatchObject({ type: 'talk', id: 'hello', path: '/lines/0/speaker' });
  });

  it('finds a scene and a talk record with one id', async () => {
    const twice = await compileProject(
      memorySource({
        'project.json': project(['dialogue']),
        'records/talk/hello.json': JSON.stringify({ starts: [{ line: 'a' }], lines: [{ id: 'a', text: 'A' }] }),
        'scenes/hello.ink': 'Hi.',
      }),
      [],
      { facts: ENGINE_FACTS },
    );
    expect(brief(twice.diagnostics).filter((d) => d.startsWith('E004'))).toEqual([
      'E004 records/talk/hello.json 2 talk records have the id "hello"',
      'E004 scenes/hello.ink 2 talk records have the id "hello"',
    ]);
  });
});
