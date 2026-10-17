/**
 * Quality tiers. A tier changes what a frame costs, never what is in it: the same terrain, the
 * same 5,000 trees and the same character at every tier, so the readings compare like with like.
 */
export type TierName = 'low' | 'medium' | 'high';

export interface Tier {
  readonly name: TierName;
  /** The most device pixels drawn per CSS pixel; a screen with fewer gets its own. */
  readonly pixelRatio: number;
  /** Shadow map size in texels per side, or 0 for no shadows. */
  readonly shadowMap: number;
  /** Softened (PCF soft) shadow edges, which take more samples. */
  readonly softShadows: boolean;
  /** 4× multisampling. Changing it needs a new renderer, which is one reason each tier is its own page load. */
  readonly antialias: boolean;
}

export const TIERS: Readonly<Record<TierName, Tier>> = {
  low: { name: 'low', pixelRatio: 1, shadowMap: 0, softShadows: false, antialias: false },
  medium: { name: 'medium', pixelRatio: 1.5, shadowMap: 1024, softShadows: false, antialias: false },
  high: { name: 'high', pixelRatio: 2, shadowMap: 2048, softShadows: true, antialias: true },
};

export const TIER_NAMES = Object.keys(TIERS) as readonly TierName[];

// Own keys only: `in` would let ?tier=toString through to a function.
export const isTierName = (name: unknown): name is TierName => typeof name === 'string' && Object.hasOwn(TIERS, name);

/** The tier a page was asked for, medium when it asked for none or for one that doesn't exist. */
export const tierOf = (name: string | null): Tier => (isTierName(name) ? TIERS[name] : TIERS.medium);

/** The pixel ratio a tier draws at on a screen of `devicePixelRatio`. */
export const pixelRatioFor = (tier: Tier, devicePixelRatio: number) =>
  Math.min(tier.pixelRatio, devicePixelRatio > 0 ? devicePixelRatio : 1);
