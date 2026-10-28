// The battle on the board (M7.5, D87, docs/specs/tactics.md#a-stage-in-code). The page's controller hands
// the stage the battle as it shows it (Frame.battle), and the board draws it as Space-Wrecked's fight view
// does (src/ui/fight/view.js): each unit a figure where the playback has it, the crew in their jobs' suits
// and the boarders in theirs (data/enemies.json), lying once down; the orders as marks on the deck
// (units.js ordersScene). Over the board go each unit's health, the keyboard's cursor and a shot's tracer,
// which are this stage's own. A tap is turned back into the tile under it, a unit's figure first.
import type { StageBattle, StageUnit } from 'eb/stage';
import { ENEMIES, JOBS, WEAPONS } from '../space-wrecked/data/content.ts';
import type { Figure } from '../space-wrecked/render/figures/sprites.ts';
import { type Cam, project, unproject } from '../space-wrecked/render/orbit.ts';
import { palette } from '../space-wrecked/render/palette.ts';
import type { Face } from '../space-wrecked/render/solid.ts';
import { crewColor, LYING_TOP, ordersScene, UNIT_TOP, type Unit, unitsScene } from '../space-wrecked/render/units.ts';

type Pair = readonly [number, number];
type Tile = [number, number];

const BAR: Pair = [26, 4]; // a unit's health bar, in CSS pixels
const CHEST = 0.5; // where a shot leaves and lands, in tiles above the deck

export interface Drawn {
  readonly faces: Face[];
  readonly figures: Figure[];
}

export interface BoardFight {
  /** The units and the orders, or undefined when nothing on the deck changed since the last frame. */
  frame(battle: StageBattle | undefined, still: boolean): Drawn | undefined;
  /** Over the board once it is drawn: health, the cursor, a shot. */
  overlay(g: OffscreenCanvasRenderingContext2D, cam: Cam, battle: StageBattle): void;
  /** The tile under a tap at (x, y) in CSS pixels: a standing unit's when on its figure, else the deck's. */
  pick(cam: Cam, battle: StageBattle, x: number, y: number): Pair | undefined;
}

interface Kept {
  readonly at: [number, number];
  readonly facing: [number, number];
  readonly walked: number;
}

// origin: the tilemap's tile under the board's (0, 0); size: the tilemap's columns and rows; records: the
// pack's, by "type:id", where each unit's actor, behaviour and gun are.
export function createFight(origin: Pair, size: Pair, records: Readonly<Record<string, unknown>>): BoardFight {
  const cell = ([c, r]: Pair): Tile => [c - origin[0], r - origin[1]];
  const middle = ([c, r]: Pair): [number, number] => [c - origin[0] + 0.5, r - origin[1] + 0.5];
  const actor = (id: string) => records[`actor:${id}`] as { behaviour?: string; gun?: string } | undefined;
  const kept = new Map<string, Kept>();
  let shown = '';

  const unitOf = (battle: StageBattle, u: StageUnit, still: boolean): Unit => {
    const at = middle(u.at);
    const was = kept.get(u.id);
    const step = was ? Math.hypot(at[0] - was.at[0], at[1] - was.at[1]) : 0;
    const facing =
      step > 1e-6 && was ? toward(was.at, at) : (facingFoe(battle, u, at, middle) ?? was?.facing ?? [1, 0]);
    const walked = (was?.walked ?? 0) + step;
    kept.set(u.id, { at, facing, walked });
    const job = u.side === 'foes' ? ENEMIES[u.actor] : JOBS[actor(u.actor)?.behaviour ?? u.actor];
    const held = WEAPONS[actor(u.actor)?.gun ?? job?.weapon ?? '']?.held;
    const crew = battle.units.filter((o) => o.side === 'crew').map((o) => o.id);
    return {
      id: u.id,
      side: u.side,
      status: u.status,
      at,
      facing,
      trim: u.side === 'crew' ? crewColor(crew.indexOf(u.id)) : palette.enemyTrim,
      flash: battle.shot?.to === u.id && battle.shot.hit,
      ...(job ? { look: job.look } : {}),
      ...(held ? { held } : {}),
      // A stride is two steps, a step a tile, as the walkers'; the shooter raises its gun.
      pose: { aim: battle.shot?.from === u.id ? 1 : 0, stride: step > 1e-6 && !still ? (walked / 2) % 1 : null },
    };
  };

  const ordersOf = (battle: StageBattle) => {
    const tileOf = (id: string | undefined) => battle.units.find((u) => u.id === id)?.at;
    const p = battle.preview;
    const aimed = p?.kind === 'shoot' || p?.kind === 'steady' ? tileOf(p.target) : undefined;
    const ordered = p?.kind === 'order' ? tileOf(p.target) : undefined;
    const selected = tileOf(battle.selected);
    return ordersScene({
      reach: battle.playing
        ? null
        : new Map(battle.reach.map(({ to, ap }) => [`${to[0]},${to[1]}`, { ...xy(cell(to)), dash: ap === 2 }])),
      preview: p?.kind === 'move' && p.path && p.to ? { type: 'move', path: p.path.map(cell), to: cell(p.to) } : null,
      selected: selected && !battle.playing ? cell(selected) : null,
      targets: battle.playing ? [] : battle.targets.flatMap((t) => (tileOf(t) ? [cell(tileOf(t) as Pair)] : [])),
      aimed: aimed ? cell(aimed) : null,
      ordered: ordered ? cell(ordered) : null,
    });
  };

  return {
    frame(battle, still) {
      if (!battle) {
        kept.clear();
        if (shown === '') return undefined;
        shown = '';
        return { faces: [], figures: [] };
      }
      const units = battle.units.map((u) => unitOf(battle, u, still));
      const orders = ordersOf(battle);
      const key = JSON.stringify([units, orders.faces.length, battle.preview, battle.selected, battle.playing]);
      if (key === shown) return undefined;
      shown = key;
      return { faces: orders.faces, figures: unitsScene(units).figures };
    },
    overlay(g, cam, battle) {
      for (const u of battle.units) if (u.status !== 'dead' && u.status !== 'out') healthBar(g, cam, u, middle(u.at));
      if (battle.cursor) outline(g, cam, cell(battle.cursor));
      const shot = battle.shot;
      const [from, to] = [shot?.from, shot?.to].map((id) => battle.units.find((u) => u.id === id));
      if (shot && from && to) tracer(g, cam, middle(from.at), middle(to.at), shot.hit);
    },
    pick(cam, battle, x, y) {
      // The nearest the eye of the figures the tap is on: a unit stands taller than its tile.
      let best: { at: Pair; depth: number } | undefined;
      for (const u of battle.units) {
        if (u.status !== 'active') continue;
        const [mx, my] = middle(u.at);
        const [fx, fy, depth] = project(cam, mx, my, 0);
        const [, hy] = project(cam, mx, my, UNIT_TOP);
        const half = Math.abs(project(cam, mx + 0.5, my, 0)[0] - fx) * 0.7;
        if (Math.abs(x - fx) <= Math.max(half, 8) && y >= hy && y <= fy + half && (!best || depth < best.depth))
          best = { at: u.at, depth };
      }
      if (best) return [Math.round(best.at[0]), Math.round(best.at[1])];
      const on = unproject(cam, x, y);
      if (!on) return undefined;
      const [c, r] = [Math.floor(on[0]) + origin[0], Math.floor(on[1]) + origin[1]];
      return c >= 0 && r >= 0 && c < size[0] && r < size[1] ? [c, r] : undefined;
    },
  };
}

