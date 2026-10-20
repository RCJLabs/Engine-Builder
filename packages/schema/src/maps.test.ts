/**
 * The maps kit's types and checks (M4.6, docs/specs/maps.md#checks): the type files, a cost
 * naming resources only with the economy kit on; a sound sector and valley clean; E035 at each
 * rule's place; E053; W119 and W120; W135 with its first seed; W136.
 */
import { describe, expect, it } from 'vitest';
import type { Diagnostic } from './diagnostics.ts';
import { kitTypeFiles } from './kitTypes.ts';
import { readTypeFile } from './typeFile.ts';
import { type RecordInput, type ValidateOptions, validateRecords } from './validate.ts';

const ON = ['inventory', 'economy', 'time', 'maps'];
const record = (type: string, id: string, value: unknown): RecordInput => ({
  type,
  id,
  file: `records/${type}/${id}.json`,
  value,
});
const codes = (diagnostics: readonly Diagnostic[]) => diagnostics.map(({ code, id, path }) => `${code} ${id} ${path}`);
const check = (records: RecordInput[], options: ValidateOptions = { kits: ON }) =>
  codes(validateRecords([], records, options).diagnostics);
const messages = (records: RecordInput[]) =>
  validateRecords([], records, { kits: ON }).diagnostics.map((d) => `${d.code} ${d.message}`);

const LAYERS = {
  count: 7,
  widths: { min: 2, max: 3 },
  start: 'way-in',
  end: 'jump-point',
  links: 'both',
  extra: 35,
  place: [
    { kind: 'station', min: 2, max: 2, apart: true },
    { kind: 'nebula', min: 1, max: 1, apart: true },
  ],
  mix: [
    { kind: 'empty', weight: 2 },
    { kind: 'hostile', weight: 1 },
  ],
};
const MOVES = [
  { id: 'jump', label: 'Jump', cost: { supplies: 1 } },
  { id: 'long', label: 'Long jump', reach: 2, cost: { supplies: 3 } },
];
const VALLEY = {
  name: 'The valley',
  start: 'van',
  nodes: [
    { id: 'van', kind: 'empty', x: 10, y: 80 },
    { id: 'town', kind: 'station', x: 50, y: 50 },
  ],
  roads: [{ from: 'van', to: 'town', takes: { days: 1 }, cost: { supplies: 1 } }],
  moves: [{ id: 'drive', label: 'Drive' }],
};
const KINDS = ['way-in', 'jump-point', 'station', 'nebula', 'empty', 'hostile'].map((id) =>
  record('node-kind', id, {
    name: id,
    ...(id === 'jump-point' ? { arrive: [{ effect: 'enter-map', map: 'valley', at: 'town' }] } : {}),
  }),
);
const BASE = [record('resource', 'supplies', { start: 10 }), ...KINDS];
const withSector = (changes: object, valley: object = VALLEY) => [
  ...BASE,
  record('map', 'sector', { name: 'The Shoals', layers: LAYERS, moves: MOVES, ...changes }),
  record('map', 'valley', valley),
];
const layered = (changes: object) => withSector({ layers: { ...LAYERS, ...changes } });

describe('the maps kit’s types', () => {
  it('are type files, a cost naming resources only with the economy kit on', () => {
    const files = kitTypeFiles(ON);
    for (const type of ['node-kind', 'map']) expect(readTypeFile(files.get(type)).ok, type).toBe(true);
    const costOf = (on: string[]) => {
      const moves = kitTypeFiles(on).get('map')?.fields.moves;
      return moves?.kind === 'list' && moves.of.kind === 'group' ? moves.of.fields.cost : undefined;
    };
    expect(costOf(ON)).toMatchObject({ kind: 'map', key: { kind: 'ref', to: 'resource' } });
    expect(costOf(['maps'])).not.toHaveProperty('key');
    expect(kitTypeFiles(['inventory']).has('map')).toBe(false);
  });

  it('check a sound sector and valley clean', () => {
    expect(check(withSector({}))).toEqual([]);
  });
});

