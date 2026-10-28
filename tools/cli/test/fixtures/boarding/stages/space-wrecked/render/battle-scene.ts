// biome-ignore-all format: Space-Wrecked's own layout, so the port reads line for line against its source
// A battle map in 3D (src/sim/mapFromShip.js): the ship's insides, cut away
// so the crew can be seen over the walls. Floors are tinted per room with a
// seam around every tile; walls, the hull, doors and hatches stand on the
// tile edges; each tile's fitting stands on it (crates for half cover,
// lockers for full cover, machinery, consoles, the airlock's pad). Wrecked
// rooms burn, frost over or fill with rubble. An open door has slid down
// into the deck. A job's site (src/sim/gen/site.js) is drawn the same way
// in the ground skin, with rock standing in lumps; in a raid, the hangar's
// deck lies around the ship (hangarMap.js), painted at its doors. Pure: map in, { faces,
// glows } out (solid.js faces, mesh.js glows), in the manufacturer's skin.
// Units are tiles, z up.
import { cellAt, type Side } from '../sim/grid.ts';
import { type BattleMap, MARGIN, wallAt } from '../sim/map-from-ship.ts';
import type { Box } from './orbit.ts';
import type { Glow } from './painter.ts';
import { type PaletteName, palette, type Skin } from './palette.ts';
import { type Face, normalOf, plate, solidBox, type Vec3 } from './solid.ts';

type Fitting = (f: Face[], g: Glow[], x: number, y: number, k: Skin) => void;

export const WALL_H = 0.55; // room walls, below a standing crew member's shoulders
export const HULL_H = 0.7; // the hull
const TALL = 0.9; // the tallest fitting, a locker
const COLLAR = 0.45; // how far a docking collar sticks out of the hull
const DOOR_H = 0.46;
const OPEN_DOOR_H = 0.025; // an open door: its top, flush with the deck
const THICK = { wall: 0.1, hull: 0.16, door: 0.06, hatch: 0.1 };
const POST = { wall: 0.07, hull: 0.1 }; // half the width of a post where walls meet
const SOLID = new Set(['wall', 'hull']); // runs that go straight on without a post
const STEP: Record<Side, [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
const FLOOR_UNDER: Record<string, PaletteName> = { fire: 'scorch', vacuum: 'frost', rubble: 'dust' };

// input: { map, skin, open }: open is a battle's open doors, by edge key
// (battle.doors).
export function battleScene({ map, skin, open = [] }: { map: BattleMap; skin: Skin; open?: string[] }): { faces: Face[]; glows: Glow[] } {
  const faces: Face[] = [];
  const glows: Glow[] = [];
  const edge = { edge: skin.edge };

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const kind = cellAt(map.tiles, x, y) as string;
      const uid = cellAt(map.roomAt, x, y) as number | null;
      if (kind === 'space') continue;
      if (kind === 'rock') {
        rock(faces, x, y, skin);
        continue;
      }
      if (kind === 'deck') {
        plate(faces, [x, y], [x + 1, y + 1], 0, skin.deck ?? skin.floors[0], { edge: skin.floorSeam });
        // The line the hangar's doors close on, on the west edge.
        if (x === 0) plate(faces, [x + 0.08, y], [x + 0.26, y + 1], 0.002, skin.hazard);
        continue;
      }
      if (uid === null) {
        // A notch the hull closes over: solid hull.
        solidBox(faces, [x, y, 0], [x + 1, y + 1, HULL_H], skin.hull, edge);
        continue;
      }
      const hazard = cellAt(map.hazards, x, y);
      const floor = hazard ? palette[FLOOR_UNDER[hazard] as PaletteName] : (skin.floors[uid % skin.floors.length] as string);
      plate(faces, [x, y], [x + 1, y + 1], 0, floor, { edge: skin.floorSeam });
      FITTINGS[kind]?.(faces, glows, x, y, skin);
      if (hazard) HAZARDS[hazard](faces, glows, x, y, kind);
    }
  }

  walls(faces, map, skin, new Set(open));
  for (const { x, y, side } of map.hatches) collar(faces, glows, x, y, side, skin);
  // A room open to space glows cold, once for the whole room.
  for (const room of map.rooms) {
    if (room.wreck !== 'vacuum') continue;
    glows.push({ at: [room.x + room.w / 2, room.y + room.h / 2, 0.2], r: 0.45 + 0.35 * Math.max(room.w, room.h), color: palette.vacuum });
  }
  return { faces, glows };
}

