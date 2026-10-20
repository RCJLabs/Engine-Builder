/** The maps kit's facts (M4.6, docs/specs/maps.md#facts), each in words for the sheets and the lint. */
import type { FactTest, ModuleDef } from '@eb/core';
import { kindRecord, mapRecord } from './records.ts';
import { MAP, type MapsSlice, NODE_KIND } from './types.ts';

type Def = ModuleDef<MapsSlice>;

const KIND_ARG = { kind: { type: 'ref', to: NODE_KIND } } as const;
const COUNT = { type: 'int', min: 0 } as const;
const BOOL = { type: 'bool' } as const;

const arg = (test: FactTest, key: string) => String(test.args?.[key]);
const holds = (words: (test: FactTest) => string) => (test: FactTest) =>
  test.op === undefined ? words(test) : undefined;

/** The kind of the node the party stands on, if it stands on one. */
function kindHere(state: Readonly<MapsSlice>): string | undefined {
  return state.made?.nodes.find((node) => node.id === state.at)?.kind;
}

export const facts: Def['facts'] = {
  on: {
    args: { map: { type: 'ref', to: MAP } },
    domain: BOOL,
    label: 'on the map',
    describe: holds((test) => `the party is on ${arg(test, 'map')}`),
    read: ({ state, content }, { map }) => {
      mapRecord(content, map);
      return state.made?.map === map;
    },
  },
  at: {
    args: KIND_ARG,
    domain: BOOL,
    label: 'at a node of the kind',
    describe: holds((test) => `the party is at a ${arg(test, 'kind')}`),
    read: ({ state, content }, { kind }) => {
      kindRecord(content, kind);
      return kindHere(state as MapsSlice) === kind;
    },
  },
  'at-end': {
    domain: BOOL,
    label: 'at the map’s end',
    describe: holds(() => 'the party is at the map’s end'),
    read: ({ state }) => state.at !== undefined && state.at === state.made?.end,
  },
  layer: {
    domain: COUNT,
    label: 'the party’s layer',
    read: ({ state }) => state.made?.nodes.find((node) => node.id === state.at)?.layer ?? 0,
  },
  entered: { domain: COUNT, label: 'maps entered', read: ({ state }) => state.entered },
  visited: {
    args: KIND_ARG,
    domain: COUNT,
    label: 'nodes of the kind visited',
    read: ({ state, content }, { kind }) => {
      kindRecord(content, kind);
      return (state.made?.nodes ?? []).filter((node) => node.kind === kind && state.visited.includes(node.id)).length;
    },
  },
};
