/**
 * The walk's fights (M6.4, D76, docs/specs/combat.md): the player's Attack swings or draws their
 * weapon, soft-aimed at the foe in front; an engaged NPC closes, winds up and strikes, or an archer
 * shoots from where it stands; every hit the swing or the arrow finds goes to the sim as
 * fighting/hit, which decides it. Fallen NPCs lie where they fell and are searched by Interact. All
 * on the walk's fixed steps, so a headless run in Node fights as the page does. Since M6.5 (D77) the
 * animators read each fighter's phase from here, which M6.4's leans stood in for.
 */
import type { Action } from '@eb/core';
import type { FightView, Sent, SpaceAsk, WeaponView } from '@eb/ui';
import { FIGURE } from '../spaces/figureLook.ts';
import { sub, type Vec3 } from '../spaces/vec.ts';
import { aimAt, type Foe, turnedToward } from './aim.ts';
import { type Arrow, aimedVelocity, loose, stepArrows } from './arrows.ts';
import type { Keep } from './crowdWalk.ts';
import { yawToward } from './facing.ts';
import { forwardOf } from './interact.ts';
import { STEP } from './motion.ts';
import type { Outbox } from './outbox.ts';
import { BODY, type Walker } from './physics.ts';
import type { UsePoint } from './solids.ts';
import { chestOf, reached, type Target } from './strike.ts';
import { phaseOf, type Swing, startSwing, stepSwing, struckBy, windupDone } from './swing.ts';

/** Metres an NPC sent to attack and not engaged keeps from the player: it waits its turn there. */
export const WAITING_M = 5;
/** An engaged melee NPC closes to its reach less this. */
const CLOSER_M = 0.3;
const MS = STEP * 1000;

/** An NPC of the space as the fight reads it: where it stands now, and whether it is drawn. */
export interface FightNpc {
  readonly actor: string;
  readonly path: string;
  readonly at: Vec3;
  readonly height: number;
  readonly here: boolean;
}

export interface FightTo {
  readonly walker: Walker;
  /** The NPCs of the space, wherever the crowd, or their placing, has them. */
  npcs(): readonly FightNpc[];
  bodies(uses: readonly UsePoint[]): void;
}

export interface WalkFight {
  readonly weapon: string;
  readonly swing: Swing['phase'] | null;
  readonly aimed: string | null;
  /** The NPCs the sim has fighting the player now, by turn: at most two. */
  readonly engaged: readonly string[];
  readonly npcs: readonly { readonly actor: string; readonly swing: Swing['phase'] | null; readonly down: boolean }[];
  readonly arrows: readonly { readonly by: string; readonly at: Vec3 }[];
  readonly sent: readonly { readonly action: Action; readonly sent: Sent | 'waiting' }[];
  readonly bodies: readonly { readonly actor: string; readonly label: string }[];
}

export interface FightStage {
  /** One fixed step: swings and arrows on, hits sent; the yaw soft aim turns the player to. */
  step(attack: boolean, feet: Vec3, yaw: number): number;
  /** Each frame: the fallen laid down, the bodies' uses. */
  frame(): void;
  /** What the crowd keeps a fighter at from the player: its reach engaged, 5 m and backing off waiting. */
  keep(actor: string): Keep;
  arrows(): readonly Arrow[];
  /** What an animator reads of a fighter (M6.5): its swing's or bow's phase, its weapon, its fall, a hit just taken. */
  anim(actor: string): FightAnim;
  /** Whether the object at this path is a body laid down: its solid stays out. */
  fell(path: string): boolean;
  hook(): WalkFight;
}

/** What anims.ts lays a fighter's anim.* facts from (docs/specs/animation.md#animators). */
export interface FightAnim {
  readonly swing: 'none' | Swing['phase'];
  readonly draw: 'none' | 'draw' | 'loose';
  readonly weapon: 'none' | 'melee' | 'ranged';
  readonly phase?: { readonly length: number; readonly at: number };
  readonly down: boolean;
  readonly hit: boolean;
}

/** Seconds anim.hit holds after a hit lands: the stock flinch's length. */
export const HIT_S = 0.4;

