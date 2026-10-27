/**
 * A tileset record's own rules (M7.2, D84, docs/specs/tilemaps.md#a-tileset): E092 for no tiles, and for
 * a tile's character that isn't one character, is a space, or is another tile's already; the first
 * tile in the file's order keeps a shared character in the legend.
 */
import { describe, expect, it } from 'vitest';
import { checkTileset, legendOf, type TilesetRecord } from './tilesetTypes.ts';

const said = (tiles: TilesetRecord['tiles']) => {
  const found: [string, string, string][] = [];
  checkTileset({ sheet: 'deck.png', tile: [16, 16], tiles }, (code, path, message) =>
    found.push([code, path, message]),
  );
  return found;
};

describe('a tileset’s tiles (E092)', () => {
  it('are at least one, each written as its own one character', () => {
    expect(said({ floor: { char: '.', frame: 0 }, hull: { char: '%', frame: 1 } })).toEqual([]);
    expect(said({})).toEqual([['E092', '/tiles', 'A tileset has at least one tile']]);
    expect(said({ floor: { char: '..', frame: 0 } })).toEqual([
      ['E092', '/tiles/floor/char', '“..” isn’t one character: a tile is written as one'],
    ]);
    expect(said({ floor: { char: ' ', frame: 0 } })).toEqual([
      ['E092', '/tiles/floor/char', 'A space is no tile: a tile can’t be written as one'],
    ]);
    expect(said({ floor: { char: '.', frame: 0 }, deck: { char: '.', frame: 1 } })).toEqual([
      ['E092', '/tiles/deck/char', '“floor” is written as “.” already'],
    ]);
  });

  it('make a legend from their characters, the first tile keeping one two share', () => {
    const legend = legendOf({ tiles: { floor: { char: '.', frame: 0 }, deck: { char: '.', frame: 1 } } });
    expect([...legend]).toEqual([['.', 'floor']]);
  });
});