describe('E035: a map that doesn’t hold together', () => {
  it('is both layered and drawn, or neither', () => {
    expect(check(withSector({ nodes: VALLEY.nodes, start: 'van' }))).toEqual(['E035 sector ']);
    expect(check(withSector({ layers: undefined }))).toEqual(['E035 sector ']);
  });

  it('has widths backwards, a rule’s layers past the end or backwards, or a count that can’t fit', () => {
    expect(check(layered({ widths: { min: 3, max: 2 } }))).toEqual(['E035 sector /layers/widths/max']);
    expect(check(layered({ place: [{ kind: 'station', min: 1, max: 1, from: 6 }] }))).toEqual([
      'E035 sector /layers/place/0/from',
    ]);
    expect(check(layered({ place: [{ kind: 'station', min: 1, max: 1, from: 4, to: 2 }] }))).toEqual([
      'E035 sector /layers/place/0/to',
    ]);
    expect(check(layered({ place: [{ kind: 'station', min: 3, max: 1 }] }))).toEqual([
      'E035 sector /layers/place/0/max',
    ]);
    expect(check(layered({ place: [{ kind: 'station', min: 6, max: 6, apart: true }] }))).toEqual([
      'E035 sector /layers/place/0/min',
    ]);
  });

  it('leaves a layer no kind in the mix can be in', () => {
    expect(check(layered({ mix: [{ kind: 'empty', weight: 1, to: 3 }] }))).toEqual(['E035 sector /layers/mix']);
  });

  it('names a drawn node twice, a road to a node it lacks, no start, or one it lacks', () => {
    const twice = { ...VALLEY, nodes: [...VALLEY.nodes, { id: 'van', kind: 'empty', x: 0, y: 0 }] };
    expect(check(withSector({}, twice))).toEqual(['E035 valley /nodes/2/id']);
    const lost = { ...VALLEY, roads: [...VALLEY.roads, { from: 'town', to: 'crag' }] };
    expect(check(withSector({}, lost))).toEqual(['E035 valley /roads/1/to']);
    expect(check(withSector({}, { ...VALLEY, start: 'crag' }))).toEqual(['E035 valley /start']);
    const { start: _, ...noStart } = VALLEY;
    expect(check(withSector({}, noStart))).toEqual(['E035 valley /start']);
  });

  it('has two moves of one id, or a reach on a drawn map', () => {
    expect(check(withSector({ moves: [MOVES[0], { ...MOVES[1], id: 'jump' }] }))).toEqual(['E035 sector /moves/1/id']);
    expect(check(withSector({}, { ...VALLEY, moves: [{ id: 'drive', label: 'Drive', reach: 1 }] }))).toEqual([
      'E035 valley /moves/0/reach',
    ]);
  });
});

describe('the other checks', () => {
  it('E053: enter-map at a node its map lacks, or at any node of a layered map', () => {
    const at = (effect: object) => [
      ...withSector({}),
      record('node-kind', 'gate', { name: 'Gate', arrive: [{ effect: 'enter-map', ...effect }] }),
    ];
    expect(check(at({ map: 'valley', at: 'crag' }))).toEqual(['E053 gate /arrive/0/at']);
    expect(check(at({ map: 'sector', at: 'n0-0' }))).toEqual(['E053 gate /arrive/0/at']);
  });

  it('W119 and W120: a cost without the economy kit, a time without the time kit', () => {
    const records = withSector({}).filter((r) => r.type !== 'resource');
    expect(check(records, { kits: ['maps'] })).toEqual([
      'W119 sector /moves/0/cost',
      'W119 sector /moves/1/cost',
      'W119 valley /roads/0/cost',
      'W120 valley /roads/0/takes',
    ]);
  });

  it('W135: a rule some of 300 seeds don’t keep, with the first that doesn’t', () => {
    // Six stations in five layers of one or two: only a map whose layers all roll one can't hold them.
    const tight = layered({ widths: { min: 1, max: 2 }, place: [{ kind: 'station', min: 6, max: 6 }] });
    expect(check(tight)).toEqual(['W135 sector /layers/place/0']);
    expect(messages(tight)[0]).toMatch(/^W135 Kept in \d+ of 300 seeds: seed \d+ makes 5 station$/);
  });

  it('W136: a drawn node no road reaches, one-way roads read their way', () => {
    const island = { ...VALLEY, nodes: [...VALLEY.nodes, { id: 'crag', kind: 'empty', x: 90, y: 10 }] };
    expect(check(withSector({}, island))).toEqual(['W136 valley /nodes/2']);
    const backwards = { ...island, roads: [...VALLEY.roads, { from: 'crag', to: 'town', 'one-way': true }] };
    expect(check(withSector({}, backwards))).toEqual(['W136 valley /nodes/2']);
    const onward = { ...island, roads: [...VALLEY.roads, { from: 'town', to: 'crag', 'one-way': true }] };
    expect(check(withSector({}, onward))).toEqual([]);
  });
});