// The boxes the camera works with, in tiles: `fit`, the ship and what sticks
// out of it, is what the view opens on; `all`, the whole map with its margin
// of space, is as far as it pans. A site has no margin: the two are one.
export function battleBoxes(map: BattleMap): { fit: Box; all: Box } {
  const m = map.margin === undefined ? map.tilesPerCell * MARGIN - COLLAR : map.tilesPerCell * map.margin;
  return {
    fit: { x0: m, y0: m, x1: map.width - m, y1: map.height - m, z1: TALL },
    all: { x0: 0, y0: 0, x1: map.width, y1: map.height, z1: TALL },
  };
}

// Walls, the hull, doors and hatches on the tile edges. A post stands where
// runs turn, meet or end, and either side of a door or hatch; a straight run
// of wall or hull goes on through. Each piece is its top and its two long
// sides: its ends are always against a post or the next piece. A north or
// west edge's key is "x,y,side" (mapFromShip.js edgeKey).
function walls(faces: Face[], map: BattleMap, skin: Skin, open: Set<string>): void {
  const posts = new Map<string, number>();
  for (let vy = 0; vy <= map.height; vy++) {
    for (let vx = 0; vx <= map.width; vx++) {
      const [w, e, n, s] = [wallAt(map, vx - 1, vy, 'n'), wallAt(map, vx, vy, 'n'), wallAt(map, vx, vy - 1, 'w'), wallAt(map, vx, vy, 'w')];
      const meeting = [w, e, n, s].filter(Boolean);
      const through = meeting.length === 2 && ((w === e && SOLID.has(w as string)) || (n === s && SOLID.has(n as string)));
      if (!meeting.length || through) continue;
      const hull = meeting.some((kind) => kind === 'hull' || kind === 'hatch');
      const h = hull ? POST.hull : POST.wall;
      posts.set(`${vx},${vy}`, h);
      solidBox(faces, [vx - h, vy - h, 0], [vx + h, vy + h, hull ? HULL_H : WALL_H], hull ? skin.hull : skin.wall, { edge: skin.edge });
    }
  }
  for (let y = 0; y <= map.height; y++) {
    for (let x = 0; x <= map.width; x++) {
      // The north edge runs from (x, y) to (x + 1, y); the west edge from
      // (x, y) to (x, y + 1).
      for (const [side, end] of [['n', [x + 1, y]], ['w', [x, y + 1]]] as ['n' | 'w', number[]][]) {
        const kind = wallAt(map, x, y, side);
        if (!kind) continue;
        const from = posts.get(`${x},${y}`) ?? 0;
        const to = 1 - (posts.get(`${end[0]},${end[1]}`) ?? 0);
        const piece = (thick: number, z: number, color: string, top = color, lit = false) => {
          const t = thick / 2;
          const [a, b] = side === 'n' ? [[x + from, y - t], [x + to, y + t]] : [[x - t, y + from], [x + t, y + to]];
          const [x0, y0, x1, y1] = [a[0], a[1], b[0], b[1]] as number[];
          faces.push({ pts: [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], normal: [0, 0, 1], color: top, emissive: lit, edge: skin.edge });
          if (side === 'n') {
            faces.push({ pts: [[x0, y1, 0], [x1, y1, 0], [x1, y1, z], [x0, y1, z]], normal: [0, 1, 0], color, edge: skin.edge });
            faces.push({ pts: [[x1, y0, 0], [x0, y0, 0], [x0, y0, z], [x1, y0, z]], normal: [0, -1, 0], color, edge: skin.edge });
          } else {
            faces.push({ pts: [[x1, y0, 0], [x1, y1, 0], [x1, y1, z], [x1, y0, z]], normal: [1, 0, 0], color, edge: skin.edge });
            faces.push({ pts: [[x0, y1, 0], [x0, y0, 0], [x0, y0, z], [x0, y1, z]], normal: [-1, 0, 0], color, edge: skin.edge });
          }
        };
        if (kind === 'wall') piece(THICK.wall, WALL_H, skin.wall);
        else if (kind === 'hull') piece(THICK.hull, HULL_H, skin.hull);
        else if (kind === 'door') piece(THICK.door, open.has(`${x},${y},${side}`) ? OPEN_DOOR_H : DOOR_H, skin.door, skin.doorLight, true);
        else piece(THICK.hatch, HULL_H - 0.1, skin.livery, skin.glassHi, true);
      }
    }
  }
}

