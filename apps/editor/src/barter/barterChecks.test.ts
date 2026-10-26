/**
 * Barter and containers checked in the editor (M6.8, D80), as projects/opened.ts runs the checks: the
 * index, then the spaces' checks. E089 and W156 come out as eb validate gives them, W156 again when
 * only the actor changes, and the stock Container screen is offered once a chest holds items.
 */
import { compileProject, memorySource, withScreens } from '@eb/compiler';
import { describe, expect, it } from 'vitest';
import { readCatalog } from '../forms/catalog.ts';
import { projectProblems } from '../problems/collect.ts';
import { EMPTY_INDEX, updateIndex } from '../records/recordIndex.ts';
import { NO_SCRIPTS } from '../scripts/gameState.ts';
import { spaceProblems } from '../spaces/spaceChecks.ts';

const json = (value: unknown) => JSON.stringify(value, null, 2);

const chest = (fields: Record<string, unknown>) => ({
  id: 'chest',
  shape: 'box',
  components: { interact: { label: 'Open', effects: [], ...fields } },
});

const files = (kits: readonly string[] = ['inventory', 'economy', 'stats']): Record<string, string> => ({
  'project.json': json({ format: 1, id: 'post', name: 'Post', version: '0.1.0', kits }),
  'records/resource/coin.json': json({ name: 'Coin' }),
  'records/item/bread.json': json({ name: 'Bread' }),
  'records/actor/hild.json': json({ name: 'Hild', purse: { coin: 5 } }),
  'records/shop/post.json': json({ name: 'Post', actor: 'hild', currency: 'coin', buys: {} }),
  'spaces/yard.json': json({ name: 'Yard', objects: [chest({ takes: true, holds: { bread: 1 } })] }),
});

async function checked(all: Record<string, string>) {
  const source = memorySource(all);
  const catalog = await readCatalog(source);
  const first = await updateIndex(EMPTY_INDEX, source, catalog, null);
  const spaced = await spaceProblems(source, catalog, first, NO_SCRIPTS);
  const index = await updateIndex(first, source, catalog, [], {}, withScreens(spaced.flags, new Map()));
  return { index, catalog, problems: projectProblems(catalog, { ...index, spaces: spaced.problems }) };
}

const brief = (list: readonly { code: string; file?: string; path?: string }[]) =>
  list
    .filter((d) => ['E089', 'W156'].includes(d.code))
    .map((d) => `${d.code} ${d.file} ${d.path}`)
    .sort();

describe('barter and containers in the editor', () => {
  it('gives E089 and W156 as eb validate does', async () => {
    const all = files();
    const { problems } = await checked(all);
    const compiled = await compileProject(memorySource(all), []);
    expect(brief(problems)).toEqual(brief(compiled.diagnostics));
    expect(brief(problems)).toEqual([
      'E089 spaces/yard.json /objects/0/components/interact/holds',
      'W156 records/shop/post.json /actor',
    ]);
  });

  it('gives E089 for a chest with the inventory kit off, at its holds', async () => {
    const all: Record<string, string> = {
      ...files(['stats']),
      'spaces/yard.json': json({ name: 'Yard', objects: [chest({ holds: {} })] }),
    };
    delete all['records/shop/post.json'];
    delete all['records/resource/coin.json'];
    delete all['records/item/bread.json'];
    all['records/actor/hild.json'] = json({ name: 'Hild' });
    const { problems } = await checked(all);
    expect(brief(problems)).toEqual(['E089 spaces/yard.json /objects/0/components/interact/holds']);
  });

  it('takes W156 away when only the actor changes, as the shop and its actor are checked together', async () => {
    const all = files();
    const catalog = await readCatalog(memorySource(all));
    const before = await updateIndex(EMPTY_INDEX, memorySource(all), catalog, null);
    expect(brief(projectProblems(catalog, before))).toEqual(['W156 records/shop/post.json /actor']);
    // As projects/opened.ts does: only the changed file read again.
    all['records/actor/hild.json'] = json({ name: 'Hild', carries: { bread: 1 } });
    const after = await updateIndex(before, memorySource(all), catalog, ['records/actor/hild.json']);
    expect(brief(projectProblems(catalog, after))).toEqual([]);
  });
});
