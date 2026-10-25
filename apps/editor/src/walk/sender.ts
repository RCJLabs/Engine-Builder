/**
 * The zones' triggers as the walk sends them (M5.8, D70, docs/specs/movement.md#the-stage): each
 * fixed step, the zones the capsule is in; a zone entered sends world/trigger, and what the sim made
 * of it comes back to decide whether it is sent again (zones.ts). It goes through the walk's outbox
 * (M5.9), behind any world/at on its way: sent beside one, the shell would drop it.
 */
import type { Sent } from '@eb/ui';
import type { Vec3 } from '../spaces/vec.ts';
import type { Outbox } from './outbox.ts';
import { BODY } from './physics.ts';
import type { Zone } from './solids.ts';
import { answered, inZone, stepZones, type ZoneState } from './zones.ts';

export interface SentTrigger {
  readonly object: string;
  readonly sent: Sent | 'waiting';
}

export interface Sender {
  /** One fixed step's zones, with the feet where the step left them. */
  step(feet: Vec3): void;
  /** The zones the character is in now. */
  readonly inside: readonly string[];
  /** Each trigger sent, in order, and its answer once it came. */
  sent(): SentTrigger[];
  /** The zones heard from now on (M5.10): those of the objects built. */
  zones(next: readonly Zone[]): void;
  /** How many zones are heard. */
  readonly heard: number;
}

export function createSender(space: string, outbox: Outbox, first: readonly Zone[]): Sender {
  let zones = first;
  let states: ReadonlyMap<string, ZoneState> = new Map();
  let inside: string[] = [];
  const sent: { object: string; sent: Sent | 'waiting' }[] = [];
  const send = (object: string) => {
    const entry: { object: string; sent: Sent | 'waiting' } = { object, sent: 'waiting' };
    sent.push(entry);
    void outbox.post({ type: 'world/trigger', space, object }).then((answer) => {
      entry.sent = answer;
      states = answered(states, object, answer);
    });
  };
  return {
    step(feet) {
      const body = { feet, height: BODY.height, radius: BODY.radius };
      inside = zones.filter((zone) => inZone(zone, body)).map((zone) => zone.path);
      const step = stepZones(states, new Set(inside));
      states = step.states;
      for (const object of step.send) send(object);
    },
    get inside() {
      return inside;
    },
    sent: () => sent.map((s) => ({ ...s })),
    zones(next) {
      zones = next;
    },
    get heard() {
      return zones.length;
    },
  };
}
