import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { readPack } from '@eb/core';
import { type Diagnostic, ENGINE_FACTS } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { sampleTypes } from '../../schema/test/samples.ts';
import { compileProject, compileWithGame, memorySource, projectGame } from './index.ts';
import { checkManifest } from './manifest.ts';

const HANGAR = join(import.meta.dirname, '../../../tools/cli/test/fixtures/hangar');

function filesIn(dir: string, root = dir): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) Object.assign(files, filesIn(full, root));
    else files[relative(root, full).split('\\').join('/')] = readFileSync(full, 'utf8');
  }
  return files;
}

const hangar = () => filesIn(HANGAR);
const manifest = (kits: unknown) => JSON.stringify({ format: 1, id: 'kitted', name: 'Kitted', version: '0.1.0', kits });
const brief = (diagnostics: readonly Diagnostic[]) =>
  diagnostics.map(({ code, file, path }) => `${code} ${file} ${path}`);

describe('project.json’s kits', () => {
  it('turns kits on in the engine’s order, whatever order they are listed in', () => {
    expect(checkManifest(JSON.parse(manifest(['economy', 'inventory']))).project?.kits).toEqual([
      'inventory',
      'economy',
    ]);
    expect(checkManifest(JSON.parse(manifest([]))).project).toEqual({ id: 'kitted', name: 'Kitted', version: '0.1.0' });
  });

  it('says so of a kit it doesn’t have, one listed twice, and one whose need is left out, and keeps reading', () => {
    const { project, problems } = checkManifest(JSON.parse(manifest(['inventory', 'magic', 'inventory'])));
    expect(project?.kits).toEqual(['inventory']);
    expect(problems.map(({ code, path }) => `${code} ${path}`)).toEqual(['E033 /kits/1', 'E033 /kits/2']);
    const alone = checkManifest(JSON.parse(manifest(['economy'])));
    expect(alone.project?.kits).toBeUndefined();
    expect(alone.problems).toEqual([
      { code: 'E034', path: '/kits/0', message: 'The economy kit needs inventory on too' },
    ]);
  });

  it('isn’t a list of names: project.json doesn’t read (E008)', () => {
    expect(checkManifest(JSON.parse(manifest('inventory'))).problems.map((p) => p.code)).toEqual(['E008']);
  });
});

describe('project.json’s calendar (M3.5)', () => {
  const timed = (calendar: unknown, kits = ['time']) => checkManifest({ ...JSON.parse(manifest(kits)), calendar });
  const brief = (problems: readonly { code: string; path: string }[]) => problems.map((p) => `${p.code} ${p.path}`);

  it('is the time kit’s, a day a tick unless it says otherwise', () => {
    expect(timed({ ticksPerDay: 24, daysPerYear: 360 })).toEqual({
      project: {
        id: 'kitted',
        name: 'Kitted',
        version: '0.1.0',
        kits: ['time'],
        calendar: { ticksPerDay: 24, daysPerYear: 360 },
      },
      problems: [],
    });
    expect(timed({ weekdays: ['sun', 'moon'] }).project?.calendar).toEqual({
      ticksPerDay: 1,
      weekdays: ['sun', 'moon'],
    });
    expect(timed(undefined).project).toEqual({ id: 'kitted', name: 'Kitted', version: '0.1.0', kits: ['time'] });
  });

  it('half filled in says where, and project.json still reads with its kits on (E038)', () => {
    const half = timed({ ticksPerDay: 'many', months: [{ id: 'thaw' }] });
    expect(half.project).toEqual({ id: 'kitted', name: 'Kitted', version: '0.1.0', kits: ['time'] });
    expect(brief(half.problems)).toEqual(['E038 /calendar/ticksPerDay', 'E038 /calendar/months/0/days']);
    // A calendar of the right shape that doesn't hold together, in calendarOf's words.
    expect(timed({ weekdays: [] }).problems).toEqual([
      { code: 'E038', path: '/calendar', message: 'Calendar: weekdays must not be empty' },
    ]);
  });

  it('is read by nothing with the time kit off, which project.json says (W116)', () => {
    const off = timed({ ticksPerDay: 24 }, ['inventory']);
    expect(off.project).toEqual({ id: 'kitted', name: 'Kitted', version: '0.1.0', kits: ['inventory'] });
    expect(brief(off.problems)).toEqual(['W116 /calendar']);
  });
});

