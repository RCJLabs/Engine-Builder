/**
 * What `"eb/stage"` gives a stage (M7.4, D86, docs/specs/stages.md#the-api): `defineStage`, `svg`,
 * and the shapes of what a stage is handed and returns. The worker answers `require("eb/stage")`
 * with STAGE_API's values; these types are what the editor's completion and the docs describe.
 */

/** Two numbers: art pixels, or CSS pixels, as each field says. */
export type Pair = readonly [number, number];

/** Once, before the first frame. */
export interface Start {
  /** The space's id. */
  readonly space: string;
  /** The space's size in art pixels. */
  readonly size: Pair;
  /** The pack's world as stage2d reads it, as JSON: the space, its prefabs, the records, its tiles and building and uses. */
  readonly world: StageWorld;
  /** Each object's place in art pixels, by path, through prefabs. */
  readonly places: Readonly<Record<string, Pair>>;
  /** The sheets the space's sprites and tilesets draw from, by asset path. */
  readonly sheets: Readonly<Record<string, ImageBitmap>>;
}

export interface StageWorld {
  readonly space: unknown;
  readonly prefabs: Readonly<Record<string, unknown>>;
  readonly records: Readonly<Record<string, unknown>>;
  readonly tiles?: unknown;
  readonly building?: unknown;
  readonly uses: Readonly<Record<string, { readonly label: string }>>;
}

/** A walker as stage2d walks it: `at` in art pixels, facing right (1) or left (-1). */
export interface StageWalker {
  readonly actor: string;
  readonly at: Pair;
  readonly facing: 1 | -1;
  readonly moving: boolean;
}

/** What the player did since the last frame, in the order it happened. CSS pixels; angles in radians. */
export type StageInput =
  | { readonly kind: 'drag'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'twist'; readonly angle: number; readonly scale: number }
  | { readonly kind: 'wheel'; readonly dy: number }
  | { readonly kind: 'key'; readonly key: string; readonly down: boolean }
  | { readonly kind: 'tap'; readonly x: number; readonly y: number };

/** Every frame. */
export interface Frame {
  /** Seconds since the stage started, and since the frame before, on the page's clock. */
  readonly t: number;
  readonly dt: number;
  /** The box in CSS pixels, and device pixels to a CSS pixel (at most 2): the context is already scaled by it. */
  readonly w: number;
  readonly h: number;
  readonly dpr: number;
  /** The player asked for reduced motion. */
  readonly still: boolean;
  readonly walkers: readonly StageWalker[];
  /** What the Space widget reads: whether the player is here, the fights and the quest markers. */
  readonly world?: { readonly here: boolean; readonly fight?: unknown; readonly markers?: readonly unknown[] };
  /** The objects taken from the space, by path. */
  readonly taken: readonly string[];
  readonly input: readonly StageInput[];
}

/** A use's button: its object's path and its box on screen, [x, y, w, h] in CSS pixels. */
export interface UseBox {
  readonly object: string;
  readonly box: readonly [number, number, number, number];
}

/** What `frame` may return: the uses' boxes. Returning nothing keeps the last frame's. */
export interface Drew {
  readonly uses?: readonly UseBox[];
}

/** A stage: `start` once, `frame` every frame, drawing on the canvas's 2D context. */
export interface StageDef {
  start?(start: Start): void;
  frame(g: OffscreenCanvasRenderingContext2D, frame: Frame): Drew | undefined | void;
}

/** The names `"eb/stage"` exports, for completion. */
export const STAGE_NAMES = ['defineStage', 'svg'] as const;
