/**
 * NPCs walked by Detour's crowd (M6.2, D74, docs/specs/navigation.md#the-stage): one agent for each
 * NPC built near the player, sent where the sim's walk-to says, round the solids, each other and
 * the player. An NPC is there once it is within ARRIVED_M of the navmesh's point nearest its goal;
 * the arrival waits until the sim has heard it. One that isn't built keeps where it last stood.
 * Plain logic over nav/lib.ts, so Node's tests walk the crowd the page does.
 */
import type { Agent, NavCrowd, NavWorld } from '../nav/lib.ts';
import type { Vec3 } from '../spaces/vec.ts';
import { yawToward } from './facing.ts';

export const ARRIVED_M = 0.5;
/** Slower than this, an NPC keeps the way it faced. */
const TURNING = 0.1;
/** The player's body, for the crowd to go round: physics.ts's BODY. */
const PLAYER = { radius: 0.35, height: 1.8 };

/** An NPC the crowd can walk: its object's path, its actor, where it was placed, its body. */
export interface CrowdNpc {
  readonly path: string;
  readonly actor: string;
  readonly placed: Vec3;
  readonly radius: number;
  readonly height: number;
}

/** What the sim keeps of an NPC (the world module's slice, M6.2). */
export interface NpcTold {
  readonly feet?: readonly [number, number, number];
  readonly yaw?: number;
  readonly goal?: string;
  readonly arrived?: string;
}

export interface WalkingNpc {
  readonly actor: string;
  readonly path: string;
  readonly at: Vec3;
  readonly velocity: Vec3;
  /** The way it faces, once it has walked or a load said so. */
  readonly yaw: number | undefined;
  readonly goal?: string;
  /** The navmesh's point it walks to. */
  readonly target?: Vec3;
  /** Walking to a goal, standing, or not built and so not walked. */
  readonly state: 'walking' | 'standing' | 'away';
}

export interface CrowdWalk {
  /** The sim's word after each step: the goals walk-to gave. */
  told(next: Readonly<Record<string, NpcTold>>): void;
  /** The NPCs built now, by path: an agent for each new one, the gone keeping where they stood. */
  present(paths: ReadonlySet<string>): void;
  /** One fixed step, the player's feet where the others go round them. */
  step(dt: number, player: Vec3): void;
  /** The arrivals the sim hasn't heard, by actor. */
  arrivals(): ReadonlyMap<string, string>;
  heard(actor: string, goal: string): void;
  list(): WalkingNpc[];
  free(): void;
}

interface Walking {
  readonly npc: CrowdNpc;
  agent: Agent | null;
  at: Vec3;
  yaw: number | undefined;
  goal: string | undefined;
  target: Vec3 | undefined;
  /** The goal it last got to, so a goal is arrived at once. */
  reached: string | undefined;
}

const across = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export function createCrowdWalk(
  nav: NavWorld,
  npcs: readonly CrowdNpc[],
  places: (path: string) => Vec3 | undefined,
  told: Readonly<Record<string, NpcTold>>,
): CrowdWalk {
  const crowd: NavCrowd = nav.crowd();
  const arrivals = new Map<string, string>();
  let player: Agent | null = null;
  const walking = new Map<string, Walking>(
    npcs.map((npc) => {
      const was = Object.hasOwn(told, npc.actor) ? told[npc.actor] : undefined;
      const at: Vec3 = was?.feet ? [was.feet[0], was.feet[1], was.feet[2]] : npc.placed;
      const state: Walking = {
        npc,
        agent: null,
        at,
        yaw: was?.yaw,
        goal: undefined,
        target: undefined,
        reached: undefined,
      };
      return [npc.actor, state];
    }),
  );
  const send = (w: Walking) => {
    const to = w.goal === undefined ? undefined : places(w.goal);
    w.target = to && w.agent ? (w.agent.walkTo(to) ?? undefined) : undefined;
    if (!w.target) w.agent?.stop();
  };
  const goalsFrom = (next: Readonly<Record<string, NpcTold>>) => {
    for (const w of walking.values()) {
      const goal = Object.hasOwn(next, w.npc.actor) ? next[w.npc.actor]?.goal : undefined;
      if (goal === w.goal) continue;
      w.goal = goal;
      w.reached = undefined;
      send(w);
    }
  };
  goalsFrom(told);

  return {
    told: goalsFrom,
    present(paths) {
      for (const w of walking.values()) {
        const here = paths.has(w.npc.path);
        if (here && !w.agent) {
          w.agent = crowd.add(w.at, w.npc.radius, w.npc.height);
          send(w);
        } else if (!here && w.agent) {
          w.at = w.agent.at();
          crowd.remove(w.agent);
          w.agent = null;
        }
      }
    },
    step(dt, feet) {
      if (![...walking.values()].some((w) => w.agent)) return;
      player ??= crowd.add(feet, PLAYER.radius, PLAYER.height, true);
      player.place(feet);
      crowd.step(dt);
      for (const w of walking.values()) {
        if (!w.agent) continue;
        w.at = w.agent.at();
        const v = w.agent.velocity();
        if (Math.hypot(v[0], v[2]) > TURNING) w.yaw = yawToward(w.at, [w.at[0] + v[0], w.at[1], w.at[2] + v[2]]);
        if (w.goal !== undefined && w.target && w.reached !== w.goal && across(w.at, w.target) < ARRIVED_M) {
          w.reached = w.goal;
          arrivals.set(w.npc.actor, w.goal);
          w.agent.stop();
          w.target = undefined;
        }
      }
    },
    arrivals: () => arrivals,
    heard(actor, goal) {
      if (arrivals.get(actor) === goal) arrivals.delete(actor);
    },
    list: () =>
      [...walking.values()].map((w) => ({
        actor: w.npc.actor,
        path: w.npc.path,
        at: w.agent ? w.agent.at() : w.at,
        velocity: w.agent ? w.agent.velocity() : [0, 0, 0],
        yaw: w.yaw,
        ...(w.goal !== undefined ? { goal: w.goal } : {}),
        ...(w.target ? { target: w.target } : {}),
        state: !w.agent ? 'away' : w.target ? 'walking' : 'standing',
      })),
    free: () => crowd.free(),
  };
}
