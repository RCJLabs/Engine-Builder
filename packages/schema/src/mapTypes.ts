/**
 * The maps kit's record types (M4.6, D56, docs/specs/maps.md#records), as type files: a node kind,
 * and a map, either layered (its rules) or drawn (its nodes and roads). A drawn map's node ids,
 * its roads' ends and its start are text: that each names a node the map has is E035's. A cost
 * names resources with the economy kit on; without it a cost is W119, as a choice's is.
 */
import { NODE_KIND, RESOURCE } from '@eb/kits';
import type { FieldDef, TypeFile } from './typeFile.ts';

/** A map's most layers, the start's and the end's among them, and a layer's most nodes. */
export const MOST_LAYERS = 12;
export const MOST_WIDTH = 4;
const WEIGHT = 1000;

const KIND: FieldDef = { kind: 'ref', to: NODE_KIND, label: 'Kind' };
const layerField = (label: string, description: string): FieldDef => ({
  kind: 'int',
  min: 1,
  max: MOST_LAYERS - 2,
  optional: true,
  label,
  description,
});
const FROM = layerField(
  'From layer',
  'The first layer it can be in, counting the start’s as 0: the first after the start when left out',
);
const TO = layerField('To layer', 'The last layer it can be in: the last before the end when left out');

const cost = (economy: boolean): FieldDef => ({
  kind: 'map',
  ...(economy ? { key: { kind: 'ref', to: RESOURCE } } : {}),
  of: { kind: 'int', min: 1 },
  optional: true,
  label: 'Cost',
  description: 'Paid as the party sets off; while it is short, the move is shown locked',
});

const TAKES: FieldDef = {
  kind: 'map',
  of: { kind: 'int', min: 0 },
  optional: true,
  label: 'Takes',
  description: 'How long, in the calendar’s units: days, or hours if it has them',
};

export const NODE_KIND_TYPE_FILE: TypeFile = {
  title: 'Node kind',
  description: 'What a node on a map is: a station, a camp, a crag. Arriving at one runs its effects.',
  nameField: 'name',
  fields: {
    name: { kind: 'text', min: 1, label: 'Name' },
    description: {
      kind: 'text',
      multiline: true,
      optional: true,
      label: 'Description',
      description: 'What the map says of a node of this kind once it is known',
    },
    names: {
      kind: 'list',
      min: 1,
      optional: true,
      of: { kind: 'text', min: 1 },
      label: 'Names',
      description: 'Given to nodes of this kind in a made map, shuffled, none twice; then the kind’s name, numbered',
    },
    charted: {
      kind: 'bool',
      optional: true,
      label: 'Charted',
      description: 'Known from the moment the map is entered',
    },
    arrive: { kind: 'effects', optional: true, label: 'Arrive', description: 'What arriving at one does' },
  },
};

const LAYERS: FieldDef = {
  kind: 'group',
  optional: true,
  label: 'Layers',
  description: 'A layered map, made from a seed by these rules each time it is entered. Give this, or Nodes and Roads',
  fields: {
    count: {
      kind: 'int',
      min: 3,
      max: MOST_LAYERS,
      label: 'Layers',
      description: 'From the start to the end, both among them',
    },
    widths: {
      kind: 'group',
      label: 'Nodes in a layer',
      description: 'In each layer between the start and the end',
      fields: {
        min: { kind: 'int', min: 1, max: MOST_WIDTH, label: 'At least' },
        max: { kind: 'int', min: 1, max: MOST_WIDTH, label: 'At most' },
      },
    },
    start: { ...KIND, label: 'Start', description: 'The first layer’s node' },
    end: { ...KIND, label: 'End', description: 'The last layer’s node: an exit, or a boss' },
    links: {
      kind: 'enum',
      values: ['both', 'forward'],
      label: 'Links go',
      description: 'Both ways, or only towards the end',
    },
    extra: {
      kind: 'int',
      min: 0,
      max: 100,
      optional: true,
      label: 'Extra link',
      description: 'The chance, in percent, of one more link between each pair of layers, crossing none',
    },
    place: {
      kind: 'list',
      min: 1,
      optional: true,
      label: 'Placed first',
      description: 'Kinds placed by count before the rest is rolled, in this order',
      of: {
        kind: 'group',
        fields: {
          kind: KIND,
          min: { kind: 'int', min: 0, max: (MOST_LAYERS - 2) * MOST_WIDTH, label: 'At least' },
          max: { kind: 'int', min: 0, max: (MOST_LAYERS - 2) * MOST_WIDTH, label: 'At most' },
          from: FROM,
          to: TO,
          apart: { kind: 'bool', optional: true, label: 'Apart', description: 'None two in a layer' },
          avoidable: {
            kind: 'bool',
            optional: true,
            label: 'Avoidable',
            description: 'Never the only way on from a node of the layer before',
          },
        },
      },
    },
    mix: {
      kind: 'list',
      min: 1,
      label: 'Mix',
      description: 'The kinds every other node is rolled from, by weight',
      of: {
        kind: 'group',
        fields: {
          kind: KIND,
          weight: { kind: 'int', min: 1, max: WEIGHT, label: 'Weight' },
          from: FROM,
          to: TO,
        },
      },
    },
  },
};

