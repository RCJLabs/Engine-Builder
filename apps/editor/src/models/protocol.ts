/**
 * What the page and the model worker say to each other (M5.5, D67): a model packed as import
 * brings it in, and a collider fitted to a model's file. The packed file comes back transferred.
 */
import type { ColliderShape, ModelCollider } from '@eb/schema';

export interface PickedFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** A model's file and, for a .gltf, the files it names. */
interface ModelFiles {
  readonly id: number;
  readonly main: PickedFile;
  readonly beside: readonly PickedFile[];
}

export type ModelRequest =
  | (ModelFiles & { readonly kind: 'pack' })
  | (ModelFiles & { readonly kind: 'fit'; readonly shape: ColliderShape });

export interface Packed {
  readonly glb: Uint8Array;
  /** Triangles it draws, for LOD's default and the import's report. */
  readonly triangles: number;
  /** Its materials' slot names, in order. */
  readonly slots: readonly string[];
  /** A box fitted to it, as the model record starts with. */
  readonly collider: ModelCollider;
  /** How long the packing took, in milliseconds: a reading. */
  readonly ms: number;
}

export type ModelReply =
  | { readonly id: number; readonly ok: true; readonly packed: Packed }
  | { readonly id: number; readonly ok: true; readonly collider: ModelCollider }
  | { readonly id: number; readonly ok: false; readonly error: string };
