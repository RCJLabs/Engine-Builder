/**
 * Where the NPCs stand, told to the sim (M6.2, D74, docs/specs/navigation.md#goals-and-arrivals):
 * world/npcs-at, through the outbox with the walk's other steps. An arrival goes at once and is said
 * again with each later one until the sim takes it: refused, under a talk say, it waits a second.
 * The stands go as the player's do (stood.ts): every 5 s once one has moved 0.5 m, as the shell
 * pauses and the page hides.
 */
import type { Action } from '@eb/core';
import type { Sent, SpaceAsk } from '@eb/ui';
import type { WalkingNpc } from './crowdWalk.ts';
import type { Outbox } from './outbox.ts';
import { dueAt, standing, type Told } from './stood.ts';

/** How long a refused arrival waits before it is said again. */
export const AGAIN_MS = 1000;

export interface NpcTell {
  /** Each frame: arrivals at once, the stands when due. */
  frame(list: readonly WalkingNpc[], arrivals: ReadonlyMap<string, string>, now: number): void;
  /** Said now: the shell's pause, the page hidden. */
  stand(list: readonly WalkingNpc[], arrivals: ReadonlyMap<string, string>, now: number): void;
  /** Each world/npcs-at sent, for the hook: its arrivals and what the sim made of it. */
  sent(): { readonly arrived: Readonly<Record<string, string>>; readonly sent: Sent | 'waiting' }[];
}

/** The action: each NPC's feet and yaw as the sim keeps them (stood.ts's rounding), and its arrival. */
export function npcsAt(space: string, list: readonly WalkingNpc[], arrivals: ReadonlyMap<string, string>): Action {
  const npcs: Record<string, unknown> = {};
  for (const npc of list) {
    const stood = standing(space, npc.at, npc.yaw ?? 0);
    const arrived = arrivals.get(npc.actor);
    npcs[npc.actor] = { feet: stood.feet, yaw: stood.yaw, ...(arrived !== undefined ? { arrived } : {}) };
  }
  return { type: 'world/npcs-at', space, npcs };
}

export function createNpcTell(
  ask: Pick<SpaceAsk, 'space' | 'here'>,
  outbox: Outbox,
  heard: (actor: string, goal: string) => void,
): NpcTell {
  const told = new Map<string, Told>();
  /** Arrivals on their way, by "actor goal", so one isn't sent twice at once. */
  const flying = new Set<string>();
  let waitUntil = 0;
  const log: { arrived: Readonly<Record<string, string>>; sent: Sent | 'waiting' }[] = [];
  const keyOf = (actor: string, goal: string) => `${actor} ${goal}`;

  const say = (list: readonly WalkingNpc[], arrivals: ReadonlyMap<string, string>, at: number) => {
    if (!ask.here() || list.length === 0) return;
    for (const npc of list) told.set(npc.actor, { feet: npc.at, time: at });
    const carried = [...arrivals];
    for (const [actor, goal] of carried) flying.add(keyOf(actor, goal));
    const entry: { arrived: Record<string, string>; sent: Sent | 'waiting' } = {
      arrived: Object.fromEntries(carried),
      sent: 'waiting',
    };
    log.push(entry);
    void outbox.post(npcsAt(ask.space, list, arrivals)).then((sent) => {
      entry.sent = sent;
      for (const [actor, goal] of carried) {
        flying.delete(keyOf(actor, goal));
        if (sent === 'accepted') heard(actor, goal);
      }
      if (sent !== 'accepted' && carried.length > 0) waitUntil = performance.now() + AGAIN_MS;
    });
  };
  // One first seen counts as told where it stands: a load put it there, or its placement did.
  const moved = (npc: WalkingNpc, at: number) => {
    const last = told.get(npc.actor);
    if (!last) told.set(npc.actor, { feet: npc.at, time: at });
    return last !== undefined && dueAt(last, npc.at, at);
  };

  return {
    frame(list, arrivals, at) {
      const fresh = [...arrivals].some(([actor, goal]) => !flying.has(keyOf(actor, goal)));
      if ((fresh && at >= waitUntil) || list.some((npc) => moved(npc, at))) say(list, arrivals, at);
      outbox.pump();
    },
    stand(list, arrivals, at) {
      say(list, arrivals, at);
      outbox.pump();
    },
    sent: () => log.map((e) => ({ ...e })),
  };
}
