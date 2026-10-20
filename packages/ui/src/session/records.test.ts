/** A codex's entries and the credits in a play's view (M4.4, D54), from what the screens name. */
import { describe, expect, it } from 'vitest';
import { RECORDS as CRAG, cragWith } from '../../../kits/test/crag.ts';
import { wantsOf } from '../format/bindings.ts';
import type { Screen } from '../format/screen.ts';
import { startPlay } from './play.ts';

const crag = cragWith(CRAG, { first: 'marge', start: 'talking' });
const codexOf = (known: string) => ({
  widget: 'list',
  of: 'records',
  type: 'item',
  known,
  item: {
    widget: 'text',
    text: '{.name}: {inventory.count(item: @entry)}, worth {.value}',
    'shows-when': 'inventory.count(item: @entry) >= 1',
  },
  unknown: { widget: 'text', text: 'Not yet found' },
});
const screensOf = (known: string): Screen[] => [
  { main: { widget: 'stack', children: [codexOf(known) as never, { widget: 'text', text: '{time.day}' }] } },
];
// Nothing is carried at the start: an item is known once carried, or here while it isn't.
const CARRIED = 'inventory.count(item: @entry) > 0';
const MISSED = 'inventory.count(item: @entry) < 1';
const screens = screensOf(CARRIED);
const KEY = `records:item:${CARRIED}`;
const credits = [{ asset: 'rope.png', licence: 'CC-BY-4.0', licenceName: 'CC BY 4.0', source: 'x', author: 'Ana' }];
const play = (withCredits = false, known = CARRIED) =>
  startPlay(
    {
      game: crag.game,
      sim: crag.sim,
      kits: ['inventory', 'economy', 'dialogue'],
      wants: wantsOf(screensOf(known)),
      ...(withCredits ? { credits } : {}),
    },
    'crag',
  );

describe('a codex’s entries', () => {
  it('gathers what its item names @entry in apart, to be read for each entry', () => {
    expect(wantsOf(screens)).toEqual({
      facts: ['time.day'],
      conditions: [],
      records: [
        {
          key: KEY,
          type: 'item',
          known: CARRIED,
          facts: ['inventory.count(item: @entry)'],
          conditions: ['inventory.count(item: @entry) >= 1'],
        },
      ],
    });
  });

  it('holds back a record until known holds, with nothing of it in the entry', () => {
    expect(play().view.lists[KEY]).toEqual([{ key: 'rope', fields: {}, enabled: false, known: false }]);
  });

  it('once known, gives its own fields, its name, and the facts and conditions read for it', () => {
    const game = play(false, MISSED);
    const [rope] = game.view.lists[`records:item:${MISSED}`] ?? [];
    expect(rope).toEqual({
      key: 'rope',
      fields: { id: 'rope', name: 'Rope', value: 30 },
      enabled: false,
      facts: { 'inventory.count(item: @entry)': 0 },
      conditions: { 'inventory.count(item: @entry) >= 1': false },
    });
    // What the item names without @entry is read once, as anywhere else.
    expect(game.view.facts).toHaveProperty('time.day');
  });
});

describe('a codex’s facts, read for each record', () => {
  it('reads each entry’s @entry as that record, not as a record called "@entry"', () => {
    const resources: Screen = {
      main: {
        widget: 'list',
        of: 'records',
        type: 'resource',
        item: { widget: 'text', text: '{.name}: {economy.amount(resource: @entry)}' },
      },
    };
    const game = startPlay(
      { game: crag.game, sim: crag.sim, kits: ['inventory', 'economy', 'dialogue'], wants: wantsOf([resources]) },
      'crag',
    );
    const [cash] = game.view.lists['records:resource:'] ?? [];
    // The crag's cash starts at 20; a resource of no such id has none.
    expect(cash?.facts).toEqual({ 'economy.amount(resource: @entry)': 20 });
  });
});

describe('the credits', () => {
  it('lists each asset’s credit the pack carries, and none without', () => {
    expect(play(true).view.lists.credits).toEqual([
      {
        key: 'rope.png',
        fields: { asset: 'rope.png', author: 'Ana', licence: 'CC BY 4.0', source: 'x', tool: null },
        enabled: false,
      },
    ]);
    expect(play().view.lists.credits).toBeUndefined();
  });
});
