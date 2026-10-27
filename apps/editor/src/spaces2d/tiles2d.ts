/**
 * What the Tiles row and the 2D view share while a tilemap is chosen (M7.2, D84,
 * docs/specs/tilemaps.md#the-editor): the tool a press uses (paint, erase, edges, or none, when a
 * press chooses and pans as before), the layer painted, the tile painted with, the edge kind set, and
 * whether the rules are shown over the map. Small, so it rides with the Scene panel.
 */
import type { EdgeKind } from '@eb/core';
import { signal } from '@preact/signals';

export type TileTool = 'paint' | 'erase' | 'edges' | null;

export const tileTool = signal<TileTool>(null);
export const tileLayer = signal(0);
/** The character of the tile Paint lays, or null before one is chosen. */
export const tileChar = signal<string | null>(null);
/** The edge kind Edges sets; null clears the edge. */
export const edgeKind = signal<EdgeKind | null>('wall');
export const showRules = signal(false);