// A docking collar outside a hatch, and its light.
function collar(faces: Face[], glows: Glow[], x: number, y: number, side: Side, skin: Skin): void {
  const [dx, dy] = STEP[side];
  const [cx, cy] = [x + 0.5 + dx * 0.5, y + 0.5 + dy * 0.5];
  const out = (d: number, across: number) => [cx + dx * d - dy * across, cy + dy * d + dx * across];
  const [p, q] = [out(THICK.hull / 2, -0.3), out(COLLAR - 0.03, 0.3)] as number[][];
  solidBox(faces, [Math.min(p[0], q[0]), Math.min(p[1], q[1]), 0.06], [Math.max(p[0], q[0]), Math.max(p[1], q[1]), HULL_H - 0.16], skin.dark, { edge: skin.edge });
  glows.push({ at: [...out(0.5, 0), 0.3], r: 0.42, color: skin.livery });
}

// What stands on a tile, by its name in the tiles legend. A name without a
// fitting here is bare floor, so new tiles draw without an engine edit.
// Details on top are flat plates: a battle map has many tiles.
const FITTINGS: Record<string, Fitting> = {
  'half cover'(f, _g, x, y, k) {
    solidBox(f, [x + 0.14, y + 0.16, 0], [x + 0.86, y + 0.84, 0.34], k.metal, { edge: k.edge });
    plate(f, [x + 0.22, y + 0.24], [x + 0.78, y + 0.76], 0.342, k.metalHi, { edge: k.edge });
  },
  'full cover'(f, _g, x, y, k) {
    solidBox(f, [x + 0.1, y + 0.12, 0], [x + 0.9, y + 0.88, 0.84], k.dark, { edge: k.edge });
    for (const u of [0.3, 0.5, 0.7]) plate(f, [x + u - 0.05, y + 0.18], [x + u + 0.05, y + 0.82], 0.842, k.metal);
  },
  machinery(f, g, x, y, k) {
    solidBox(f, [x + 0.06, y + 0.06, 0], [x + 0.94, y + 0.94, 0.6], k.metal, { edge: k.edge });
    plate(f, [x + 0.16, y + 0.16], [x + 0.84, y + 0.84], 0.602, k.dark, { edge: k.edge });
    for (const v of [0.3, 0.7]) plate(f, [x + 0.22, y + v - 0.04], [x + 0.78, y + v + 0.04], 0.604, k.metalHi);
    disc(f, x + 0.5, y + 0.5, 0.09, 0.604, k.glowCore, 6, { emissive: true });
    g.push({ at: [x + 0.5, y + 0.5, 0.7], r: 0.38, color: k.glow });
  },
  console(f, g, x, y, k) {
    solidBox(f, [x + 0.18, y + 0.18, 0], [x + 0.82, y + 0.82, 0.3], k.dark, { edge: k.edge });
    plate(f, [x + 0.25, y + 0.25], [x + 0.75, y + 0.75], 0.302, k.screen, { emissive: true });
    g.push({ at: [x + 0.5, y + 0.5, 0.34], r: 0.34, color: k.screen });
  },
  // A square pad, not a ring: in a fight, rings mark units.
  airlock(f, _g, x, y, k) {
    plate(f, [x + 0.15, y + 0.15], [x + 0.85, y + 0.85], 0.003, k.hazard);
    plate(f, [x + 0.23, y + 0.23], [x + 0.77, y + 0.77], 0.006, k.dark);
  },
};

