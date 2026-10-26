/**
 * A quest's targets checked in the editor (M6.6, D78), as projects/opened.ts runs the checks: the
 * index, then the spaces' checks, then the records again with what the spaces hold. E086 and W155
 * come out as eb validate gives them, at the same files and places; and the target's form offers the
 * objects of the space it names, which only the spaces' read knows.
 */
import { compileProject, memorySource, withScreens } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { readCatalog } from '../forms/catalog.ts';
import { projectProblems } from '../problems/collect.ts';
import { EMPTY_INDEX, updateIndex } from '../records/recordIndex.ts';
import { NO_SCRIPTS } from '../scripts/gameState.ts';
import { spaceProblems } from '../spaces/spaceChecks.ts';
import { targetChoices } from './targetChoices.ts';

const json = (value: unknown) => JSON.stringify(value, null, 2);

const files = (): Record<string, string> => ({
  'project.json': json({ format: 1, id: 'yard', name: 'Yard', version: '0.1.0', kits: ['quests', 'stats'] }),
  'records/actor/smith.json': json({ name: 'Smith' }),
  'records/actor/drover.json': json({ name: 'Drover' }),
  'prefabs/stall.json': json({ name: 'Stall', objects: [{ id: 'counter', shape: 'box' }] }),
  'spaces/yard.json': json({
    name: 'Yard',
    objects: [
      { id: 'smith', record: 'actor:smith' },
      { id: 'well', shape: 'box' },
      { id: 'stall', prefab: 'stall' },
    ],
  }),
  'records/quest/errand.json': json({
    name: 'Errand',
    stages: [
      {
        id: 'go',
        log: 'Round the yard.',
        objectives: [
          { id: 'well', text: 'The well', 'done-when': 'true', target: { space: 'yard', object: 'well' } },
          {
            id: 'counter',
            text: 'The counter',
            'done-when': 'true',
            target: { space: 'yard', object: 'stall/counter' },
          },
          { id: 'smith', text: 'The smith', 'done-when': 'true', target: { actor: 'smith' } },
          { id: 'pump', text: 'The pump', 'done-when': 'true', target: { space: 'yard', object: 'pump' } },
          { id: 'moor', text: 'The moor', 'done-when': 'true', target: { space: 'moor' } },
          { id: 'drover', text: 'The drover', 'done-when': 'true', target: { actor: 'drover' } },
        ],
      },
    ],
  }),
});

async function checked(all: Record<string, string>) {
  const source = memorySource(all);
  const catalog = await readCatalog(source);
  const first = await updateIndex(EMPTY_INDEX, source, catalog, null);
  const spaced = await spaceProblems(source, catalog, first, NO_SCRIPTS);
  const index = await updateIndex(first, source, catalog, [], {}, withScreens(spaced.flags, new Map()));
  return { catalog, index, problems: projectProblems(catalog, { ...index, spaces: spaced.problems }) };
}

const brief = (list: readonly { code: string; file?: string; path?: string }[]) =>
  list
    .filter((d) => d.code === 'E086' || d.code === 'W155')
    .map((d) => `${d.code} ${d.file} ${d.path}`)
    .sort();

describe('a quest’s targets in the editor', () => {
  it('gives E086 and W155 as eb validate does', async () => {
    const all = files();
    const { problems } = await checked(all);
    const compiled = await compileProject(memorySource(all), []);
    expect(brief(problems)).toEqual(brief(compiled.diagnostics));
    expect(brief(problems)).toEqual([
      'E086 records/quest/errand.json /stages/0/objectives/3/target/object',
      'E086 records/quest/errand.json /stages/0/objectives/4/target/space',
      'W155 records/quest/errand.json /stages/0/objectives/5/target/actor',
    ]);
  });

  it('offers the objects of the space a target names, through its prefabs', async () => {
    const { index } = await checked(files());
    const objects = index.flagsElsewhere?.objects ?? new Map();
    const quest = JSON.parse(files()['records/quest/errand.json'] as string);
    const at = ['stages', 0, 'objectives', 0, 'target', 'object'];
    expect(targetChoices(quest, { actors: [], spaces: [], objects }, at)).toEqual([
      'smith',
      'stall',
      'stall/counter',
      'well',
    ]);
  });
});
