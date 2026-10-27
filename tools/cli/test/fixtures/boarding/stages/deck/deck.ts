// Where the deck is in the space (M7.4, D86): its tilemap, the tileset that names its
// characters, its bottom-left corner and its tile's size in art pixels; and a point in art
// pixels as a point on Space-Wrecked's board, in tiles with y down from the top row, as the
// battle map counts them.
import type { Start } from 'eb/stage';
import type { Tilemap, Tileset } from './battle-map.ts';

type Pair = readonly [number, number];

export interface Deck {
  /** The tilemap object's path in the space. */
  readonly path: string;
  readonly tilemap: Tilemap;
  readonly tileset: Tileset | undefined;
  readonly at: Pair;
  readonly tile: Pair;
}

interface SpaceObject {
  readonly id: string;
  readonly at?: readonly number[];
  readonly components?: { readonly tilemap?: Tilemap };
}

/** What the pack says of the space's tilemap, when it packed one: its object, corner and tile. */
interface Packed {
  readonly object?: string;
  readonly at?: Pair;
  readonly tile?: Pair;
}

/** The space's tilemap: the one the pack names, or else the first object with one. */
export function findDeck(start: Start): Deck {
  const packed = start.world.tiles as Packed | undefined;
  const objects = (start.world.space as { objects?: readonly SpaceObject[] }).objects ?? [];
  const object = objects.find((o) => o.id === packed?.object) ?? objects.find((o) => o.components?.tilemap);
  const tilemap = object?.components?.tilemap;
  if (!object || !tilemap) throw new Error('The space has no tilemap for the battle board to draw');
  const tileset = tilemap.tileset
    ? (start.world.records[`tileset:${tilemap.tileset}`] as Tileset | undefined)
    : undefined;
  const at = packed?.at ?? start.places[object.id] ?? [object.at?.[0] ?? 0, object.at?.[1] ?? 0];
  const tile = packed?.tile ?? tileset?.tile ?? [16, 16];
  return { path: object.id, tilemap, tileset, at, tile };
}

/**
 * A point in art pixels as a point on the board. A tile's centre, where stage2d walks a
 * walker's feet, lands on the middle of its tile: (c + 0.5, r + 0.5) less the map's origin.
 */
export function boardPoint(deck: Deck, origin: Pair, [x, y]: Pair): [number, number] {
  const rows = deck.tilemap.size[1];
  return [(x - deck.at[0]) / deck.tile[0] - origin[0], rows - (y - deck.at[1]) / deck.tile[1] - origin[1]];
}
