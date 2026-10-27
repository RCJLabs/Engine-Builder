// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// Units and orders on a battle map in 3D, drawn with the map's own scene
// (battleScene.js), sorted with the walls by the painter, so a wall in
// front of a unit hides it. Pure: plain data in, plain data out. Units are
// tiles, z up.
//
// Units are figures in their suits (figures/figure.js), facing where they
// look: the crew pale, each trimmed in a color of their own, and boarders in
// rust. Down or stable they lie on the deck in their colors; out or dead,
// in grey. Each is drawn once and kept (figures/sprites.js), so the scene
// gives them as figures, not faces. Orders are marks on the deck: the tiles
// the selected unit can move to (in one action or a dash), the path of the
// move being shown and the cover where it would stop, a ring under the
// selected unit, and rings under the enemies it can shoot.
import { type Cover, coverOnSide } from '../sim/cover.ts';
import { SIDES, type Side } from '../sim/grid.ts';
import type { BattleLike, Rules } from '../sim/terrain.ts';
import type { Pose } from './figures/figure.ts';
import type { Held, Look } from './figures/looks.ts';
import type { Colors } from './figures/shapes.ts';
import type { Figure } from './figures/sprites.ts';
import { type PaletteName, palette, rgba } from './palette.ts';
import { type Face, plate } from './solid.ts';

type Tile = [number, number];

export interface Unit {
  id: string;
  side: string;
  status: string;
  at: number[];
  facing: number[];
  trim: string;
  flash?: boolean;
  look?: Look;
  held?: Held;
  pose?: Pose;
}

export const UNIT_TOP = 0.8; // the top of a standing unit's helmet, near enough
export const LYING_TOP = 0.36; // and of a unit lying on the deck
const CREW_TRIMS: PaletteName[] = ['crewA', 'crewB', 'crewC', 'crewD', 'crewE'];
const DECK = 0.01; // marks lie this far above the deck, rings and paths a little higher
const COVER_H: Record<Cover, number> = { half: 0.28, full: 0.5 };

// The trim of the crew member at `index` in the crew.
export function crewColor(index: number): string {
  return palette[CREW_TRIMS[index % CREW_TRIMS.length] as PaletteName];
}

// units: [{ id, side, status, at: [x, y], facing: [fx, fy], trim, flash,
// look, held, pose }], where `at` is the point it stands on (a tile's
// middle, or between two while it walks), facing a unit vector, trim its
// color, flash true for the moment a shot hits it, look and held its kind's
// and its weapon's (figures/looks.js), and pose { aim, stride, fall }
// (figure.js). Returns { figures } for figures/sprites.js, each { id, at,
// facing, look, held, colors, pose, key }.
export function unitsScene(units: Unit[]): { figures: Figure[] } {
  const figures = units.map(({ id, side, status, at, facing, trim, flash, look, held, pose = {} }) => {
    const colors = colorsOf(side, status, trim, flash);
    const lying = status !== 'active';
    return {
      id,
      at,
      facing,
      look,
      held,
      colors,
      pose: lying ? { fall: 1 } : pose,
      key: `${JSON.stringify(look ?? null)}${JSON.stringify(held ?? null)}${Object.values(colors).join()}`,
    };
  });
  return { figures };
}

// A figure's colors (figures/figure.js) and the outline round it: its
// side's, its trim, grey once out of the fight or dead, and the tracer's
// flash for the moment a shot hits it.
export function colorsOf(side: string, status: string, trim: string, flash = false): Colors {
  const gone = status === 'dead' || status === 'out';
  if (gone) {
    const grey = palette.fallenDark;
    return { suit: palette.fallen, trim: palette.fallenTrim, dark: grey, under: grey, visor: grey, glass: grey, lamp: grey, gun: grey, outline: palette.figureEdge };
  }
  const crew = side === 'crew';
  const colors = {
    suit: crew ? palette.crewSuit : palette.enemySuit,
    trim,
    dark: crew ? palette.gunmetal : palette.enemyDark,
    under: crew ? palette.crewUnder : palette.enemyUnder,
    visor: crew ? palette.visor : palette.enemyVisor,
    glass: crew ? palette.glass : palette.enemyGlass,
    lamp: palette.lamp,
    gun: palette.gun,
    outline: palette.figureEdge,
  };
  if (flash) Object.assign(colors, { suit: palette.tracer, trim: palette.tracer, under: palette.tracer });
  return colors;
}

