/**
 * The senses in a walk (M6.3, D75, docs/specs/ai.md#perception): which NPCs of the space sense, from
 * the pack's actor records (a behaviour, and sight, cone and hearing or the kit's defaults); the
 * player's noises read off the walk each frame (running, landing from a fall, Interact); and the
 * reports sent through the outbox while the game's mode runs it. One report waits at a time (M7.1):
 * those made meanwhile are held as one, merged within what the sim takes, so a slow phone's outbox
 * never queues them up ahead of a use.
 */
import type { Action, PackWorld } from '@eb/core';
import { CONE_DEG, HEARING_M, SENSED_MOST, SIGHT_M } from '@eb/kits';
import type { Sent } from '@eb/ui';
import { FIGURE } from '../spaces/figureLook.ts';
import type { Vec3 } from '../spaces/vec.ts';
import type { Clear } from './cameras.ts';
import type { Intent } from './controls.ts';
import { KEPT } from './gameClock.ts';
import type { Outbox } from './outbox.ts';
import { createSenses, type Senser, type Standing } from './senses.ts';
import type { WalkSpace } from './world.ts';

/** Off the ground this long, landing is a noise: a step down isn't. */
const FALL_S = 0.3;

const number = (value: unknown, fallback: number) => (typeof value === 'number' ? value : fallback);

/** The NPCs placed in this space whose actor has a behaviour, with their senses. */
export function sensersIn(world: PackWorld, space: WalkSpace): Senser[] {
  return Object.entries(world.actors ?? {}).flatMap(([actor, placed]) => {
    if (placed.space !== space.id) return [];
    const record = world.records[`actor:${actor}`] as Record<string, unknown> | undefined;
    if (typeof record?.behaviour !== 'string') return [];
    const height = space.npcs(`actor:${actor}`, [])?.height ?? FIGURE.height;
    return [
      {
        actor,
        path: placed.path,
        sight: number(record.sight, SIGHT_M),
        cone: number(record.cone, CONE_DEG),
        hearing: number(record.hearing, HEARING_M),
        height,
        radius: FIGURE.radius,
      },
    ];
  });
}

type Sensing = { readonly seen?: readonly number[]; readonly heard?: number };

/**
 * Two ai/sensed reports of a space as one: their time added, each NPC's sightings and noises joined,
 * kept within what the sim takes (the newest sightings kept), so the gains of both still count.
 */
export function mergeSensed(older: Action, newer: Action): Action {
  const npcs: Record<string, Sensing> = { ...(older.npcs as Record<string, Sensing>) };
  for (const [actor, now] of Object.entries(newer.npcs as Record<string, Sensing>)) {
    const was = npcs[actor] ?? {};
    const seen = [...(was.seen ?? []), ...(now.seen ?? [])].slice(-SENSED_MOST.sightings);
    const heard = Math.min((was.heard ?? 0) + (now.heard ?? 0), SENSED_MOST.noises);
    npcs[actor] = { ...(seen.length > 0 ? { seen } : {}), ...(heard > 0 ? { heard } : {}) };
  }
  const ms = Math.min((older.ms as number) + (newer.ms as number), SENSED_MOST.ms);
  return { ...newer, ms, npcs };
}

export interface WalkSenses {
  frame(ms: number, feet: Vec3, intent: Intent, grounded: boolean): void;
  /** For the hook: each report sent, what the sim made of it, and the last looks. */
  hook(): {
    readonly sent: readonly { readonly npcs: object; readonly sent: Sent | 'waiting' }[];
    readonly seen: Readonly<Record<string, readonly number[]>>;
  };
}

export function createWalkSenses(
  space: WalkSpace,
  world: PackWorld,
  outbox: Outbox,
  running: () => boolean,
  built: () => readonly Standing[],
  clear: Clear,
): WalkSenses | null {
  const sensers = sensersIn(world, space);
  if (sensers.length === 0) return null;
  const senses = createSenses(space.id, sensers);
  const log: { npcs: object; sent: Sent | 'waiting' }[] = [];
  let [air, using] = [0, false];
  let waiting = false;
  let held: Action | undefined;
  const post = (action: Action) => {
    if (waiting) {
      held = held ? mergeSensed(held, action) : action;
      return;
    }
    waiting = true;
    const entry: { npcs: object; sent: Sent | 'waiting' } = { npcs: action.npcs as object, sent: 'waiting' };
    log.push(entry);
    if (log.length > KEPT) log.shift();
    void outbox.post(action).then((sent) => {
      entry.sent = sent;
      waiting = false;
      const next = held;
      held = undefined;
      if (next && running()) post(next);
    });
    outbox.pump();
  };
  return {
    frame(ms, feet, intent, grounded) {
      if (!running()) return;
      const moving = Math.hypot(intent.move[0], intent.move[1]) > 0.1;
      if (intent.run && moving && grounded) senses.noise('run', feet, built);
      if (grounded && air >= FALL_S) senses.noise('land', feet, built);
      air = grounded ? 0 : air + ms / 1000;
      if (intent.use && !using) senses.noise('use', feet, built);
      using = intent.use;
      const report = senses.frame(ms, feet, built, clear);
      if (report) post(report);
    },
    hook: () => ({ sent: log.map((e) => ({ ...e })), seen: Object.fromEntries(senses.seen()) }),
  };
}
