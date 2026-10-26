/**
 * A quest's world slots checked in the editor (M6.7, D79), as projects/opened.ts runs the checks: the
 * index, the spaces' checks, then the records again with the spaces' tags. E088, W127 and E086 come
 * out as eb validate gives them; a slot's In offers the spaces and the space slots before it, and a
 * target's Space and Object offer the space slots and the object slots In it.
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

const QUEST = {
  name: 'Fetch',
  'at-start': true,
  slots: [
    { id: 'cave', type: 'space', tags: ['cave'], pick: 'nearest' },
    { id: 'cache', type: 'object', in: '@cave', tags: ['cache'] },
    { id: 'lost', type: 'object', tags: ['cache'] },
    { id: 'den', type: 'space', tags: ['den'] },
    { id: 'who', type: 'actor', record: 'wick', pick: 'nearest' },
  ],
  stages: [
    {
      id: 'go',
      objectives: [
        { id: 'a', text: 'A', 'done-when': 'world.in(space: green)', target: { space: '@cave', object: '@cache' } },
        { id: 'b', text: 'B', 'done-when': 'world.in(space: green)', target: { space: '@cave', object: '@lost' } },
        { id: 'c', text: 'C', 'done-when': 'world.in(space: green)', target: { space: '@who' } },
      ],
    },
  ],
};

const files = (): Record<string, string> => ({
  'project.json': json({ format: 1, id: 'hollow', name: 'Hollow', version: '0.1.0', kits: ['stats', 'quests'] }),
  'records/actor/wick.json': json({ name: 'Wick' }),
  'spaces/green.json': json({ name: 'Green', objects: [{ id: 'well', shape: 'box' }] }),
  'spaces/barrow.json': json({
    name: 'Barrow',
    tags: ['cave'],
    objects: [
      { id: 'cache', shape: 'box', tags: ['cache'] },
      { id: 'wick', record: 'actor:wick' },
    ],
  }),
  'records/quest/fetch.json': json(QUEST),
});

async function checked(all: Record<string, string>) {
  const source = memorySource(all);
  const catalog = await readCatalog(source);
  const first = await updateIndex(EMPTY_INDEX, source, catalog, null);
  const spaced = await spaceProblems(source, catalog, first, NO_SCRIPTS);
  const index = await updateIndex(first, source, catalog, [], {}, withScreens(spaced.flags, new Map()));
  return { index, problems: projectProblems(catalog, { ...index, spaces: spaced.problems }) };
}

const brief = (list: readonly { code: string; file?: string; path?: string }[]) =>
  list
    .filter((d) => ['E086', 'E088', 'W127'].includes(d.code))
    .map((d) => `${d.code} ${d.file} ${d.path}`)
    .sort();

describe('a quest’s world slots in the editor', () => {
  it('gives E088, W127 and E086 as eb validate does', async () => {
    const all = files();
    const { problems } = await checked(all);
    const compiled = await compileProject(memorySource(all), []);
    expect(brief(problems)).toEqual(brief(compiled.diagnostics));
    expect(brief(problems)).toEqual([
      'E086 records/quest/fetch.json /stages/0/objectives/1/target/object',
      'E086 records/quest/fetch.json /stages/0/objectives/2/target/space',
      'E088 records/quest/fetch.json /slots/2/in',
      'E088 records/quest/fetch.json /slots/4/pick',
      'W127 records/quest/fetch.json /slots/3/tags',
    ]);
  });

  it('checks the slots again when a tag is added to a space, as the open project updates its index', async () => {
    const { index, problems } = await checked(files());
    expect(index.flagsElsewhere?.tags?.spaces.get('barrow')).toEqual(['cave']);
    expect(brief(problems)).toContain('W127 records/quest/fetch.json /slots/3/tags');
    const denned = files();
    denned['spaces/green.json'] = json({ name: 'Green', tags: ['den'], objects: [{ id: 'well', shape: 'box' }] });
    // As projects/opened.ts does: the changed file read, then the records again with the spaces' new tags.
    const source = memorySource(denned);
    const catalog = await readCatalog(source);
    const read = await updateIndex(index, source, catalog, ['spaces/green.json'], {}, index.flagsElsewhere);
    const spaced = await spaceProblems(source, catalog, read, NO_SCRIPTS);
    const again = await updateIndex(read, source, catalog, [], {}, withScreens(spaced.flags, new Map()));
    const now = projectProblems(catalog, { ...again, spaces: spaced.problems });
    expect(brief(now)).not.toContain('W127 records/quest/fetch.json /slots/3/tags');
  });

  it('offers In the spaces and the space slots before it, and a target the slots that fit', () => {
    const sources = {
      actors: ['wick'],
      spaces: ['green', 'barrow'],
      objects: new Map([['barrow', new Set(['cache'])]]),
    };
    expect(targetChoices(QUEST, sources, ['slots', 1, 'in'])).toEqual(['barrow', 'green', '@cave']);
    expect(targetChoices(QUEST, sources, ['slots', 0, 'in'])).toEqual(['barrow', 'green']);
    expect(targetChoices(QUEST, sources, ['slots', 3, 'in'])).toEqual(['barrow', 'green', '@cave']);
    const at = (field: string) => ['stages', 0, 'objectives', 0, 'target', field];
    expect(targetChoices(QUEST, sources, at('space'))).toEqual(['barrow', 'green', '@cave', '@den']);
    expect(targetChoices(QUEST, sources, at('object'))).toEqual(['@cache']);
    const literal = { ...QUEST, stages: [{ id: 'go', objectives: [{ id: 'a', target: { space: 'barrow' } }] }] };
    expect(targetChoices(literal, sources, at('object'))).toEqual(['cache']);
    expect(targetChoices(QUEST, sources, at('actor'))).toEqual(['wick', '@who']);
  });
});