// orders: {
//   reach      Map of { x, y, dash } (fight.js ordersFor), or null
//   preview    the fight's preview, or null: a move shows its path, where
//              it stops, and the cover there (from battle and rules)
//   selected   [x, y]: the tile of the unit giving orders, or null
//   targets    [[x, y]]: the enemies it can shoot
//   aimed      [x, y]: the one whose shot is shown, or null
// }
export interface Orders {
  reach?: Map<string, { x: number; y: number; dash: boolean }> | null;
  preview?: { type: string; path?: Tile[]; to?: Tile } | null;
  battle?: BattleLike | null;
  rules?: Rules | null;
  selected?: Tile | null;
  targets?: Tile[];
  aimed?: Tile | null;
  ordered?: Tile | null;
  welding?: Side | null;
}

export function ordersScene({ reach = null, preview = null, battle = null, rules = null, selected = null, targets = [], aimed = null, ordered = null, welding = null }: Orders): { faces: Face[]; glows: [] } {
  const faces: Face[] = [];
  for (const spot of reach?.values() ?? []) {
    const color = spot.dash ? palette.dash : palette.reach;
    plate(faces, [spot.x + 0.07, spot.y + 0.07], [spot.x + 0.93, spot.y + 0.93], DECK, color, { emissive: true, alpha: 0.2, edge: rgba(color, 0.6), bias: -0.03 });
  }
  if (selected) ring(faces, selected, 0.34, 0.44, palette.accent, 0.95);
  for (const at of targets) ring(faces, at, 0.36, 0.42, palette.target, 0.6);
  if (aimed) ring(faces, aimed, 0.32, 0.46, palette.target, 1);
  // A job's order shown (M32): the unit it reaches, or the door beside the
  // selected unit it would weld, a pane standing in the doorway.
  if (ordered) ring(faces, ordered, 0.3, 0.46, palette.good, 1);
  if (welding && selected) shield(faces, selected, welding, 'full', palette.good);
  if (preview?.type === 'move') {
    const { path, to } = preview as { path: Tile[]; to: Tile };
    for (let i = 1; i < path.length; i++) strip(faces, path[i - 1] as Tile, path[i] as Tile);
    ring(faces, to, 0.17, 0.27, palette.path, 1);
    if (battle && rules) {
      for (const side of SIDES) {
        const cover = coverOnSide(battle, to, side, rules);
        if (cover) shield(faces, to, side, cover);
      }
    }
  }
  return { faces, glows: [] };
}

// A ring on the deck round the middle of tile [x, y].
function ring(out: Face[], [x, y]: Tile, r0: number, r1: number, color: string, alpha: number, n = 16): void {
  const [cx, cy] = [x + 0.5, y + 0.5];
  const pt = (r: number, t: number) => [cx + r * Math.cos(t), cy + r * Math.sin(t), DECK * 1.6];
  for (let i = 0; i < n; i++) {
    const [a, b] = [(i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2];
    out.push({ pts: [pt(r0, a), pt(r1, a), pt(r1, b), pt(r0, b)], normal: [0, 0, 1], color, emissive: true, alpha, bias: -0.04 });
  }
}

// A stretch of a path, between the middles of two tiles side by side.
function strip(out: Face[], [ax, ay]: Tile, [bx, by]: Tile): void {
  const w = 0.045;
  const [x0, x1] = [Math.min(ax, bx) + 0.5 - w, Math.max(ax, bx) + 0.5 + w];
  const [y0, y1] = [Math.min(ay, by) + 0.5 - w, Math.max(ay, by) + 0.5 + w];
  plate(out, [x0, y0], [x1, y1], DECK * 1.8, palette.path, { emissive: true, alpha: 0.95, bias: -0.04 });
}

// Cover on one side of a tile: a pane standing just inside that edge, low
// for half cover and higher for full. Both faces, so it shows from either
// side.
function shield(out: Face[], [x, y]: Tile, side: Side, cover: Cover, color: string = palette.cover): void {
  const inset = 0.1;
  const along = side === 'n' || side === 's';
  const at = { n: y + inset, s: y + 1 - inset, w: x + inset, e: x + 1 - inset }[side];
  const [p, q]: number[][] = along ? [[x + 0.2, at], [x + 0.8, at]] : [[at, y + 0.2], [at, y + 0.8]];
  const h = COVER_H[cover];
  const pts = [[...p, 0], [...q, 0], [...q, h], [...p, h]];
  const normal = along ? [0, 1, 0] : [1, 0, 0];
  const look = { color, emissive: true, alpha: cover === 'full' ? 0.55 : 0.4, edge: rgba(color, 0.9) };
  out.push({ pts, normal, ...look }, { pts: [...pts].reverse(), normal: normal.map((n) => -n), ...look });
}
