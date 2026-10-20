/**
 * Where the map widget puts each node (M4.6, docs/specs/maps.md#the-map-widget): a layered map up
 * a phone's column and across anything wider, a drawn map at its places, the column scrolled to
 * the party, and a node's name as a screen reader hears it.
 */
import { describe, expect, it } from 'vitest';
import type { MapNode, MapView } from '../session/types.ts';
import { boardOf, COLUMN, HALF_DOWN, linksInset, nodeName, placeStyle, ROW, scrollFor } from './mapLayout.ts';

const node = (id: string, layer: number, slot: number, more: Partial<MapNode> = {}): MapNode => ({
  id,
  layer,
  slot,
  known: true,
  visited: false,
  name: id,
  kind: null,
  description: null,
  travels: [],
  ...more,
});
// Five layers: one, two, three, two, one.
const layered: MapView = {
  map: 'sector',
  name: 'Sector',
  shape: 'layered',
  layers: 5,
  at: 'n0-0',
  nodes: [
    node('n0-0', 0, 0),
    node('n1-0', 1, 0),
    node('n1-1', 1, 1),
    node('n2-0', 2, 0),
    node('n2-1', 2, 1),
    node('n2-2', 2, 2),
    node('n3-0', 3, 0),
    node('n3-1', 3, 1),
    node('n4-0', 4, 0),
  ],
  links: [],
};

describe('a layered map', () => {
  it('runs bottom to top in a column on a phone, the start at the bottom and a layer’s nodes spread', () => {
    const board = boardOf(layered, 'phone');
    expect(board).toMatchObject({ tall: true, height: 5 * ROW });
    expect(board.places.get('n0-0')).toEqual([0.5, 1]);
    expect(board.places.get('n4-0')).toEqual([0.5, 0]);
    expect(board.places.get('n2-0')).toEqual([1 / 6, 0.5]);
    expect(board.places.get('n2-2')).toEqual([5 / 6, 0.5]);
  });

  it('runs left to right, fitted, on anything wider', () => {
    for (const breakpoint of ['landscape', 'tablet', 'desktop'] as const) {
      const board = boardOf(layered, breakpoint);
      expect(board).toMatchObject({ tall: false, ratio: (5 * COLUMN) / (3 * ROW) });
      expect(board.places.get('n0-0')).toEqual([0, 0.5]);
      expect(board.places.get('n4-0')).toEqual([1, 0.5]);
      expect(board.places.get('n1-1')).toEqual([0.25, 0.75]);
    }
  });

  it('scrolls the column to put the party in the middle, never past either end', () => {
    const board = boardOf(layered, 'phone');
    const middle = HALF_DOWN + (5 * ROW - 2 * HALF_DOWN) * 0.5;
    expect(scrollFor(board, 'n2-1', 200)).toBe(middle - 100);
    expect(scrollFor(board, 'n0-0', 200)).toBe(5 * ROW - 200);
    expect(scrollFor(board, 'n4-0', 200)).toBe(0);
    expect(scrollFor(boardOf(layered, 'desktop'), 'n2-1', 200)).toBe(0);
  });
});

describe('a drawn map', () => {
  it('puts each node at its place, fitted, square on a phone', () => {
    const drawn: MapView = { ...layered, shape: 'drawn', layers: 1, nodes: [node('van', 0, 0, { x: 10, y: 80 })] };
    expect(boardOf(drawn, 'phone')).toMatchObject({ tall: false, ratio: 1 });
    expect(boardOf(drawn, 'desktop').ratio).toBeCloseTo(4 / 3);
    expect(boardOf(drawn, 'desktop').places.get('van')).toEqual([0.1, 0.8]);
  });
});

describe('a node', () => {
  it('sits inside the board’s inset along the map, and at its share of the width across its layer, no wider', () => {
    const tall = boardOf(layered, 'phone');
    expect(placeStyle(tall, [0.25, 1])).toEqual({
      left: '25%',
      top: 'calc(26px + (100% - 52px) * 1)',
      maxWidth: 'min(80px, calc(100% / 3 - 6px))',
    });
    expect(linksInset(tall)).toBe('26px 0px');
    const wide = boardOf(layered, 'desktop');
    expect(placeStyle(wide, [0, 0.5])).toEqual({
      left: 'calc(40px + (100% - 80px) * 0)',
      top: '50%',
      maxWidth: 'min(80px, calc(100% / 5 - 6px))',
    });
    expect(linksInset(wide)).toBe('0px 40px');
    const drawn = boardOf({ ...layered, shape: 'drawn', nodes: [node('van', 0, 0, { x: 0, y: 100 })] }, 'desktop');
    expect(placeStyle(drawn, [0, 1])).toEqual({
      left: 'calc(40px + (100% - 80px) * 0)',
      top: 'calc(26px + (100% - 52px) * 1)',
      maxWidth: '80px',
    });
    expect(linksInset(drawn)).toBe('26px 40px');
  });

  it('is called by its name and kind, where the party is, or Unknown', () => {
    expect(nodeName(node('n1-0', 1, 0, { name: 'Mac’s Pumps', kind: 'Station' }), 'n0-0')).toBe('Mac’s Pumps, Station');
    expect(nodeName(node('n0-0', 0, 0, { name: 'Way in', kind: 'Way in' }), 'n0-0')).toBe(
      'Way in, Way in, you are here',
    );
    expect(nodeName(node('n2-0', 2, 0, { known: false, name: null }), 'n0-0')).toBe('Unknown');
  });
});
