/**
 * window.__ebView2d (M7.1, D83): what the Scene panel's 2D view drew, for the e2e to read as it
 * reads window.__ebViewport: the space, the zoom, the view's middle in world art pixels, the space's
 * size, each item as drawn with its box on the page, and the chosen. Read only. Since M7.2 the
 * tilemap chosen alone: its tileset, size, layers and edges as its file holds them; since M7.3 the
 * building chosen alone, as its file holds it.
 */
import type { BuildingFields, TilemapFields } from '@eb/compiler';
import type { Point } from '../stage2d/camera.ts';
import type { Rect } from '../stage2d/place.ts';

export interface View2dHook {
  readonly space: string;
  zoom(): number;
  centre(): Point;
  size(): Point;
  /** Each item in draw order: its sprite, clip and frame, its world place, and its box on the page in CSS pixels. */
  drawn(): readonly { path: string; sprite?: string; clip?: string; at: Point; page: Rect }[];
  picked(): readonly string[];
  /** Times drawn, so a test can wait for the next. */
  frames(): number;
  tilemap(): (TilemapFields & { readonly id: string }) | undefined;
  building(): (BuildingFields & { readonly id: string }) | undefined;
}

declare global {
  interface Window {
    __ebView2d?: View2dHook;
  }
}

export function publishView2d(hook: View2dHook): () => void {
  window.__ebView2d = hook;
  return () => {
    if (window.__ebView2d === hook) delete window.__ebView2d;
  };
}
