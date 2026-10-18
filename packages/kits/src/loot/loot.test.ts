import { createRecordStore, type GameState, wilson } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { apply, fact, game, RECORDS, sim, start, step } from '../../test/market.ts';

const bag = (state: GameState) => (state.inventory as { bag: Record<string, number> }).bag;
const credits = (state: GameState) => fact(state, 'economy.amount', { resource: 'credits' });
const roll = (state: GameState, table: string) => apply(state, { effect: 'roll-loot', table });

/** Rolls `table` `times` times in one game, counting what each roll added to the bag. */
function tally(table: string, times: number, seed = 'tally'): Map<string, number> {
  const counts = new Map<string, number>();
  let state = start(seed);
  for (let i = 0; i < times; i++) {
    const before = { ...bag(state) };
    state = roll(state, table);
    const after = bag(state);
    const added = Object.keys(after).filter((id) => (after[id] ?? 0) > (before[id] ?? 0));
    for (const id of added.length > 0 ? added : ['nothing']) counts.set(id, (counts.get(id) ?? 0) + 1);
    // Empty the bag, so a reactor's max never stops one landing.
    state = apply(state, ...Object.entries(after).map(([item, count]) => ({ effect: 'take-item', item, count })));
  }
  return counts;
}

describe('loot tables', () => {
  it('give what they draw: items, resources, and rolls of tables inside them', () => {
    const state = roll(start(), 'cash');
    const paid = (credits(state) as number) - 60;
    expect(paid).toBeGreaterThanOrEqual(5);
    expect(paid).toBeLessThanOrEqual(15);
    const stocked = roll(start(), 'stock');
    const items = Object.values(bag(stocked)).reduce((sum, n) => sum + n, 0);
    // Two picks of different entries, each a count of 1.
    expect(items).toBe(2);
    expect(Object.keys(bag(stocked))).toHaveLength(2);
  });

  it('draw the same for the same seed, and differently for another', () => {
    const results = (seed: string) => {
      let state = start(seed);
      for (let i = 0; i < 20; i++) state = roll(state, 'scrap');
      return bag(state);
    };
    expect(results('one')).toEqual(results('one'));
    expect(results('one')).not.toEqual(results('two'));
  });

  it('draw each table from a stream of its own, so rolling one never shifts another', () => {
    const scrapAlone = () => {
      let state = start('streams');
      for (let i = 0; i < 10; i++) state = roll(state, 'scrap');
      return bag(state);
    };
    let mixed = start('streams');
    for (let i = 0; i < 10; i++) mixed = roll(roll(mixed, 'cash'), 'scrap');
    expect(bag(mixed)).toEqual(scrapAlone());
    expect(Object.keys(mixed.kernel.streams)).toEqual(
      expect.arrayContaining(['inventory/loot-scrap', 'inventory/loot-scrap-parts', 'inventory/loot-cash']),
    );
  });

  it('take an entry out while its condition is false, and back in once true', () => {
    const gated = {
      ...RECORDS,
      'loot-table': {
        ...RECORDS['loot-table'],
        gated: {
          entries: [
            { item: 'medkit', weight: 1 },
            { item: 'reactor', weight: 1000, if: { fact: 'flag.on', args: { flag: 'owes-dutch' } } },
          ],
        },
      },
    };
    const store = createRecordStore(gated);
    const rollIn = (state: GameState) =>
      game.reduce(state, { type: 'town/do', effects: [{ effect: 'roll-loot', table: 'gated' }] }, { content: store })
        .state;
    let off = start();
    for (let i = 0; i < 30; i++) off = rollIn(off);
    expect(bag(off)).toEqual({ medkit: 30 });
    const on = game.reduce(
      start(),
      { type: 'town/do', effects: [{ effect: 'set-flag', flag: 'owes-dutch', to: true }] },
      { content: store },
    ).state;
    expect(bag(rollIn(on))).toEqual({ reactor: 1 });
  });

  it('stop drawing when nothing is left in a unique roll', () => {
    const records = {
      ...RECORDS,
      'loot-table': {
        ...RECORDS['loot-table'],
        all: {
          picks: { min: 5 },
          unique: true,
          entries: [
            { item: 'medkit', weight: 1 },
            { item: 'airlock', weight: 1 },
          ],
        },
      },
    };
    const state = game.reduce(
      start(),
      { type: 'town/do', effects: [{ effect: 'roll-loot', table: 'all' }] },
      {
        content: createRecordStore(records),
      },
    ).state;
    expect(bag(state)).toEqual({ airlock: 1, medkit: 1 });
  });

  it('preview the odds the roll reads: the entries in the roll, their weights and the total', () => {
    const [scrap] = game.preview(start(), [{ effect: 'roll-loot', table: 'scrap' }], sim);
    expect(scrap).toEqual({
      effect: 'roll-loot',
      table: 'scrap',
      picks: { min: 1, max: 1 },
      nothing: 60,
      total: 100,
      entries: [
        {
          table: 'scrap-parts',
          weight: 40,
          count: { min: 1, max: 1 },
          odds: {
            table: 'scrap-parts',
            picks: { min: 1, max: 1 },
            nothing: 0,
            total: 3,
            entries: [
              { item: 'airlock', weight: 1, count: { min: 1, max: 1 } },
              { item: 'corridor', weight: 1, count: { min: 1, max: 1 } },
              { item: 'reactor', weight: 1, count: { min: 1, max: 1 } },
            ],
          },
        },
      ],
    });
  });

  it('come up as often as the preview says: each share within its 95% interval over 6,000 rolls', () => {
    const times = 6000;
    const counts = tally('scrap', times);
    // Nothing 60 of 100; then 40 of 100 split three ways.
    const expected = new Map([
      ['nothing', 0.6],
      ['airlock', 0.4 / 3],
      ['corridor', 0.4 / 3],
      ['reactor', 0.4 / 3],
    ]);
    for (const [id, share] of expected) {
      const { low, high } = wilson(counts.get(id) ?? 0, times);
      expect(share, `${id}: ${counts.get(id)} of ${times}`).toBeGreaterThanOrEqual(low);
      expect(share, `${id}: ${counts.get(id)} of ${times}`).toBeLessThanOrEqual(high);
    }
  });

  it('roll through actions as content would: a job that pays in parts', () => {
    let state = start('jobs');
    for (let i = 0; i < 5; i++) state = step(state, { type: 'town/work', table: 'scrap' });
    expect(fact(state, 'time.day')).toBe(5);
  });
});
