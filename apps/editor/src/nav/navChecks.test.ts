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

const brief = (list: readonly { code: string; file?: string; path?: string }[]) =>
  list
    .filter((d) => ['E076', 'E078', 'E079', 'W147'].includes(d.code))
    .map((d) => `${d.code} ${d.file} ${d.path}`)
    .sort();

describe('the navmesh checks in the editor', () => {
  it('are eb validate’s: the records’ walk-to and enter-space heard against the spaces, and the .nav files', async () => {
    const source = memorySource(files());
    const catalog = await readCatalog(source);
    const first = await updateIndex(EMPTY_INDEX, source, catalog, null);
    const spaced = await spaceProblems(source, catalog, first, NO_SCRIPTS);
    const index = await updateIndex(first, source, catalog, [], {}, withScreens(spaced.flags, new Map()));
    const editor = projectProblems(catalog, { ...index, spaces: spaced.problems });
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
});