const nodes: FieldDef = {
  kind: 'list',
  min: 1,
  optional: true,
  label: 'Nodes',
  description: 'A drawn map’s nodes, placed by hand',
  of: {
    kind: 'group',
    fields: {
      id: { kind: 'text', min: 1, label: 'Id', description: 'What roads and conditions call it: once in the map' },
      name: { kind: 'text', min: 1, optional: true, label: 'Name', description: 'The kind’s name when left out' },
      kind: KIND,
      x: { kind: 'int', min: 0, max: 100, label: 'Across', description: 'From the left, 0 to 100' },
      y: { kind: 'int', min: 0, max: 100, label: 'Down', description: 'From the top, 0 to 100' },
      arrive: {
        kind: 'effects',
        optional: true,
        label: 'Arrive',
        description: 'What arriving here does, after its kind’s',
      },
    },
  },
};

const roads = (economy: boolean): FieldDef => ({
  kind: 'list',
  min: 1,
  optional: true,
  label: 'Roads',
  description: 'A drawn map’s links: a move follows the quickest, by time, then cost',
  of: {
    kind: 'group',
    fields: {
      from: { kind: 'text', min: 1, label: 'From', description: 'A node’s id' },
      to: { kind: 'text', min: 1, label: 'To', description: 'A node’s id' },
      takes: TAKES,
      cost: { ...cost(economy), description: 'Paid by a move that takes this road' },
      'one-way': { kind: 'bool', optional: true, label: 'One way', description: 'Only from From to To' },
    },
  },
});

const moves = (economy: boolean): FieldDef => ({
  kind: 'list',
  min: 1,
  label: 'Moves',
  description: 'The ways to travel, each offered to every node it reaches',
  of: {
    kind: 'group',
    fields: {
      id: { kind: 'text', min: 1, label: 'Id', description: 'Once in the map' },
      label: { kind: 'text', min: 1, label: 'Label', description: 'Its button’s words: “Jump”' },
      reach: {
        kind: 'int',
        min: 1,
        max: 3,
        optional: true,
        label: 'Reach',
        description: 'On a layered map, how many links away: 1 when left out. A drawn map’s moves follow roads',
      },
      cost: cost(economy),
      takes: TAKES,
      effects: { kind: 'effects', optional: true, label: 'Effects', description: 'What setting off does' },
      if: { kind: 'condition', optional: true, label: 'If', description: 'Offered only while this is true' },
    },
  },
});

export function mapTypeFile(economy: boolean): TypeFile {
  return {
    title: 'Map',
    description: 'Where the party travels: layered and made from a seed, or drawn by hand with roads.',
    nameField: 'name',
    fields: {
      name: { kind: 'text', min: 1, label: 'Name' },
      description: { kind: 'text', multiline: true, optional: true, label: 'Description' },
      layers: LAYERS,
      nodes,
      roads: roads(economy),
      start: { kind: 'text', min: 1, optional: true, label: 'Start', description: 'A drawn map’s first node' },
      moves: moves(economy),
      reveal: {
        kind: 'int',
        min: 0,
        max: 3,
        optional: true,
        label: 'Sight',
        description: 'How many links from where the party has stood are known: 1 when left out',
      },
    },
  };
}
