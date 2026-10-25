/**
 * What the NPCs near the player sense (M6.3, D75, docs/specs/ai.md#perception): five times a second
 * of walking, each built NPC with a behaviour sees the player whose chest is within its sight, inside
 * half its cone of the way it faces, with a clear ray from its eyes; and hears the player's noises
 * within both the noise's reach and its hearing. Once a second of walking it says so to the sim as
 * ai/sensed, through the outbox. The time is the walk's own, so a pause or a hidden page senses nothing.
 * Plain logic: the ray and the NPCs are handed in, so Node's tests sense as the page does.
 */
import type { Action } from '@eb/core';
import type { Vec3 } from '../spaces/vec.ts';
import type { Clear } from './cameras.ts';
import { shortest, yawToward } from './facing.ts';

export const LOOK_MS = 200;
export const REPORT_MS = 1000;
/** The player's chest, from their feet. */
export const CHEST_M = 1.2;
/** Eyes, as a share of the NPC's height. */
export const EYES = 0.9;
/** How far each of the player's noises carries. */
export const NOISES = { run: 6, land: 5, use: 4 } as const;
export type Noise = keyof typeof NOISES;
/** A ray that stops this close to the chest met the player, not a wall. */
const BODY_M = 0.5;

/** An NPC that senses, as the pack's actor record says. */
export interface Senser {
  readonly actor: string;
  readonly path: string;
  /** Metres; 0 is blind. */
  readonly sight: number;
  /** Degrees across. */
  readonly cone: number;
  /** Metres; 0 is deaf. */
  readonly hearing: number;
  readonly height: number;
  readonly radius: number;
}

/** Where a built NPC stands and faces now. */
export interface Standing {
  readonly path: string;
  readonly at: Vec3;
  readonly yaw: number;
}

export interface Senses {
  /** One frame's walking: looks when due, and the report when one is due. `built` is read only to look. */
  frame(ms: number, feet: Vec3, built: () => readonly Standing[], clear: Clear): Action | null;
  /** A noise the player made, at their feet. Running counts once a report. */
  noise(kind: Noise, feet: Vec3, built: () => readonly Standing[]): void;
  /** What the last looks found, for the hook. */
  seen(): ReadonlyMap<string, readonly number[]>;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const length = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);

/** Whether `npc` sees the chest now: how far, in centimetres, or null. */
export function sight(npc: Senser, standing: Standing, feet: Vec3, clear: Clear): number | null {
  if (npc.sight <= 0) return null;
  const eyes: Vec3 = [standing.at[0], standing.at[1] + npc.height * EYES, standing.at[2]];
  const chest: Vec3 = [feet[0], feet[1] + CHEST_M, feet[2]];
  const to = sub(chest, eyes);
  const d = length(to);
  if (d > npc.sight || d === 0) return null;
  if (Math.abs(shortest(standing.yaw, yawToward(standing.at, feet))) > npc.cone / 2) return null;
  const dir: Vec3 = [to[0] / d, to[1] / d, to[2] / d];
  // From just outside its own body, so the ray doesn't start inside the NPC's capsule.
  const skin = npc.radius + 0.05;
  const from: Vec3 = [eyes[0] + dir[0] * skin, eyes[1] + dir[1] * skin, eyes[2] + dir[2] * skin];
  const hit = clear(from, dir, d - skin);
  return hit === null || hit >= d - skin - BODY_M ? Math.round(d * 100) : null;
}

export function createSenses(space: string, sensers: readonly Senser[]): Senses {
  const byPath = new Map(sensers.map((s) => [s.path, s]));
  let [sinceLook, sinceReport] = [0, 0];
  let seenNow = new Map<string, number[]>();
  let heard = new Map<string, number>();
  let ran = false;
  let last = new Map<string, readonly number[]>();
  const hear = (kind: Noise, feet: Vec3, built: () => readonly Standing[]) => {
    for (const standing of built()) {
      const npc = byPath.get(standing.path);
      if (!npc || npc.hearing <= 0) continue;
      const d = length(sub(feet, standing.at));
      if (d <= Math.min(NOISES[kind], npc.hearing)) heard.set(npc.actor, (heard.get(npc.actor) ?? 0) + 1);
    }
  };
  const report = (ms: number): Action => {
    const npcs: Record<string, { seen?: number[]; heard?: number }> = {};
    for (const npc of sensers) {
      const seen = seenNow.get(npc.actor) ?? [];
      const noises = heard.get(npc.actor) ?? 0;
      if (seen.length > 0 || noises > 0) {
        npcs[npc.actor] = { ...(seen.length > 0 ? { seen } : {}), ...(noises > 0 ? { heard: noises } : {}) };
      }
    }
    last = seenNow;
    [seenNow, heard, ran] = [new Map(), new Map(), false];
    return { type: 'ai/sensed', space, ms: Math.round(ms), npcs };
  };
  return {
    frame(ms, feet, built, clear) {
      if (sensers.length === 0) return null;
      sinceLook += ms;
      sinceReport += ms;
      if (sinceLook >= LOOK_MS) {
        sinceLook %= LOOK_MS;
        for (const standing of built()) {
          const npc = byPath.get(standing.path);
          const cm = npc ? sight(npc, standing, feet, clear) : null;
          if (npc && cm !== null) seenNow.set(npc.actor, [...(seenNow.get(npc.actor) ?? []), cm]);
        }
      }
      if (sinceReport < REPORT_MS) return null;
      const covered = Math.min(sinceReport, 2000);
      sinceReport = 0;
      return report(covered);
    },
    noise(kind, feet, built) {
      if (kind === 'run') {
        if (ran) return;
        ran = true;
      }
      hear(kind, feet, built);
    },
    seen: () => last,
  };
}