describe('a project with kits', () => {
  it('compiles the hangar clean, into a format 3 pack that carries its kits and its scripts', async () => {
    const result = await compileWithGame(memorySource(hangar()));
    expect(brief(result.diagnostics)).toEqual([]);
    const pack = readPack(JSON.parse(JSON.stringify(result.pack)));
    expect(pack.format).toBe(3);
    expect(pack.project.kits).toEqual(['inventory', 'economy']);
    expect(Object.keys(pack.scripts ?? {}).sort()).toEqual(['game', 'hangar']);
    expect(Object.keys(pack.records).sort()).toEqual(['item', 'job', 'loot-table', 'resource', 'shop']);
  });

  it('draws the kits’ types for forms, a project’s fields after the kit’s, marked as whose', async () => {
    const result = await compileProject(memorySource(hangar()), []);
    const item = result.dataTypes.get('item');
    expect(item?.file.title).toBe('Part');
    expect(Object.keys(item?.file.fields ?? {})).toEqual([
      'name',
      'description',
      'value',
      'max',
      'tags',
      'category',
      'maker',
      'size',
    ]);
    expect(item?.kit).toEqual({ id: 'inventory', fields: ['name', 'description', 'value', 'max', 'tags'] });
    expect(result.dataTypes.get('shop')?.kit?.id).toBe('economy');
    expect(result.dataTypes.get('job')?.kit).toBeUndefined();
  });

  it('refuses a project’s field with a kit field’s name (E037), checking its records by the kit’s alone', async () => {
    const files = { ...hangar(), 'types/item.json': JSON.stringify({ fields: { value: { kind: 'text' } } }) };
    const result = await compileProject(memorySource(files), []);
    // The parts' own fields are now unknown keys: the clash is the fix, the rest follow it.
    expect(brief(result.diagnostics).filter((d) => !d.startsWith('E001'))).toEqual([
      'E037 types/item.json /fields/value',
    ]);
  });

  it('leaves the kits’ names free with the kits off: a type of the project’s own, as before', async () => {
    const files = { ...hangar(), 'project.json': manifest(undefined) };
    const result = await compileProject(memorySource(files), []);
    expect(result.dataTypes.get('item')?.kit).toBeUndefined();
    expect(brief(result.diagnostics)).toEqual(expect.arrayContaining(['E002 records/resource/credits.json ']));
  });

  it('throws when the game’s code defines a type a kit that is on has', async () => {
    const files = { 'project.json': manifest(['inventory']) };
    await expect(compileProject(memorySource(files), sampleTypes)).rejects.toThrow(
      'The game\'s code defines "item", which the inventory kit has',
    );
  });

  it('runs its game with the kits joined, after the engine’s modules and before its own', async () => {
    const scripted = await projectGame(memorySource(hangar()));
    if (scripted.kind !== 'loaded') throw new Error(scripted.kind);
    expect(scripted.game.modules.map((m) => m.id)).toEqual([
      'logic',
      'flag',
      'sheet',
      'inventory',
      'economy',
      'time',
      'hangar',
    ]);
    expect(scripted.catalog.effects).toEqual(expect.arrayContaining(['give-item', 'open-shop', 'wait']));
  });

  it('refuses a game module with a kit’s id that isn’t the kit (E031)', async () => {
    const files = {
      ...hangar(),
      'scripts/game.ts': [
        "import { defineModule } from 'eb';",
        "export const modules = [defineModule({ id: 'inventory', init: () => ({}), modes: { a: { actions: [] } } })];",
        "export const start = 'a';",
      ].join('\n'),
    };
    const result = await compileWithGame(memorySource(files));
    expect(result.diagnostics.map((d) => d.code)).toContain('E031');
    expect(result.diagnostics.find((d) => d.code === 'E031')?.message).toContain('the inventory kit');
  });

  it('warns of a shop that stocks again when the game has no days (W113)', async () => {
    const result = await compileProject(memorySource(hangar()), [], { facts: ENGINE_FACTS });
    expect(brief(result.diagnostics)).toEqual(['W113 records/shop/dutch-yard.json /stock/every']);
  });
});
