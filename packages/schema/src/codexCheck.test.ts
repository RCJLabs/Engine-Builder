/** The checks M4.4 adds to screens (D54): a codex's records list and `@entry`, the credits list and the shell's buttons. */
import type { RecordIndex } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { knownFrom } from './known.ts';
import { checkUi, type UiCheckOptions, type UiFile } from './uiCheck.ts';

const KITS = ['inventory', 'economy', 'events'];
const ids: Readonly<Record<string, readonly string[]>> = { item: ['rope'], resource: ['coins'], event: ['storm'] };
const records: RecordIndex = { ids: (type) => ids[type] ?? [], has: (type, id) => ids[type]?.includes(id) ?? false };
const game: UiCheckOptions = {
  facts: knownFrom({ kits: KITS, facts: knownFrom({}).facts }).facts,
  openFacts: false,
  kits: KITS,
  actions: ['hut/rest'],
  modes: ['hut'],
  records,
  recordFields: { item: ['name', 'value'], resource: ['name', 'start'], event: ['name', 'text'], odd: null },
};

const files = (screens: Record<string, unknown>): Map<string, UiFile> =>
  new Map(Object.entries(screens).map(([id, value]) => [id, { file: `ui/${id}.json`, value }]));
const only = (main: unknown, options: Partial<UiCheckOptions> = {}) =>
  checkUi(files({ hud: { shows: ['hut'], main } }), undefined, { ...game, ...options }).map(
    ({ code, path, message }) => ({ code, path, message }),
  );

const codex = (more: object) => ({
  widget: 'list',
  of: 'records',
  type: 'item',
  known: 'inventory.count(item: @entry) > 0',
  item: { widget: 'text', text: '{.name}: {inventory.count(item: @entry)} carried, worth {.value}' },
  unknown: { widget: 'text', text: 'Not yet found' },
  ...more,
});

describe('a codex: a records list (M4.4)', () => {
  it('passes a records list whose item and known name @entry, and its own fields', () => {
    expect(only(codex({}))).toEqual([]);
    // shows-when in its item may name @entry too, and without known every entry is known.
    const item = { widget: 'text', text: '{.id}', 'shows-when': 'inventory.count(item: @entry) > 1' };
    expect(only(codex({ known: undefined, unknown: undefined, item }))).toEqual([]);
  });

  it('asks for a type the project has, and says only a records list has one', () => {
    expect(only(codex({ type: undefined }))).toEqual([
      { code: 'E049', path: '/main/of', message: 'A records list names the record type it lists, as type' },
    ]);
    expect(only(codex({ type: 'spell', known: undefined }))).toEqual([
      { code: 'E049', path: '/main/type', message: 'The project has no record type "spell"' },
    ]);
    const bag = { widget: 'list', of: 'bag', type: 'item', item: { widget: 'text', text: '{.name}' } };
    expect(only(bag)).toEqual([
      { code: 'E049', path: '/main/type', message: 'Only a records list has type: this is a list of bag' },
    ]);
  });

  it('checks known and @entry against the list’s type, as a quest’s @slot is', () => {
    const wrong = codex({ known: 'economy.amount(resource: @entry) > 0' });
    expect(only(wrong)).toEqual([
      { code: 'E048', path: '/main/known', message: 'entry holds an item, not a resource' },
    ]);
  });

  it('gives @entry outside a records list’s item and known as E048', () => {
    const loose = { widget: 'text', text: '{inventory.count(item: @entry)}' };
    expect(only(loose)).toEqual([
      {
        code: 'E048',
        path: '/main/text',
        message:
          '{inventory.count(item: @entry)}: @entry is a codex entry’s record: only a records list’s item and known name it',
      },
    ]);
  });

  it('shows nothing of an entry held back: its unknown names no field and no @entry', () => {
    const unknown = { widget: 'text', text: '{.name} {inventory.count(item: @entry)}' };
    expect(only(codex({ unknown })).map((d) => d.message)).toEqual([
      'An entry not yet known shows nothing of its record: {.name} is out of reach here',
      '{inventory.count(item: @entry)}: An entry not yet known shows nothing of its record: @entry is out of reach here',
    ]);
  });

  it('gives a field the record’s type lacks as E048, and takes any for a type whose fields aren’t known', () => {
    const item = { widget: 'text', text: '{.weight}' };
    expect(only(codex({ item }))).toEqual([
      { code: 'E048', path: '/main/item/text', message: 'The item type has no field "weight": id, name, value' },
    ]);
    expect(only(codex({ type: 'odd', known: undefined, item }))).toEqual([]);
  });

  it('refuses an entry’s action in a codex or the credits, which come with none', () => {
    const take = { widget: 'button', label: 'Take', action: { take: 'entry' } };
    expect(only(codex({ item: take }))).toEqual([
      { code: 'E049', path: '/main/item/action/take', message: 'A codex’s entries come with no action' },
    ]);
    expect(only({ widget: 'list', of: 'credits', item: take })).toEqual([
      { code: 'E049', path: '/main/item/action/take', message: 'A credits list’s entries come with no action' },
    ]);
  });
});

describe('the credits and the shell’s buttons (M4.4)', () => {
  it('passes a credits list of its fields, which needs no kit', () => {
    const item = { widget: 'text', text: '{.asset}: {.author}, {.licence} ({.source}, {.tool})' };
    expect(only({ widget: 'list', of: 'credits', item, empty: 'No assets' }, { kits: [] })).toEqual([]);
  });

  it('passes a button to the shell’s title or New game, and nowhere else', () => {
    const go = (shell: string) => ({ widget: 'button', label: 'Go', action: { shell } });
    expect(only({ widget: 'stack', children: [go('title'), go('new')] })).toEqual([]);
    expect(only(go('saves')).map((d) => d.code)).toEqual(['E047']);
  });
});