export function createFight(ask: SpaceAsk, outbox: Outbox, to: FightTo): FightStage | null {
  if (!ask.fight?.()) return null;
  const view = (): FightView | undefined => ask.fight?.();
  let swing: Swing | null = null;
  let aim: { foe: Foe; from: number } | null = null;
  const npcSwings = new Map<string, Swing>();
  let arrows: Arrow[] = [];
  const sent: { action: Action; sent: Sent | 'waiting' }[] = [];
  const laid = new Set<string>();
  // The step each actor was last hit on, once the sim took the hit: anim.hit (M6.5).
  let steps = 0;
  const struck = new Map<string, number>();

  const post = (action: Action): Promise<Sent> => {
    const entry: { action: Action; sent: Sent | 'waiting' } = { action, sent: 'waiting' };
    sent.push(entry);
    return outbox.post(action).then((result) => {
      entry.sent = result;
      return result;
    });
  };
  const weaponOf = (actor: string): WeaponView | undefined => view()?.weapons[actor];
  const fallen = (actor: string) => view()?.fallen.includes(actor) === true;
  const standing = () => to.npcs().filter((n) => n.here && !fallen(n.actor));
  const pathOf = (actor: string) => to.npcs().find((n) => n.actor === actor)?.path;
  const actorAt = (path: string) => to.npcs().find((n) => n.path === path)?.actor;
  const targetOf = (n: FightNpc): Target => ({ actor: n.actor, feet: n.at, height: n.height, radius: FIGURE.radius });
  const player = (feet: Vec3): Target => ({
    actor: view()?.player ?? '',
    feet,
    height: BODY.height,
    radius: BODY.radius,
  });

  /** Nothing but the target between two chests: `except` the one swinging, null for the player. */
  const clearTo = (from: Vec3, target: Target, except: string | null): boolean => {
    const at = chestOf(target.feet, target.height);
    const d = sub(at, from);
    const most = Math.hypot(...d);
    if (most < 1e-6) return true;
    const met = to.walker.cast(from, [d[0] / most, d[1] / most, d[2] / most], most, except);
    if (!met) return true;
    if (met.player === true) return target.actor === view()?.player;
    if (met.npc !== undefined && actorAt(met.npc) === target.actor) return true;
    return met.toi >= most - target.radius;
  };
  const hit = (by: string, on: string, weapon: string) =>
    void post({ type: 'fighting/hit', by, on, weapon }).then((result) => {
      if (result === 'accepted') struck.set(on, steps);
    });
  const shoot = (by: string, weapon: WeaponView, from: Vec3, at: Vec3 | undefined, yaw: number) => {
    const ahead = forwardOf(yaw);
    const aimAtPoint: Vec3 = at ?? [from[0] + ahead[0] * weapon.range, from[1], from[2] + ahead[1] * weapon.range];
    arrows.push(loose(by, weapon.item, from, aimedVelocity(from, aimAtPoint, weapon.speed)));
  };

  const playerStep = (attack: boolean, feet: Vec3, yaw: number): number => {
    const me = view()?.player;
    const weapon = me === undefined ? undefined : weaponOf(me);
    if (!me || !weapon || fallen(me)) return yaw;
    if (!swing && attack) {
      swing = startSwing(weapon);
      const foes = standing().map((n) => ({ actor: n.actor, path: n.path, at: n.at }));
      const foe = aimAt(foes, feet, yaw, weapon);
      aim = foe ? { foe, from: yaw } : null;
    }
    if (!swing) return yaw;
    const turned = aim ? turnedToward(aim.from, feet, aim.foe.at, windupDone(swing)) : yaw;
    const was = swing;
    const next = stepSwing(was, MS);
    swing = next.swing;
    const chest = chestOf(feet, BODY.height);
    if (next.loose) {
      const at = aim
        ? chestOf(aim.foe.at, to.npcs().find((n) => n.actor === aim?.foe.actor)?.height ?? FIGURE.height)
        : undefined;
      void post({ type: 'fighting/loosed', weapon: weapon.item }).then((result) => {
        if (result === 'accepted') shoot(me, weapon, chest, at, turned);
      });
    }
    if (next.striking && swing) {
      const wielder = { feet, height: BODY.height, yaw: turned };
      const targets = standing()
        .map(targetOf)
        .filter((t) => !swing?.struck.includes(t.actor));
      for (const t of reached(wielder, weapon, targets, (from, target) => clearTo(from, target, null))) {
        swing = struckBy(swing, t.actor);
        hit(me, t.actor, weapon.item);
      }
    }
    if (!swing) aim = null;
    return turned;
  };

  const npcStep = (n: FightNpc, feet: Vec3) => {
    const me = view()?.player;
    const weapon = weaponOf(n.actor);
    if (!me || !weapon || fallen(me)) return;
    let s = npcSwings.get(n.actor) ?? null;
    const target = player(feet);
    const chest = chestOf(n.at, n.height);
    const across = Math.hypot(feet[0] - n.at[0], feet[2] - n.at[2]);
    if (!s) {
      const near = weapon.kind === 'melee' ? across - BODY.radius <= weapon.reach : across <= weapon.range;
      if (near && clearTo(chest, target, n.path)) s = startSwing(weapon);
    }
    if (!s) return;
    const yaw = yawToward(n.at, feet);
    const next = stepSwing(s, MS);
    s = next.swing;
    if (next.loose) shoot(n.actor, weapon, chest, chestOf(feet, BODY.height), yaw);
    if (next.striking && s && !s.struck.includes(target.actor)) {
      const wielder = { feet: n.at, height: n.height, yaw };
      if (reached(wielder, weapon, [target], (from, t) => clearTo(from, t, n.path)).length > 0) {
        s = struckBy(s, target.actor);
        hit(n.actor, target.actor, weapon.item);
      }
    }
    if (s) npcSwings.set(n.actor, s);
    else npcSwings.delete(n.actor);
  };

  const arrowStep = () => {
    const me = view()?.player ?? '';
    const stepped = stepArrows(arrows, STEP, (from, dir, most, by) => {
      const met = to.walker.cast(from, dir, most, by === me ? null : (pathOf(by) ?? null));
      if (!met) return null;
      if (met.player === true) return { toi: met.toi, actor: me };
      const actor = met.npc === undefined ? undefined : actorAt(met.npc);
      return actor === undefined || fallen(actor) ? { toi: met.toi } : { toi: met.toi, actor };
    });
    arrows = stepped.flying;
    // An NPC's arrow landing after it fell or left the fight hurts no one: the sim would refuse it.
    const fighting = new Set(view()?.engaged ?? []);
    for (const h of stepped.hits) if (h.by === me || (fighting.has(h.by) && !fallen(h.by))) hit(h.by, h.on, h.weapon);
  };

  return {
    step(attack, feet, yaw) {
      steps++;
      const turned = playerStep(attack, feet, yaw);
      const engaged = new Set(view()?.engaged ?? []);
      for (const n of standing()) if (engaged.has(n.actor)) npcStep(n, feet);
      for (const actor of [...npcSwings.keys()]) if (!engaged.has(actor) || fallen(actor)) npcSwings.delete(actor);
      arrowStep();
      outbox.pump();
      return turned;
    },
    frame() {
      const now = view();
      const uses: UsePoint[] = [];
      for (const n of to.npcs()) {
        const down = now?.fallen.includes(n.actor) === true;
        if (down && !laid.has(n.path)) {
          laid.add(n.path);
          to.walker.fell(n.path);
        }
        if (!down || !n.here) continue;
        // Searched and taken from until nothing is left (M6.8): what is left opens again.
        const searched = now?.emptied.includes(n.actor) === true;
        const at: Vec3 = [n.at[0], n.at[1] + 0.3, n.at[2]];
        const send = { type: 'fighting/search', actor: n.actor };
        uses.push({
          path: n.path,
          center: at,
          send,
          ...(searched ? { label: 'Nothing left', spent: true } : { label: 'Search' }),
        });
      }
      to.bodies(uses);
    },
    keep(actor) {
      const weapon = weaponOf(actor);
      if (!view()?.engaged.includes(actor) || !weapon) return { distance: WAITING_M, away: true };
      return { distance: weapon.kind === 'melee' ? Math.max(0.8, weapon.reach - CLOSER_M) : weapon.range * 0.8 };
    },
    arrows: () => arrows,
    fell: (path) => laid.has(path),
    anim(actor) {
      const me = view()?.player;
      const weapon = weaponOf(actor);
      const s = actor === me ? swing : (npcSwings.get(actor) ?? null);
      const at = struck.get(actor);
      const hitNow = at !== undefined && (steps - at) * STEP < HIT_S;
      const kind = weapon?.kind ?? 'none';
      const ranged = kind === 'ranged';
      return {
        swing: s && !ranged ? s.phase : 'none',
        draw: s && ranged ? (s.phase === 'windup' ? 'draw' : 'loose') : 'none',
        weapon: kind,
        ...(s ? { phase: phaseOf(s) } : {}),
        down: fallen(actor),
        hit: hitNow,
      };
    },
    hook: () => ({
      weapon: weaponOf(view()?.player ?? '')?.item ?? '',
      swing: swing?.phase ?? null,
      aimed: aim?.foe.actor ?? null,
      engaged: [...(view()?.engaged ?? [])],
      npcs: to.npcs().map((n) => ({
        actor: n.actor,
        swing: npcSwings.get(n.actor)?.phase ?? null,
        down: fallen(n.actor),
      })),
      arrows: arrows.map((a) => ({ by: a.by, at: a.at })),
      sent: sent.map((s) => ({ ...s })),
      bodies: to
        .npcs()
        .filter((n) => fallen(n.actor))
        .map((n) => ({ actor: n.actor, label: view()?.emptied.includes(n.actor) ? 'Nothing left' : 'Search' })),
    }),
  };
}
