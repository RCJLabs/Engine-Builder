/**
 * Fighting in the editor (M6.4, D76): project.json's fighting as the Project panel's form reads and
 * changes it, and E082 as the open project runs the checks (projects/opened.ts), at the same files
 * and places as eb validate gives them. The camp is the gate's fixture; each case breaks it once.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { compileProject, memorySource } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { fightingChange } from '../editing/projectEdits.ts';
import { readCatalog } from '../forms/catalog.ts';
import { projectProblems } from '../problems/collect.ts';
import { EMPTY_INDEX, updateIndex } from '../records/recordIndex.ts';
import { NO_SCRIPTS } from '../scripts/gameState.ts';
import { spaceProblems } from '../spaces/spaceChecks.ts';
import { fightingProblems } from './fightingFile.ts';

const CAMP = join(import.meta.dirname, '../../../../tools/cli/test/fixtures/camp');
const decode = (bytes: Uint8Array | null | undefined) => (bytes ? new TextDecoder().decode(bytes) : undefined);

function camp(): Record<string, Uint8Array | string> {
  const files: Record<string, Uint8Array | string> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files[relative(CAMP, path).split('\\').join('/')] = readFileSync(path);
    }
  };
  walk(CAMP);
  return files;
}

/** The camp with project.json changed by `change`, its scripts left out: the checks here are the files'. */
function withProject(change: (project: Record<string, unknown>) => void): Record<string, Uint8Array | string> {
  const files = Object.fromEntries(Object.entries(camp()).filter(([path]) => !path.startsWith('scripts/')));
  const project = JSON.parse(decode(files['project.json'] as Uint8Array) as string);
  change(project);
  return { ...files, 'project.json': JSON.stringify(project, null, 2) };
}

async function checked(all: Record<string, Uint8Array | string>) {
  const source = memorySource(all);
  const catalog = await readCatalog(source);
  const first = await updateIndex(EMPTY_INDEX, source, catalog, null);
  const spaced = await spaceProblems(source, catalog, first, NO_SCRIPTS);
  const problems = projectProblems(catalog, { ...first, spaces: spaced.problems });
  return { source, catalog, problems };
}

const brief = (list: readonly { code: string; file?: string; path?: string }[]) =>
  list
    .filter((d) => d.code === 'E082')
    .map((d) => `${d.file} ${d.path}`)
    .sort();

describe('fighting’s checks in the editor', () => {
  const cases: [string, (project: Record<string, unknown>) => void, string[]][] = [
    ['sound', () => {}, []],
    ['missing', (p) => delete p.fighting, ['project.json ']],
    [
      'the player placed',
      (p) => Object.assign(p, { fighting: { player: 'rook', combat: 'blades' } }),
      ['project.json /fighting/player'],
    ],
    [
      'naming nothing',
      (p) => Object.assign(p, { fighting: { player: 'nobody', combat: 'fists' } }),
      ['project.json /fighting/combat', 'project.json /fighting/player'],
    ],
    ['half made', (p) => Object.assign(p, { fighting: { player: 'hero' } }), ['project.json /fighting/combat']],
    [
      'the kit off',
      (p) => Object.assign(p, { kits: ['inventory', 'stats', 'gear', 'time', 'encounters', 'ai'] }),
      ['project.json /fighting'],
    ],
  ];
  for (const [name, change, expected] of cases)
    it(`are eb validate’s: ${name}`, async () => {
      const { source, problems } = await checked(withProject(change));
      const compiler = (await compileProject(source, [])).diagnostics;
      expect(brief(problems)).toEqual(brief(compiler));
      expect(brief(problems)).toEqual(expected);
    });

  it('go to the form’s fields, the one that says it is missing to the whole form', async () => {
    const placed = await checked(
      withProject((p) => Object.assign(p, { fighting: { player: 'rook', combat: 'fists' } })),
    );
    expect(fightingProblems(placed.problems).map((d) => d.path)).toEqual(['/combat', '/player']);
    const missing = await checked(withProject((p) => delete p.fighting));
    expect(fightingProblems(missing.problems).map((d) => d.path)).toEqual(['']);
  });

  it('draw a weapon on items and drops and on-fall on actors, with the kit on', async () => {
    const { catalog } = await checked(withProject(() => {}));
    expect(Object.keys(catalog.types.get('item')?.file.fields ?? {})).toContain('weapon');
    expect(Object.keys(catalog.types.get('actor')?.file.fields ?? {})).toEqual(
      expect.arrayContaining(['drops', 'on-fall']),
    );
    expect(catalog.fighting).toEqual({ player: 'hero', combat: 'blades' });
  });
});

describe('fightingChange (M6.4)', () => {
  const MANIFEST = '{\n  "format": 1,\n  "id": "camp",\n  "kits": ["fighting"]\n}\n';
  const read = (change: { after: Uint8Array | null }[]) => JSON.parse(decode(change[0]?.after) as string);

  it('adds fighting from its first pick, changes it in place, and takes it out once emptied', async () => {
    const added = await fightingChange(memorySource({ 'project.json': MANIFEST }), (fighting) => {
      expect(fighting).toEqual({});
      return { player: 'hero' };
    });
    expect(read(added)).toEqual({ format: 1, id: 'camp', kits: ['fighting'], fighting: { player: 'hero' } });
    const fought = '{\n  "format": 1,\n  "fighting": { "player": "hero" },\n  "kits": ["fighting"]\n}\n';
    const changed = await fightingChange(memorySource({ 'project.json': fought }), (now) => ({
      ...(now as object),
      combat: 'blades',
    }));
    expect(Object.keys(read(changed))).toEqual(['format', 'fighting', 'kits']);
    expect(read(changed).fighting).toEqual({ player: 'hero', combat: 'blades' });
    const emptied = await fightingChange(memorySource({ 'project.json': fought }), () => ({}));
    expect(read(emptied)).toEqual({ format: 1, kits: ['fighting'] });
  });
});
