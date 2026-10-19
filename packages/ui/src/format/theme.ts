/**
 * A game's theme (docs/specs/screens.md#theme): its colours, type and spacing. The pairs text is
 * drawn in must reach WCAG's AA for body text, 4.5:1, which the compiler checks (E050) with the
 * same arithmetic the e2e's axe uses.
 */

export const COLOR_NAMES = ['background', 'surface', 'text', 'muted', 'accent', 'on-accent'] as const;
export type ColorName = (typeof COLOR_NAMES)[number];

export interface Theme {
  readonly colors: Readonly<Record<ColorName, string>>;
  readonly font?: string;
  /** Body text, in px. */
  readonly size?: number;
  /** One spacing step, in px. */
  readonly space?: number;
  readonly radius?: number;
}

/** The engine's own theme, for a game without ui/theme.json. Its pairs pass AA. */
export const DEFAULT_THEME: Theme = {
  colors: {
    background: '#14161a',
    surface: '#1f232a',
    text: '#eef0f3',
    muted: '#a9b0bb',
    accent: '#7cc4ff',
    'on-accent': '#0b1220',
  },
  font: 'system-ui, sans-serif',
  size: 16,
  space: 8,
  radius: 8,
};

/** The pairs text is drawn in: the colour of the text, then what it sits on. */
export const CONTRAST_PAIRS: readonly (readonly [ColorName, ColorName])[] = [
  ['text', 'background'],
  ['text', 'surface'],
  ['muted', 'background'],
  ['muted', 'surface'],
  ['on-accent', 'accent'],
];

export const AA_BODY = 4.5;

/** sRGB channel to linear light, as WCAG 2 defines relative luminance. */
function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * linear((n >> 16) & 255) + 0.7152 * linear((n >> 8) & 255) + 0.0722 * linear(n & 255);
}

/** WCAG's contrast ratio between two #rrggbb colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
