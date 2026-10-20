/**
 * Where the map widget puts each node (M4.6, docs/specs/maps.md#the-map-widget), as plain
 * functions. A layered map follows the screen: at the phone breakpoint it runs bottom to top in a
 * column that scrolls, so a thumb climbs it; otherwise left to right, fitted. A drawn map puts each
 * node at its place, fitted. Places are fractions of the board. Along the way a layered map runs,
 * and both ways on a drawn map, the board is inset by half a node, so the start and the end, or a
 * place at 0 or 100, sit inside its edge; across a layer, its nodes share the board's width evenly,
 * each no wider than its share, so none touches the next.
 */
import type { Breakpoint } from '../format/screen.ts';
import type { MapView } from '../session/types.ts';

/** Half a node's widest and tallest, in px: an inset axis is inset by these. */
export const HALF_ACROSS = 40;
export const HALF_DOWN = 26;
/** Room between two nodes side by side in a layer, in px. */
const BETWEEN = 6;
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
  /** Each node's place, across and down, from 0 to 1. */
  readonly places: ReadonlyMap<string, readonly [number, number]>;
  /** Whether each axis is inset by half a node: one a layered map runs along, and both of a drawn map's. */
  readonly inset: { readonly across: boolean; readonly down: boolean };
  /** A node's widest, as CSS: across a layer, its share of the board's width, and never over 80 px. */
  readonly nodeWidth: string;
}

const widest = (share: number) => `min(${2 * HALF_ACROSS}px, calc(100% / ${share} - ${BETWEEN}px))`;

type Laid = Pick<MapView, 'shape' | 'layers' | 'nodes'>;

/** Each layer's nodes, by layer. */
function widths(map: Laid): Map<number, number> {
  const out = new Map<number, number>();
  for (const node of map.nodes) out.set(node.layer, Math.max(out.get(node.layer) ?? 0, node.slot + 1));
  return out;
}

/** A layer's place along the map, 0 at the start and 1 at the end. */
const alongMap = (layer: number, layers: number) => (layers <= 1 ? 0.5 : layer / (layers - 1));
/** A slot's place across its layer, its nodes spread evenly about the middle. */
const across = (slot: number, width: number) => (slot + 0.5) / Math.max(width, 1);

export function boardOf(map: Laid, breakpoint: Breakpoint): Board {
  if (map.shape === 'drawn') {
    const places = map.nodes.map((node) => [node.id, [(node.x ?? 50) / 100, (node.y ?? 50) / 100] as const] as const);
    return {
      tall: false,
      ratio: breakpoint === 'phone' ? 1 : 4 / 3,
      places: new Map(places),
      inset: { across: true, down: true },
      nodeWidth: `${2 * HALF_ACROSS}px`,
    };
  }
  const width = widths(map);
  const most = Math.max(1, ...width.values());
  const tall = breakpoint === 'phone';
  const places = map.nodes.map((node) => {
    const a = alongMap(node.layer, map.layers);
    const b = across(node.slot, width.get(node.layer) ?? 1);
    return [node.id, tall ? ([b, 1 - a] as const) : ([a, b] as const)] as const;
  });
  return tall
    ? {
        tall,
        height: map.layers * ROW,
        places: new Map(places),
        inset: { across: false, down: true },
        nodeWidth: widest(most),
      }
    : {
        tall,
        ratio: (map.layers * COLUMN) / (most * ROW),
        places: new Map(places),
        inset: { across: true, down: false },
        nodeWidth: widest(map.layers),
      };
}

/** One axis of a place as CSS: its share of the board, or of what is left inside an inset. */
const axis = (at: number, inset: boolean, half: number) =>
  inset ? `calc(${half}px + (100% - ${2 * half}px) * ${at})` : `${at * 100}%`;

/** A node's place and widest as CSS. */
export const placeStyle = (board: Board, [x, y]: readonly [number, number]) => ({
  left: axis(x, board.inset.across, HALF_ACROSS),
  top: axis(y, board.inset.down, HALF_DOWN),
  maxWidth: board.nodeWidth,
});

/** Where the links' drawing sits: over the board, inset as the nodes' places are. */
export const linksInset = (board: Board): string =>
  `${board.inset.down ? HALF_DOWN : 0}px ${board.inset.across ? HALF_ACROSS : 0}px`;

/** Where a tall board's column scrolls to put a node in its middle, never past either end. */
export function scrollFor(board: Board, node: string, seen: number): number {
  const place = board.places.get(node);
  if (!board.tall || board.height === undefined || place === undefined) return 0;
  const top = board.inset.down ? HALF_DOWN + (board.height - 2 * HALF_DOWN) * place[1] : board.height * place[1];
  return Math.min(Math.max(top - seen / 2, 0), Math.max(board.height - seen, 0));
}

/** What a node's button is called: its name and kind, where the party is, or that it isn't known. */
export function nodeName(node: MapView['nodes'][number], at: string): string {
  const here = node.id === at ? ', you are here' : '';
  if (!node.known) return `Unknown${here}`;
  return `${node.name ?? node.id}${node.kind ? `, ${node.kind}` : ''}${here}`;
}
