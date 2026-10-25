/**
 * The quality tiers (M5.7, D69, docs/specs/performance.md#the-tiers): what each lets the 3D view
 * spend. A tier changes how the view draws, never what a space holds or what a game's sim reads;
 * a lower tier draws a subset of the same plants and drops, so nothing moves as a tier changes.
 */

export const TIER_NAMES = ['low', 'medium', 'high'] as const;
export type TierName = (typeof TIER_NAMES)[number];

export interface TierSettings {
  readonly name: TierName;
  /** The device's pixel ratio, at most this. */
  readonly pixelRatioMost: number;
  readonly antialias: boolean;
  /** The sun's shadow map a side, or 0 for no shadows. */
  readonly shadowMap: number;
  /** Whether foliage casts shadows as well as the placed objects. */
  readonly foliageShadows: boolean;
  /** Whether a physical sky is drawn as one, or as its gradient. */
  readonly physicalSky: boolean;
  /** How far foliage is drawn, as a share of each type's reach. */
  readonly foliageReach: number;
  /** How many of the plants stand, as a share of the density painted. */
  readonly foliageShare: number;
  /** How many of an environment's drops fall. */
  readonly weatherShare: number;
  /** How far a walk draws the models of what isn't near, in metres (M5.10, D72); fog closes there. */
  readonly viewDistance: number;
}

export const TIERS: Readonly<Record<TierName, TierSettings>> = Object.freeze({
  low: {
    name: 'low',
    pixelRatioMost: 1,
    antialias: false,
    shadowMap: 0,
    foliageShadows: false,
    physicalSky: false,
    foliageReach: 0.5,
    foliageShare: 0.5,
    weatherShare: 0.25,
    viewDistance: 250,
  },
  medium: {
    name: 'medium',
    pixelRatioMost: 1.5,
    antialias: false,
    shadowMap: 1024,
    foliageShadows: false,
    physicalSky: true,
    foliageReach: 0.75,
    foliageShare: 0.75,
    weatherShare: 0.5,
    viewDistance: 400,
  },
  high: {
    name: 'high',
    pixelRatioMost: 2,
    antialias: true,
    shadowMap: 2048,
    foliageShadows: true,
    physicalSky: true,
    foliageReach: 1,
    foliageShare: 1,
    weatherShare: 1,
    viewDistance: 600,
  },
});

export const isTierName = (name: unknown): name is TierName =>
  typeof name === 'string' && (TIER_NAMES as readonly string[]).includes(name);

/** The pixel ratio a tier draws at on a device whose own is `device`. */
export const pixelRatioOf = (tier: TierSettings, device: number): number =>
  Math.min(device > 0 ? device : 1, tier.pixelRatioMost);

/** The tier below, or null below Low. */
export const lowerTier = (name: TierName): TierName | null =>
  name === 'high' ? 'medium' : name === 'medium' ? 'low' : null;

export const TIER_WORDS: Readonly<Record<TierName, string>> = { low: 'Low', medium: 'Medium', high: 'High' };
