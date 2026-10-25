/**
 * Trigger zones as the character walks through them (M5.8, D70, docs/specs/movement.md#the-stage):
 * whether the capsule is in each, and what to send. A zone entered is sent once; one the sim refuses
 * is not sent again until the character leaves and comes back; one dropped, as a step was on its way,
 * is sent again the next step it is still in.
 */
import type { Sent } from '@eb/ui';
import { rotate, sub, type Vec3 } from '../spaces/vec.ts';
import type { Zone } from './solids.ts';

/** The character's capsule: where its feet are, how tall and how wide. */
export interface Body {
  readonly feet: Vec3;
  readonly height: number;
  readonly radius: number;
}

const inverse = (q: readonly [number, number, number, number]) => [-q[0], -q[1], -q[2], q[3]] as const;

function holds(zone: Zone, p: Vec3): boolean {
  if (zone.kind === 'ball') {
    const d = sub(p, zone.center);
    return d[0] * d[0] + d[1] * d[1] + d[2] * d[2] <= zone.radius * zone.radius;
  }
  const local = rotate(inverse(zone.turn), sub(p, zone.center));
  return local.every((v, i) => Math.abs(v) <= (zone.half[i] as number));
}

/** Whether the capsule is in the zone: its lowest point, its middle or its highest is inside it. */
export function inZone(zone: Zone, body: Body): boolean {
  const [x, y, z] = body.feet;
  const low: Vec3 = [x, y + body.radius, z];
  const middle: Vec3 = [x, y + body.height / 2, z];
  const high: Vec3 = [x, y + body.height - body.radius, z];
  return holds(zone, low) || holds(zone, middle) || holds(zone, high);
}

/** Each zone's state: out of it, in it with its trigger on its way, or in it and answered. */
export type ZoneState = 'out' | 'sending' | 'in';

export interface ZoneStep {
  readonly states: ReadonlyMap<string, ZoneState>;
  /** The zones to send, entered this step or dropped and still in. */
  readonly send: readonly string[];
}

/** One fixed step: the zones the capsule is in now, against what was. */
export function stepZones(states: ReadonlyMap<string, ZoneState>, inside: ReadonlySet<string>): ZoneStep {
  const next = new Map<string, ZoneState>();
  const send: string[] = [];
  for (const path of [...inside].sort()) {
    const was = states.get(path) ?? 'out';
    if (was === 'out') {
      next.set(path, 'sending');
      send.push(path);
    } else next.set(path, was);
  }
  return { states: next, send };
}

/**
 * What the sim made of a zone's trigger. Taken or refused, it stays in until the character leaves;
 * dropped, it is out again, so the next step it is still in sends it again.
 */
export function answered(states: ReadonlyMap<string, ZoneState>, path: string, sent: Sent): Map<string, ZoneState> {
  const next = new Map(states);
  if (next.get(path) !== 'sending') return next;
  if (sent === 'dropped') next.set(path, 'out');
  else next.set(path, 'in');
  return next;
}
