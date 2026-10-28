// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// Palette tokens: the one place colors are defined. Canvas code reads them
// from here; CSS reads them as --c-* custom properties set at boot.
// `space` is also written literally in manifest.webmanifest (theme and
// background colors) and index.html (theme-color), which can't read tokens.
//
// A stage has no page to set CSS on, so applyCssVars stays behind, and so
// do the colony's grounds and buildings and the portraits' colors, which
// the board never draws.
export const palette = {
  space: '#070a14',
  spaceHi: '#0e1530',
  nebulaA: '#2b1f5c',
  nebulaB: '#0f3d4f',
  star: '#ffffff',
  starWarm: '#ffd9a8',
  starCool: '#a9c6ff',
  ink: '#e8ecf5',
  inkDim: '#8d97ad',
  accent: '#ff9b3d',
  panel: 'rgba(12, 17, 32, 0.95)',
  line: '#2a3552',
  good: '#5fd38d',
  bad: '#ff6b6b',
  // The builder shows the ship as a 3D blueprint: glowing lines over a
  // navy grid.
  bpPaper: '#0b1e3d',
  bpSky: '#14305c',
  bpDeep: '#081530',
  bpLine: '#8cd7ff',
  bpGlow: '#ffd36b',
  // Styling pieces on the blueprint (M23f): set apart from the rooms.
  bpStyle: '#d0a8ff',
  // Wrecked rooms on a battle map: fire, vacuum and rubble, each with the
  // floor color it leaves.
  fire: '#ff7a2f',
  fireCore: '#ffd36b',
  scorch: '#2b2126',
  vacuum: '#9fe3ff',
  frost: '#3d5f80',
  rubble: '#80746a',
  dust: '#3f3b3c',
  // Units on a battle map: the crew in pale suits, each trimmed in a color
  // of their own (the same as on their button), and boarders in rust.
  crewSuit: '#c9d4e6',
  crewA: '#5fd3e8',
  crewB: '#8fe36b',
  crewC: '#b99bff',
  crewD: '#ff8fc8',
  crewE: '#f2f5fa',
  enemySuit: '#a4473d',
  enemyTrim: '#ff6b4a',
  visor: '#bff0ff',
  enemyVisor: '#ffb36b',
  gunmetal: '#262f42',
  fallen: '#4a5160',
  // Figures (src/render/figures/): the slate under a skinsuit's plates, the
  // dark of joints and soles, a dark visor's glass, lamps, the gun in hand
  // and the outline round a figure, with the boarders' own where they
  // differ; and the greys of the fallen.
  crewUnder: '#4b5873',
  enemyUnder: '#4d3337',
  enemyDark: '#2a2630',
  glass: '#16253f',
  enemyGlass: '#2a1a1e',
  lamp: '#fff1b8',
  gun: '#2b3447',
  figureEdge: 'rgba(4, 8, 18, 0.95)',
  fallenTrim: '#5b6372',
  fallenDark: '#2b303b',
  // Orders on a battle map: the tiles a unit can move to in one action or
  // in a dash, the path it would take, the cover where it would stop, the
  // enemies it can shoot, and shots in flight.
  reach: '#8cd7ff',
  dash: '#ffc857',
  path: '#ffe39a',
  cover: '#bff0ff',
  target: '#ff6b6b',
  tracer: '#fff1b8',
  // The run's sector map: the chart under the nodes, and its grid; a
  // nebula's cloud (M24); a world past the charts (M25).
  chart: 'rgba(14, 21, 48, 0.6)',
  chartGrid: 'rgba(42, 53, 82, 0.35)',
  nebula: '#b49cff',
  world: '#6fe3c5',
};

export type PaletteName = keyof typeof palette;

// Manufacturers are skins over the same part shapes: the colors a built ship
// is painted in outside the builder, keyed by manufacturer id.
const yard = {
  space: '#071226',
  edge: '#08101f',
  hull: '#3c4b68',
  plates: ['#3c4b68', '#425275', '#38465f', '#455679'],
  seam: '#222d45',
  rivet: '#6f83a8',
  livery: '#8cd7ff',
  metal: '#5d6f94',
  metalHi: '#7488ad',
  dark: '#1d273d',
  darker: '#141b2c',
  soft: '#c3d0e4',
  glassHi: '#bff0ff',
  glassLo: '#3f8fc4',
  domeHi: '#8fa3c8',
  domeLo: '#3a4867',
  glow: '#ffd36b',
  glowCore: '#fff1b8',
  hazard: '#e3b341',
  flame: '#a8e8ff',
  shield: '#b49cff',
  medical: '#ff6b6b',
  port: '#ff5a5a',
  starboard: '#5fd38d',
  // Inside, on a battle map.
  floors: ['#28344e', '#2c3955', '#253048', '#2f3c59'],
  floorSeam: '#18202f',
  // The hangar's deck around the ship, in a raid (hangarMap.js).
  deck: '#30363f',
  wall: '#6a7da3',
  door: '#e3b341',
  doorLight: '#ffe39a',
  screen: '#7fe0ff',
};

// A manufacturer's colors: the yard's, and a maker's own marks and lines.
export type Skin = typeof yard & { mark?: string; markDark?: string; plans?: string };

export const skins: Record<string, Skin> = { yard };

