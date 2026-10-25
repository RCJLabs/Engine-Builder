/**
 * The bake worker's messages (M6.2, D74): a space's solids and ground baked into a navmesh, or a
 * navmesh looked at as triangles for Show navigation. `nav` is where nav.js is, which the worker runs.
 */
import type { NavSolid } from '@eb/compiler';
import type { Ground } from '../walk/physics.ts';

export interface NavLook {
  readonly positions: number[];
  readonly indices: number[];
  readonly tiles: number;
  readonly polygons: number;
}

export type NavRequest =
  | {
      readonly id: number;
      readonly kind: 'bake';
      readonly nav: string;
      readonly solids: NavSolid[];
      readonly ground: Ground | null;
    }
  | { readonly id: number; readonly kind: 'look'; readonly nav: string; readonly navmesh: Uint8Array };

export type NavReply =
  | {
      readonly id: number;
      readonly ok: true;
      readonly kind: 'bake';
      readonly navmesh: Uint8Array;
      readonly tiled: boolean;
      readonly ms: number;
      readonly triangles: number;
      readonly look: NavLook;
    }
  | { readonly id: number; readonly ok: true; readonly kind: 'look'; readonly look: NavLook }
  | { readonly id: number; readonly ok: false; readonly error: string };
