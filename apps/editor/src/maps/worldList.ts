/**
 * What the World panel lists (M4.6, D56, docs/specs/maps.md#the-editor), as plain functions: each
 * map with its shape and size, each node kind, and what a new layered or drawn map starts as.
 */

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface MapRow {
  readonly id: string;
  readonly name: string | undefined;
  readonly shape: 'layered' | 'drawn' | undefined;
  /** "7 layers", "5 nodes, 6 roads". */
  readonly size: string;
}

/** A map's row: layered with its layers, drawn with its nodes and roads, or neither yet. */
export function mapRow(id: string, value: unknown): MapRow {
  const map = isObject(value) ? value : {};
  const name = typeof map.name === 'string' && map.name !== '' ? map.name : undefined;
  if (isObject(map.layers)) {
    const layers = typeof map.layers.count === 'number' ? count(map.layers.count, 'layer') : 'layers to set';
    return { id, name, shape: 'layered', size: layers };
  }
  if (Array.isArray(map.nodes) || Array.isArray(map.roads)) {
    const nodes = Array.isArray(map.nodes) ? map.nodes.length : 0;
    const roads = Array.isArray(map.roads) ? map.roads.length : 0;
    return { id, name, shape: 'drawn', size: `${count(nodes, 'node')}, ${count(roads, 'road')}` };
  }
  return { id, name, shape: undefined, size: 'Neither layered nor drawn yet' };
}

/** A new layered map's rules: five layers of one to three, every node of the first kind, one move. */
export function newLayeredMap(kinds: readonly string[]): Record<string, unknown> {
  const kind = kinds[0] ?? '';
  return {
    layers: {
      count: 5,
      widths: { min: 1, max: 3 },
      start: kind,
      end: kind,
      links: 'both',
      mix: [{ kind, weight: 1 }],
    },
    moves: [{ id: 'go', label: 'Go' }],
  };
}

/** A new drawn map: a start and an end of the first kind, a road between, one move. */
export function newDrawnMap(kinds: readonly string[]): Record<string, unknown> {
  const kind = kinds[0] ?? '';
  return {
    nodes: [
      { id: 'start', kind, x: 20, y: 80 },
      { id: 'end', kind, x: 80, y: 20 },
    ],
    roads: [{ from: 'start', to: 'end' }],
    start: 'start',
    moves: [{ id: 'go', label: 'Go' }],
  };
}