const xy = ([x, y]: Tile) => ({ x, y });

function toward(from: readonly number[], to: readonly number[]): [number, number] {
  const [dx, dy] = [(to[0] as number) - (from[0] as number), (to[1] as number) - (from[1] as number)];
  const d = Math.hypot(dx, dy);
  return d > 1e-6 ? [dx / d, dy / d] : [1, 0];
}

// Standing still, a unit faces the nearest foe still standing.
function facingFoe(
  battle: StageBattle,
  u: StageUnit,
  at: [number, number],
  middle: (t: Pair) => [number, number],
): [number, number] | undefined {
  let best: { d: number; at: [number, number] } | undefined;
  for (const o of battle.units) {
    if (o.side === u.side || o.status !== 'active') continue;
    const there = middle(o.at);
    const d = Math.hypot(there[0] - at[0], there[1] - at[1]);
    if (!best || d < best.d) best = { d, at: there };
  }
  return best ? toward(at, best.at) : undefined;
}

function healthBar(g: OffscreenCanvasRenderingContext2D, cam: Cam, u: StageUnit, [x, y]: [number, number]): void {
  const top = u.status === 'active' ? UNIT_TOP : LYING_TOP;
  const [sx, sy] = project(cam, x, y, top + 0.18);
  const [w, h] = BAR;
  g.fillStyle = palette.figureEdge;
  g.fillRect(sx - w / 2 - 1, sy - h - 1, w + 2, h + 2);
  g.fillStyle = u.side === 'crew' ? palette.good : palette.bad;
  g.fillRect(sx - w / 2, sy - h, (w * Math.max(0, u.hp)) / Math.max(1, u.most), h);
  if (u.watch) {
    // On watch: a small chevron over the bar, in the accent the orders use.
    g.strokeStyle = palette.accent;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(sx - 4, sy - h - 7);
    g.lineTo(sx, sy - h - 3);
    g.lineTo(sx + 4, sy - h - 7);
    g.stroke();
  }
}

function outline(g: OffscreenCanvasRenderingContext2D, cam: Cam, [x, y]: Tile): void {
  const corners = [
    [x, y],
    [x + 1, y],
    [x + 1, y + 1],
    [x, y + 1],
  ].map(([cx, cy]) => project(cam, cx as number, cy as number, 0.02));
  g.strokeStyle = palette.accent;
  g.lineWidth = 2;
  g.beginPath();
  for (const [i, [sx, sy]] of corners.entries()) {
    if (i === 0) g.moveTo(sx, sy);
    else g.lineTo(sx, sy);
  }
  g.closePath();
  g.stroke();
}

function tracer(
  g: OffscreenCanvasRenderingContext2D,
  cam: Cam,
  from: [number, number],
  to: [number, number],
  hit: boolean,
): void {
  const [ax, ay] = project(cam, from[0], from[1], CHEST);
  const [bx, by] = project(cam, to[0], to[1], CHEST);
  g.save();
  g.strokeStyle = palette.tracer;
  g.globalAlpha = hit ? 1 : 0.5;
  g.lineWidth = 2;
  if (!hit) g.setLineDash([4, 4]);
  g.beginPath();
  g.moveTo(ax, ay);
  g.lineTo(bx, by);
  g.stroke();
  g.restore();
}
