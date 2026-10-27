/**
 * What the page and a stage's worker say to each other (M7.4, D86, docs/specs/stages.md#where-it-runs).
 * The page sends the canvas, the stage's files and its start once, then a frame only when the last
 * was answered, so a slow stage drops frames and never queues them. The worker asks the page to decode
 * SVG, which a worker can't.
 */
import type { Drew, Frame, Start } from './api.ts';

export type ToStage =
  | {
      readonly kind: 'start';
      readonly canvas: OffscreenCanvas;
      /** The stage files by path under stages/, compiled, and the entry the space names. */
      readonly files: Readonly<Record<string, string>>;
      readonly entry: string;
      readonly start: Start;
    }
  | { readonly kind: 'frame'; readonly frame: Frame }
  | { readonly kind: 'svg'; readonly id: number; readonly image?: ImageBitmap; readonly error?: string };

export type FromStage =
  | { readonly kind: 'started' }
  | {
      readonly kind: 'drew';
      readonly uses?: Drew['uses'];
      /** How long `frame` took, in milliseconds. */
      readonly ms: number;
    }
  | { readonly kind: 'svg'; readonly id: number; readonly text: string; readonly w: number; readonly h: number }
  | { readonly kind: 'failed'; readonly message: string; readonly file?: string; readonly line?: number };
