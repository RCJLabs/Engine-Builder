/**
 * A step's beats played back on a 2D stage (M7.5, D87, docs/specs/tactics.md#the-stage; after space-wrecked's
 * src/render/playback.js): a move walked a tile at a time, a shot held long enough to see its line, and the
 * rest at once, in the order the sim told them. The foes' whole turn is one step's beats. Plain functions of
 * the beats and the time since they began; under reduced motion everything is at once. The sim has already
 * decided all of it: this only shows it.
 */
import type { Beat, Tile } from '@eb/core';
import type { UnitStatus as Status } from '@eb/kits';

/** Milliseconds a walker takes a tile, and a shot is shown. */
export const TILE_MS = 160;
export const SHOT_MS = 420;

export interface Act {
  readonly beat: Beat;
  /** When it starts and how long it takes, in milliseconds from the first. */
  readonly at: number;
  readonly ms: number;
}

/** The acts the beats make, end to end. */
export function actsOf(beats: readonly Beat[], still: boolean): Act[] {
  const acts: Act[] = [];
  let at = 0;
  for (const beat of beats) {
    const kind = beat.type.replace(/^tactics\//, '');
    const path = kind === 'moved' && Array.isArray(beat.path) ? (beat.path as Tile[]) : [];
    const ms = still ? 0 : kind === 'moved' ? Math.max(0, path.length - 1) * TILE_MS : kind === 'shot' ? SHOT_MS : 0;
    acts.push({ beat, at, ms });
    at += ms;
  }
  return acts;
}

export const lengthOf = (acts: readonly Act[]): number => {
  const last = acts.at(-1);
  return last ? last.at + last.ms : 0;
};

/** A unit as playback shows it: where it stands, in tiles (between two while it walks), and how it is. */
export interface Shown {
  readonly at: readonly [number, number];
  readonly status: Status;
  readonly hp: number;
}

export interface Played {
  readonly units: ReadonlyMap<string, Shown>;
  /** The shot being shown, shooter to target, and whether it hit. */
  readonly shot?: { readonly from: string; readonly to: string; readonly hit: boolean };
  /** The acts begun so far: their lines are said. */
  readonly begun: number;
  readonly done: boolean;
}

const STATUS_OF: Readonly<Record<string, Status>> = { down: 'down', dead: 'dead', out: 'out', steadied: 'stable' };

/** Where `path` has a walker `ms` into a walk of TILE_MS a tile. */
function along(path: readonly Tile[], ms: number): readonly [number, number] {
  const k = Math.min(path.length - 1, ms / TILE_MS);
  const i = Math.floor(k);
  const [a, b] = [path[i] as Tile, path[Math.min(i + 1, path.length - 1)] as Tile];
  const f = k - i;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/** The units `t` ms into the acts, from where they stood before them. */
export function playAt(acts: readonly Act[], before: ReadonlyMap<string, Shown>, t: number): Played {
  const units = new Map(before);
  let shot: Played['shot'];
  let begun = 0;
  for (const { beat, at, ms } of acts) {
    if (t < at) break;
    begun++;
    const kind = beat.type.replace(/^tactics\//, '');
    const unit = typeof beat.unit === 'string' ? beat.unit : undefined;
    const was = unit === undefined ? undefined : units.get(unit);
    if (kind === 'moved' && was) units.set(unit as string, { ...was, at: along(beat.path as Tile[], t - at) });
    if (kind === 'shot' && unit !== undefined && t < at + ms)
      shot = { from: unit, to: beat.target as string, hit: beat.hit === true };
    if (kind === 'shot' && typeof beat.damage === 'number') {
      const hurt = units.get(beat.target as string);
      if (hurt && t >= at + ms) units.set(beat.target as string, { ...hurt, hp: Math.max(0, hurt.hp - beat.damage) });
    }
    const status = kind === 'out' && beat.dead === true ? 'dead' : STATUS_OF[kind];
    if (status && was) units.set(unit as string, { ...(units.get(unit as string) ?? was), status });
  }
  return { units, ...(shot ? { shot } : {}), begun, done: t >= lengthOf(acts) };
}
