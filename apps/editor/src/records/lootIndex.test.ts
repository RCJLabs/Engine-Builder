/**
 * The record index with kits (M3.3): a loot table's loop check reads every table, and a shop's
 * stock check reads every table under its stock, so an edit to one table is an edit to the
 * others' problems too, and to the shops'.
 */
import { describe, expect, it } from 'vitest';
import { problemsOf, project, shown } from '../../test/index-files.ts';

const A = 'records/loot-table/a.json';
const B = 'records/loot-table/b.json';
const YARD = 'records/shop/yard.json';

const table = (entry: Record<string, unknown>) => JSON.stringify({ entries: [{ ...entry, weight: 1 }] });

/** Ludus with both kits on, a rope to give and credits to pay in. */
function kitted() {
  const files = project();
  files.edit('project.json', (manifest) => {
    manifest.kits = ['inventory', 'economy'];
  });
  files.write('records/item/rope.json', '{ "value": 5 }');
  files.write('records/resource/credits.json', '{}');
  return files;
}

describe('the index with loot tables and shops', () => {
  it('checks every table again when one changes, so a loop shows at its first table', async () => {
    const files = kitted();
    files.write(A, table({ table: 'b' }));
    files.write(B, table({ item: 'rope' }));
    let { index, fresh } = await files.update(null);
    expect(problemsOf(index, 'loot-table:a')).toEqual([]);
    // Only b is written, but the loop is a's to report: a comes first by id.
    files.write(B, table({ table: 'a' }));
    ({ index, fresh } = await files.update([B]));
    expect(problemsOf(index, 'loot-table:a')).toEqual(['E036 /entries/0/table: Loot tables nest in a loop: a → b → a']);
    expect(shown(index)).toEqual(shown(fresh));
    files.write(B, table({ item: 'rope' }));
    ({ index, fresh } = await files.update([B]));
    expect(problemsOf(index, 'loot-table:a')).toEqual([]);
    expect(shown(index)).toEqual(shown(fresh));
  });

  it('checks a shop again when a table under its stock changes, though the shop names only the first', async () => {
    const files = kitted();
    files.write(A, table({ table: 'b' }));
    files.write(B, table({ item: 'rope' }));
    files.write(YARD, JSON.stringify({ currency: 'credits', stock: { table: 'a' } }));
    let { index, fresh } = await files.update(null);
    expect(problemsOf(index, 'shop:yard')).toEqual([]);
    files.write(B, table({ resource: 'credits' }));
    ({ index, fresh } = await files.update([B]));
    expect(problemsOf(index, 'shop:yard')).toEqual([
      'E035 /stock/table: Its stock table gives credits (in b): a shelf holds items only',
    ]);
    expect(shown(index)).toEqual(shown(fresh));
  });
});