// Rock: a lump about as tall as a locker, each a little different in
// height and girth, with a darker patch on top, so a ridge of it doesn't
// read as a wall.
function rock(f: Face[], x: number, y: number, skin: Skin): void {
  const h = 0.62 + 0.24 * hash(x, y, 80);
  const [a, b] = [0.03 * hash(x, y, 81), 0.03 * hash(x, y, 82)];
  solidBox(f, [x + a, y + b, 0], [x + 1 - b, y + 1 - a, h], skin.hull, { edge: skin.edge });
  plate(f, [x + 0.2 + 0.2 * hash(x, y, 83), y + 0.18], [x + 0.62 + 0.18 * hash(x, y, 84), y + 0.5 + 0.3 * hash(x, y, 85)], h + 0.002, skin.dark);
}

// A flat polygon of n sides lying at height z.
function disc(f: Face[], cx: number, cy: number, r: number, z: number, color: string, n: number, extra = {}): void {
  const pts: Vec3[] = [];
  for (let i = 0; i < n; i++) pts.push([cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2), z]);
  f.push({ pts, normal: [0, 0, 1], color, ...extra });
}

// Wrecks, drawn tile by tile over the tinted floor. Flames and rubble stay
// off fittings, which they would only poke through.
const HAZARDS: Record<'fire' | 'vacuum' | 'rubble', (f: Face[], g: Glow[], x: number, y: number, kind: string) => void> = {
  fire(f, g, x, y, kind) {
    if (kind === 'floor' || kind === 'airlock') {
      flame(f, x + 0.3 + 0.2 * hash(x, y, 1), y + 0.35 + 0.15 * hash(x, y, 2), 0.13, 0.42 + 0.2 * hash(x, y, 3));
      flame(f, x + 0.62 + 0.15 * hash(x, y, 4), y + 0.6 + 0.15 * hash(x, y, 5), 0.1, 0.3 + 0.15 * hash(x, y, 6));
    }
    g.push({ at: [x + 0.5, y + 0.5, 0.3], r: 0.62, color: palette.fire });
  },
  vacuum(f, _g, x, y) {
    // Frost on the deck.
    for (let i = 0; i < 3; i++) {
      const [cx, cy, s] = [x + 0.15 + 0.7 * hash(x, y, 10 + i), y + 0.15 + 0.7 * hash(x, y, 20 + i), 0.05 + 0.05 * hash(x, y, 30 + i)];
      f.push({ pts: [[cx - s, cy, 0.004], [cx, cy - s * 0.6, 0.004], [cx + s, cy, 0.004], [cx, cy + s * 0.6, 0.004]], normal: [0, 0, 1], color: palette.vacuum, emissive: true });
    }
  },
  rubble(f, _g, x, y, kind) {
    if (kind !== 'floor' && kind !== 'airlock') return;
    for (let i = 0; i < 2; i++) {
      const [cx, cy] = [x + 0.2 + 0.6 * hash(x, y, 40 + i), y + 0.2 + 0.6 * hash(x, y, 50 + i)];
      const [s, h] = [0.07 + 0.07 * hash(x, y, 60 + i), 0.06 + 0.12 * hash(x, y, 70 + i)];
      solidBox(f, [cx - s, cy - s * 0.8, 0], [cx + s, cy + s * 0.8, h], palette.rubble, { edge: palette.dust });
    }
  },
};

// A flame: a four-sided spike, lit on the faces toward the light.
function flame(f: Face[], cx: number, cy: number, s: number, h: number): void {
  const base = [[cx - s, cy - s, 0.004], [cx + s, cy - s, 0.004], [cx + s, cy + s, 0.004], [cx - s, cy + s, 0.004]];
  const apex = [cx, cy, h];
  const inside = [cx, cy, h / 4];
  for (let i = 0; i < 4; i++) {
    const pts = [base[i], base[(i + 1) % 4], apex] as Vec3[];
    const normal = normalOf(pts, inside);
    f.push({ pts, normal, color: normal[1] < 0 || normal[0] < 0 ? palette.fireCore : palette.fire, emissive: true });
  }
}

// A number in [0, 1) that depends only on the tile and salt, so a wreck
// looks the same every time it is drawn.
function hash(x: number, y: number, salt: number): number {
  let h = Math.imul(x + 0x9e37, 0x85ebca6b) ^ Math.imul(y + 0x7f4a, 0xc2b2ae35) ^ Math.imul(salt + 1, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
