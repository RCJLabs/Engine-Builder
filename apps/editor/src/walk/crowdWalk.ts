/**
 * NPCs walked by Detour's crowd (M6.2, D74, docs/specs/navigation.md#the-stage): one agent for each
 * NPC built near the player, sent where the sim's walk-to says, round the solids, each other and
 * the player. An NPC is there once it is within ARRIVED_M of the navmesh's point nearest its goal;
 * the arrival waits until the sim has heard it. One that isn't built keeps where it last stood.
 * M6.3 (D75, docs/specs/ai.md#the-world-module-at-version-4): one following keeps its distance from
 * the player, one standing with `facing` turns to them, and one built after the walk began (it came
 * into the rings, or went and came back) starts at its goal, its arrival said at once, or beside
 * the player it follows: a far NPC is wherever its schedule says.
 * M6.4 (D76, docs/specs/combat.md#an-npc-fighting): one sent to attack keeps the distance `keep` gives
 * it from the player, as a follower keeps its own, and faces them, backing off to it when `keep` says
 * so (one waiting its turn); one fallen leaves the crowd and lies where it fell.
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
/** A follower sets off again once this far past its distance, and walks anew once the player has moved this far. */
const FOLLOW_SLACK_M = 0.5;

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
  /** M6.3: the metres it keeps from the player it follows. */
  readonly follow?: number;
  /** M6.3: standing, turned to the player. */
  readonly facing?: 'player';
  /** M6.4: its turn among those sent to attack the player, and fallen. */
  readonly fight?: number;
  readonly down?: true;
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
  /** Walking to a goal or after the player, standing, not built and so not walked, or fallen. */
  readonly state: 'walking' | 'standing' | 'away' | 'down';
  readonly follow?: number;
  readonly facing?: true;
  readonly fight?: number;
}

/** The metres a fighter keeps from the player, and whether it backs away to them when nearer. */
export interface Keep {
  readonly distance: number;
  readonly away?: boolean;
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
  follow: number | undefined;
  facing: boolean;
  fight: number | undefined;
  down: boolean;
  /** Built as the walk began, where it stood: any other is built at its goal. */
  stood: boolean;
}

const across = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);

export function createCrowdWalk(
  nav: NavWorld,
  npcs: readonly CrowdNpc[],
  places: (path: string) => Vec3 | undefined,
  told: Readonly<Record<string, NpcTold>>,
  begun: (path: string) => boolean = () => true,
  /** What an NPC sent to attack keeps from the player (M6.4): its reach when engaged, else farther off, backing away. */
  keep: (actor: string) => Keep = () => ({ distance: 1 }),
): CrowdWalk {
  const crowd: NavCrowd = nav.crowd();
  const arrivals = new Map<string, string>();
  let player: Agent | null = null;
  let playerAt: Vec3 | undefined;
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
        follow: undefined,
        facing: false,
        fight: undefined,
        down: was?.down === true,
        stood: begun(npc.path),
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
      const said = Object.hasOwn(next, w.npc.actor) ? next[w.npc.actor] : undefined;
      if (said?.down === true && !w.down) fell(w);
      if (w.down) continue;
      w.facing = said?.facing === 'player';
      w.fight = said?.fight;
      if (said?.follow !== w.follow) {
        w.follow = said?.follow;
        w.target = undefined;
        w.agent?.stop();
      }
      if (said?.goal === w.goal) continue;
      w.goal = said?.goal;
      w.reached = undefined;
      send(w);
    }
  };
  /** Where one built late starts: at its goal's point, said arrived at once, or beside the player it follows. */
  const builtLate = (w: Walking) => {
    const goalAt = w.goal === undefined ? undefined : places(w.goal);
    const near = goalAt ? nav.closest(goalAt) : w.follow !== undefined && playerAt ? nav.closest(playerAt) : null;
    if (!near) return;
    w.at = near;
    if (w.goal !== undefined) {
      w.reached = w.goal;
      arrivals.set(w.npc.actor, w.goal);
    }
  };
  /** A follower, or a fighter, walks to the player while past its distance and slack, and stands once within it. */
  const follow = (w: Walking, feet: Vec3) => {
    const kept = w.follow === undefined && w.fight !== undefined ? keep(w.npc.actor) : undefined;
    const distance = w.follow ?? kept?.distance;
    if (distance === undefined || !w.agent) return;
    const off = across(w.at, feet);
    if (kept?.away && off < distance - FOLLOW_SLACK_M) {
      backOff(w, feet, distance, off);
    } else if (off <= distance) {
      if (w.target) w.agent.stop();
      w.target = undefined;
    } else if (off > distance + FOLLOW_SLACK_M && (!w.target || across(w.target, feet) > FOLLOW_SLACK_M)) {
      w.target = w.agent.walkTo(feet) ?? undefined;
    }
  };
  /** Walks away from the player to `distance`, on the navmesh, unless already on its way there. */
  const backOff = (w: Walking, feet: Vec3, distance: number, off: number) => {
    if (!w.agent || (w.target && across(w.target, feet) >= distance - FOLLOW_SLACK_M)) return;
    const k = off > 0.01 ? distance / off : 0;
    const away: Vec3 =
      off > 0.01 ? [feet[0] + (w.at[0] - feet[0]) * k, w.at[1], feet[2] + (w.at[2] - feet[2]) * k] : w.at;
    const near = nav.closest(away);
    w.target = near ? (w.agent.walkTo(near) ?? undefined) : undefined;
  };
  /** Fallen: out of the crowd, where it stands now, never walked again. */
  const fell = (w: Walking) => {
    w.down = true;
    if (w.agent) {
      w.at = w.agent.at();
      crowd.remove(w.agent);
      w.agent = null;
    }
    w.target = undefined;
    w.goal = undefined;
    w.follow = undefined;
    w.fight = undefined;
  };
  goalsFrom(told);

  return {
    told: goalsFrom,
    present(paths) {
      for (const w of walking.values()) {
        const here = paths.has(w.npc.path) && !w.down;
        if (here && !w.agent) {
          if (!w.stood) builtLate(w);
          w.agent = crowd.add(w.at, w.npc.radius, w.npc.height);
          if (w.reached !== w.goal || w.goal === undefined) send(w);
        } else if (!here && w.agent) {
          // Where it stands is w.at already: step keeps it after each of the crowd's steps.
          crowd.remove(w.agent);
          w.agent = null;
          w.stood = false;
        }
      }
    },
    step(dt, feet) {
      if (![...walking.values()].some((w) => w.agent)) return;
      player ??= crowd.add(feet, PLAYER.radius, PLAYER.height, true);
      player.place(feet);
      playerAt = feet;
      for (const w of walking.values()) follow(w, feet);
      crowd.step(dt);
      for (const w of walking.values()) {
        if (!w.agent) continue;
        w.at = w.agent.at();
        const v = w.agent.velocity();
        if (Math.hypot(v[0], v[2]) > TURNING) w.yaw = yawToward(w.at, [w.at[0] + v[0], w.at[1], w.at[2] + v[2]]);
        else if (w.facing || w.fight !== undefined) w.yaw = yawToward(w.at, feet);
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
        state: w.down ? 'down' : !w.agent ? 'away' : w.target ? 'walking' : 'standing',
        ...(w.follow !== undefined ? { follow: w.follow } : {}),
        ...(w.facing ? { facing: true as const } : {}),
        ...(w.fight !== undefined ? { fight: w.fight } : {}),
      })),
    free: () => crowd.free(),
  };
}
