/**
 * The starter sprites' palette (M7.1, D83, docs/specs/2d-scenes.md#the-starter-sprite-kit): sixteen
 * colours for a keep at night and its torchlight, drawn fresh for the engine. Every pixel the
 * sheets hold is one of these or clear, so a canvas drawing them at a whole scale holds only these.
 */

export const PALETTE = {
  ink: '#0a0b14',
  night: '#131a33',
  dusk: '#1f2a4f',
  ridge: '#2f3f6b',
  stoneDark: '#3b3c4f',
  stone: '#5e6072',
  stoneLight: '#8c8fa1',
  moon: '#e9e5c8',
  star: '#b7c3e8',
  ember: '#8c2f1c',
  flame: '#e5772a',
  glow: '#ffd36b',
  wood: '#5a3a22',
  red: '#7d2233',
  blue: '#3e6b8c',
  skin: '#d8a27c',
} as const;

export type Colour = keyof typeof PALETTE;

/** The palette as its hex colours, in order: what the e2e holds a canvas's pixels to. */
export const PALETTE_HEX: readonly string[] = Object.values(PALETTE);
