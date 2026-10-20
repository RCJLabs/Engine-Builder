/**
 * Where the map widget puts each node (M4.6, docs/specs/maps.md#the-map-widget), as plain
 * functions. A layered map follows the screen: at the phone breakpoint it runs bottom to top in a
 * column that scrolls, so a thumb climbs it; otherwise left to right, fitted. A drawn map puts each
 * node at its place, fitted. Places are fractions of the board's inner box, which is inset by half
 * a node each way so no node hangs over the board's edge.
 */
import type { Breakpoint } from '../format/screen.ts';
import type { MapView } from '../session/types.ts';

/** Half a node's box, in px: the board's inner box is inset by these. */
export const HALF_ACROSS = 40;
export const HALF_DOWN = 26;
/** A layer's room, in px: a row when the map runs up the screen, a column when it runs across. */
export const ROW = 76;
export const COLUMN = 100;

export interface Board {
  /** It runs bottom to top in a column that scrolls: a layered map at the phone breakpoint. */
  readonly tall: boolean;
  /** Its height in px when tall. */
  readonly height?: number;
  /** Its width over its height when fitted. */
  readonly ratio?: number;
  /** Each node's place, across and down, from 0 to 1 of the inner box. */
  readonly places: ReadonlyMap<string, readonly [number, number]>;
}

type Laid = Pick<MapView, 'shape' | 'layers' | 'nodes'>;

/** Each layer's nodes, by layer. */
function widths(map: Laid): Map<number, number> {
  const out = new Map<number, number>();
  for (const node of map.nodes) out.set(node.layer, Math.max(out.get(node.layer) ?? 0, node.slot + 1));
  return out;
}

/** A layer's place along the map, 0 at the start and 1 at the end. */
const along = (layer: number, layers: number) => (layers <= 1 ? 0.5 : layer / (layers - 1));
/** A slot's place across its layer, its nodes spread evenly about the middle. */
const across = (slot: number, width: number) => (slot + 0.5) / Math.max(width, 1);

export function boardOf(map: Laid, breakpoint: Breakpoint): Board {
  if (map.shape === 'drawn') {
    const places = map.nodes.map((node) => [node.id, [(node.x ?? 50) / 100, (node.y ?? 50) / 100] as const] as const);
    return { tall: false, ratio: breakpoint === 'phone' ? 1 : 4 / 3, places: new Map(places) };
  }
  const width = widths(map);
  const most = Math.max(1, ...width.values());
  const tall = breakpoint === 'phone';
  const places = map.nodes.map((node) => {
    const a = along(node.layer, map.layers);
    const b = across(node.slot, width.get(node.layer) ?? 1);
    return [node.id, tall ? ([b, 1 - a] as const) : ([a, b] as const)] as const;
  });
  return tall
    ? { tall, height: map.layers * ROW, places: new Map(places) }
    : { tall, ratio: (map.layers * COLUMN) / (most * ROW), places: new Map(places) };
}

/** A place as CSS: the inner box's inset plus its share of what is left. */
export const placeStyle = ([x, y]: readonly [number, number]) => ({
  left: `calc(${HALF_ACROSS}px + (100% - ${2 * HALF_ACROSS}px) * ${x})`,
  top: `calc(${HALF_DOWN}px + (100% - ${2 * HALF_DOWN}px) * ${y})`,
});

/** Where a tall board's column scrolls to put a node in its middle, never past either end. */
export function scrollFor(board: Board, node: string, seen: number): number {
  const place = board.places.get(node);
  if (!board.tall || board.height === undefined || place === undefined) return 0;
  const top = HALF_DOWN + (board.height - 2 * HALF_DOWN) * place[1];
  return Math.min(Math.max(top - seen / 2, 0), Math.max(board.height - seen, 0));
}

/** What a node's button is called: its name and kind, where the party is, or that it isn't known. */
export function nodeName(node: MapView['nodes'][number], at: string): string {
  const here = node.id === at ? ', you are here' : '';
  if (!node.known) return `Unknown${here}`;
  return `${node.name ?? node.id}${node.kind ? `, ${node.kind}` : ''}${here}`;
}