// A job's site on the ground (src/sim/gen/site.js), not a ship: the yard's
// fittings on dusty concrete, with rock where a ship has its hull and fences
// for walls.
skins.ground = {
  ...skins.yard,
  edge: '#15120f',
  hull: '#5e534a',
  dark: '#2a2622',
  floors: ['#3b3631', '#3f3a34', '#37332e', '#423c35'],
  floorSeam: '#26221e',
  wall: '#8b929b',
};

// Bastion Arms (M23g): gunmetal fittings, orange hazard chevrons, engines
// burning orange, and amber lines on the plans. Its parts take the ship's
// paint and trim like any other's (FITTINGS).
skins.bastion = {
  ...skins.yard,
  metal: '#4f5446',
  metalHi: '#727862',
  dark: '#24261f',
  darker: '#17180f',
  domeHi: '#848a74',
  domeLo: '#3d4035',
  rivet: '#a8ad94',
  hazard: '#ff8c1a',
  flame: '#ffb36b',
  mark: '#ff8c1a',
  markDark: '#1a1a14',
  plans: '#ffc45e',
};

// Kestrel Dynamics (M31): pale pearl fittings, two coral stripes, engines
// burning violet, and rose lines on the plans.
skins.kestrel = {
  ...skins.yard,
  metal: '#c3ccd9',
  metalHi: '#eef2f8',
  dark: '#5a6479',
  darker: '#3c4558',
  domeHi: '#eef2f8',
  domeLo: '#9fadc2',
  rivet: '#e3e9f2',
  hazard: '#ff7a59',
  flame: '#d9ccff',
  mark: '#ff7a59',
  markDark: '#3c4558',
  plans: '#ff9ad2',
};

// Scrapline (M31): rust-brown fittings with bare patches of unpainted
// metal, engines burning green, and lime lines on the plans.
skins.scrapline = {
  ...skins.yard,
  metal: '#7d5c41',
  metalHi: '#a87f5c',
  dark: '#3b2c21',
  darker: '#2a1e16',
  domeHi: '#a39d8f',
  domeLo: '#5c5647',
  rivet: '#d0a87e',
  hazard: '#c9b45a',
  flame: '#d8f07a',
  mark: '#8f9196',
  markDark: '#6f7177',
  plans: '#c8ee6e',
};

// The skin for a manufacturer, or the yard's for one without a skin yet.
export function skinFor(manufacturer: string): Skin {
  return skins[manufacturer] ?? (skins.yard as Skin);
}

// What a part takes from its maker's skin (M23g): the fittings on its roof
// and what sticks out of the hull for it, and its mark. The hull, its paint
// and its trim stay the ship's.
export const FITTINGS = ['metal', 'metalHi', 'dark', 'darker', 'domeHi', 'domeLo', 'rivet', 'hazard', 'flame', 'mark', 'markDark'];
export function fittingsOf(manufacturer: string): Partial<Skin> {
  const skin = skinFor(manufacturer);
  return Object.fromEntries(FITTINGS.filter((key) => key in skin).map((key) => [key, skin[key as keyof Skin]]));
}

// A maker's line on the plans and on its parts' icons (M23g): the yard's
// is the blueprint's own.
export function planLine(manufacturer: string): string {
  return skinFor(manufacturer).plans ?? palette.bpLine;
}

// Paint and trim (data/styling.json names them, M23f): a hull's color with
// its plates' tints and its seams, and the trim that the livery stripe and
// the lit fittings take. Slate and sky are the yard's own, every ship's
// until it is painted.
export const paints: Record<string, { hull: string; plates: string[]; seam: string }> = {
  slate: { hull: '#3c4b68', plates: ['#3c4b68', '#425275', '#38465f', '#455679'], seam: '#222d45' },
  graphite: { hull: '#3d4148', plates: ['#3d4148', '#454950', '#383b42', '#4a4e57'], seam: '#202328' },
  bone: { hull: '#aaa596', plates: ['#aaa596', '#b3ae9f', '#a29d8e', '#b8b3a6'], seam: '#6f6a5e' },
  rust: { hull: '#7a432f', plates: ['#7a432f', '#844a34', '#713d2a', '#8b5139'], seam: '#45251a' },
  olive: { hull: '#55603f', plates: ['#55603f', '#5c6845', '#4e5839', '#626e4a'], seam: '#30361f' },
  navy: { hull: '#26365c', plates: ['#26365c', '#2b3c66', '#223154', '#30426d'], seam: '#131c32' },
};
export const trims: Record<string, string> = {
  sky: '#8cd7ff',
  amber: '#ffb347',
  signal: '#ff5a4a',
  lime: '#9be35a',
  violet: '#b49cff',
  white: '#eef3fb',
};

// The sides' colors (M33): data/factions.json gives each side one by name,
// for its mark beside the side's name on the panels, the job board and the
// chart.
export const sideColors: Record<string, string> = {
  yellow: '#e3b341',
  blue: '#7ea6ff',
  magenta: '#d77ad1',
  brick: '#e2735a',
};

// A skin with a ship's paint and trim over it; ones it doesn't know leave
// the skin's own.
export function paintSkin(skin: Skin, paint: string, trim: string): Skin {
  const coat = paints[paint];
  return { ...skin, ...(coat ? { hull: coat.hull, plates: coat.plates, seam: coat.seam } : {}), ...(trims[trim] ? { livery: trims[trim] } : {}) };
}

// '#rrggbb' plus an alpha, as an rgba() string.
export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
