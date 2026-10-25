/**
 * The editor's navmesh checks (M6.2, D74) as the open project runs them (projects/opened.ts): the
 * index, then the spaces' checks, then the records again with what the spaces hold. E076, E078,
 * E079 and W147 come out as eb validate gives them, at the same files and places.
 */
import { compileProject, memorySource, withScreens } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { readCatalog } from '../forms/catalog.ts';
import { projectProblems } from '../problems/collect.ts';
import { EMPTY_INDEX, updateIndex } from '../records/recordIndex.ts';
import { NO_SCRIPTS } from '../scripts/gameState.ts';
import { spaceProblems } from '../spaces/spaceChecks.ts';

const json = (value: unknown) => JSON.stringify(value, null, 2);
const walk = (actor: string, to: string) => ({ effect: 'walk-to', actor, to });

const files = (): Record<string, string> => ({
  'project.json': json({ format: 1, id: 'square', name: 'Square', version: '0.1.0', kits: ['stats'] }),
  'records/actor/carter.json': json({ name: 'Carter' }),
  'records/actor/keeper.json': json({ name: 'Keeper' }),
  'spaces/square.json': json({
    name: 'Square',
    objects: [
      { id: 'carter', record: 'actor:carter' },
      { id: 'well', shape: 'box', components: { collider: {} } },
    ],
  }),
  'spaces/square.nav': 'EBNV\u00010000000000000000recast',
  'spaces/inn.json': json({ name: 'Inn', objects: [{ id: 'keeper', record: 'actor:keeper' }] }),
  'spaces/moor.nav': 'not a navmesh',
  'records/sheet/walks.json': json({
    rows: [
      {
        id: 'go',
        when: { event: 'world/arrived' },
        do: [walk('carter', 'pump'), walk('keeper', 'keeper'), { effect: 'enter-space', space: 'inn', spawn: 'door' }],
      },
    ],
  }),
});

/** The open project's checks, as projects/opened.ts runs them: the index, the spaces', the records again. */
async function checked(all: Record<string, string>) {
  const source = memorySource(all);
  const catalog = await readCatalog(source);
  const first = await updateIndex(EMPTY_INDEX, source, catalog, null);
  const spaced = await spaceProblems(source, catalog, first, NO_SCRIPTS);
  const flags = withScreens(spaced.flags, new Map());
  const index = await updateIndex(first, source, catalog, [], {}, flags);
  const problems = (at: typeof index) => projectProblems(catalog, { ...at, spaces: spaced.problems });
  return { source, catalog, flags, index, problems };
}

const brief = (list: readonly { code: string; file?: string; path?: string }[]) =>
  list
    .filter((d) => ['E076', 'E078', 'E079', 'W147'].includes(d.code))
    .map((d) => `${d.code} ${d.file} ${d.path}`)
    .sort();

describe('the navmesh checks in the editor', () => {
  it('are eb validate’s: the records’ walk-to and enter-space heard against the spaces, and the .nav files', async () => {
    const { source, index, problems } = await checked(files());
    const editor = problems(index);
    const compiler = (await compileProject(source, [])).diagnostics;
    expect(brief(editor)).toEqual(brief(compiler));
    expect(brief(editor)).toEqual([
      'E076 records/sheet/walks.json /rows/0/do/2/spawn',
      'E078 spaces/moor.nav ',
      'E079 records/sheet/walks.json /rows/0/do/0/to',
      'E079 records/sheet/walks.json /rows/0/do/1',
      'W147 spaces/square.nav ',
    ]);
  });

  it('give a .nav that won’t read as E078 alone, not an E079 at each walk-to into its space as well', async () => {
    // The carter to the well, an object the square has: only its navmesh is left to check.
    const all = {
      ...files(),
      'spaces/square.nav': 'EBNV\u0001 not a navmesh',
      'records/sheet/walks.json': json({
        rows: [{ id: 'go', when: { event: 'world/arrived' }, do: [walk('carter', 'well')] }],
      }),
    };
    const { source, index, problems } = await checked(all);
    const compiler = (await compileProject(source, [])).diagnostics;
    expect(brief(problems(index))).toEqual(brief(compiler));
    expect(brief(problems(index)).filter((line) => line.includes('square'))).toEqual(['E078 spaces/square.nav ']);
  });

  it('check the records again when only where the actors stand has changed: a navmesh baked for the inn', async () => {
    const { source, catalog, flags, index, problems } = await checked(files());
    expect(brief(problems(index))).toContain('E079 records/sheet/walks.json /rows/0/do/1');
    const walkers = new Map([...(flags.walkers ?? [])].map(([actor, w]) => [actor, { ...w, navmesh: true }]));
    const baked = await updateIndex(index, source, catalog, [], {}, { ...flags, walkers });
    expect(brief(problems(baked))).not.toContain('E079 records/sheet/walks.json /rows/0/do/1');
  });
});
