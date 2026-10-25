/**
 * The ai kit's checks in the editor (M6.3, D75) as the open project runs them (projects/opened.ts):
 * the index, the spaces' checks, then the records again with where each actor stands. E080, W149,
 * E081 and W148 come out as eb validate gives them, at the same files and places, and a change to
 * an actor checks its behaviour again.
 */
import { compileProject, memorySource, withScreens } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { readCatalog } from '../forms/catalog.ts';
import { projectProblems } from '../problems/collect.ts';
import { EMPTY_INDEX, updateIndex } from '../records/recordIndex.ts';
import { NO_SCRIPTS } from '../scripts/gameState.ts';
import { spaceProblems } from '../spaces/spaceChecks.ts';

const json = (value: unknown) => JSON.stringify(value, null, 2);
const PROJECT = {
  format: 1,
  id: 'green',
  name: 'Green',
  version: '0.1.0',
  kits: ['stats', 'time', 'ai'],
  calendar: { ticksPerDay: 1440, units: { minutes: 1, hours: 60 } },
};

const files = (): Record<string, string> => ({
  'project.json': json(PROJECT),
  'records/actor/smith.json': json({ name: 'Ada', behaviour: 'day' }),
  'records/actor/guard.json': json({ name: 'Bram', behaviour: 'day' }),
  'records/behaviour/day.json': json({
    name: 'Day',
    do: { first: [{ hours: [8, 30], do: { work: 'anvil' } }, { wait: { weeks: 1 } }] },
  }),
  'records/behaviour/idle.json': json({ do: { face: 'player' } }),
  'spaces/green.json': json({
    name: 'Green',
    objects: [
      { id: 'smith', record: 'actor:smith' },
      { id: 'forge', shape: 'box', components: { collider: {} } },
    ],
  }),
});

async function checked(all: Record<string, string>) {
  const source = memorySource(all);
  const catalog = await readCatalog(source);
  const first = await updateIndex(EMPTY_INDEX, source, catalog, null);
  const spaced = await spaceProblems(source, catalog, first, NO_SCRIPTS);
  const flags = withScreens(spaced.flags, new Map());
  const index = await updateIndex(first, source, catalog, [], {}, flags);
  const problems = projectProblems(catalog, { ...index, spaces: spaced.problems });
  return { source, catalog, first, index, flags, problems };
}

const CODES = ['E080', 'W149', 'E081', 'W148'];
const brief = (list: readonly { code: string; file?: string; path?: string }[]) =>
  list
    .filter((d) => CODES.includes(d.code))
    .map((d) => `${d.code} ${d.file} ${d.path}`)
    .sort();

describe('the ai kit’s checks in the editor', () => {
  it('are eb validate’s: each behaviour against its actors’ spaces and the calendar, one no actor has', async () => {
    const { source, problems } = await checked(files());
    const compiler = (await compileProject(source, [])).diagnostics;
    expect(brief(problems)).toEqual(brief(compiler));
    expect(brief(problems)).toEqual([
      'E081 records/actor/guard.json /behaviour',
      'E081 records/behaviour/day.json /do/first/0/do',
      'E081 records/behaviour/day.json /do/first/0/do/work',
      'E081 records/behaviour/day.json /do/first/0/hours/1',
      'E081 records/behaviour/day.json /do/first/1/wait/weeks',
      'W148 records/behaviour/idle.json ',
    ]);
  });

  it('are project.json’s clock, as eb validate gives it', async () => {
    const odd = { ...files(), 'project.json': json({ ...PROJECT, clock: { rate: 7 } }) };
    const still = { ...files(), 'project.json': json({ ...PROJECT, calendar: { ticksPerDay: 7 } }) };
    for (const all of [odd, still]) {
      const { source, problems } = await checked(all);
      expect(brief(problems)).toEqual(brief((await compileProject(source, [])).diagnostics));
    }
    expect(brief((await checked(odd)).problems)).toContain('E080 project.json /clock/rate');
    expect(brief((await checked(still)).problems)).toContain('W149 project.json ');
  });

  it('check a behaviour again when an actor takes it or gives it up', async () => {
    const before = await checked(files());
    expect(brief(before.problems)).toContain('W148 records/behaviour/idle.json ');
    const all = { ...files(), 'records/actor/smith.json': json({ name: 'Ada', behaviour: 'idle' }) };
    const source = memorySource(all);
    const index = await updateIndex(
      before.index,
      source,
      before.catalog,
      ['records/actor/smith.json'],
      {},
      before.flags,
    );
    const after = projectProblems(before.catalog, { ...index, spaces: [] });
    expect(brief(after)).not.toContain('W148 records/behaviour/idle.json ');
    // The day's one actor placed has left it: the smith's space no longer reads its points.
    expect(brief(after)).not.toContain('E081 records/behaviour/day.json /do/first/0/do/work');
    expect(brief(after)).toContain('E081 records/behaviour/day.json /do/first/0/hours/1');
  });
});
