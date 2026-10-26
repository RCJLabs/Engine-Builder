/**
 * The walk's animated bodies (M6.5, D77, docs/specs/animation.md#in-the-walk): the player and each
 * NPC built, each with its animator's run and a mixer on its copy, made again when streaming builds
 * its node again. Each frame a body's facts step its run and the run is laid on the mixer: every
 * frame within NEAR_M of the camera, every other frame out to twice that, and not at all beyond,
 * where the body holds its pose. The Low tier halves both. A body that gives no speed has it
 * measured from how far it moved. The hook's anims() reads back what the mixer plays and where six
 * bones stand.
 */
import type { AnimatorRecord, ModelClip } from '@eb/schema';
import * as THREE from 'three/webgpu';
import {
  type AnimFacts,
  type AnimRun,
  type ClipInfo,
  compileAnimator,
  type Machine,
  type Played,
  playedOf,
  startRun,
  stepAnimator,
} from '../anim/animator.ts';
import { CHARACTER, CHARACTER_MODEL, characterReady, STOCK_ANIMATOR } from '../anim/character.ts';
import { type Animated, type ClipSource, createAnimated, type Playing } from '../anim/mixer.ts';
import type { Vec3 } from '../spaces/vec.ts';

/** The player's key among the bodies: no object's path can be it. */
export const PLAYER = '@player';
/** Metres from the camera within which a body moves every frame, at every tier but Low. */
export const NEAR_M = 30;
const BONES = ['hips', 'head', 'leftHand', 'rightHand', 'leftFoot', 'rightFoot'] as const;
/** Seconds a measured speed takes to settle: a frame's jitter shouldn't flip a walk to a stand. */
const SMOOTH_S = 0.15;

/** A body as the walk gives it each frame: null facts hold it where it is, a talk's pause. */
export interface AnimBody {
  readonly key: string;
  readonly node: THREE.Object3D;
  readonly animator: string | null;
  readonly facts: (Omit<AnimFacts, 'speed'> & { readonly speed?: number }) | null;
}

/** What the hook says of a body: its run's layers, what the mixer plays, where its bones are, how often it moves. */
export interface AnimSeen {
  readonly key: string;
  readonly layers: Readonly<Record<'base' | 'upper', readonly Omit<Played, 'model'>[]>>;
  readonly playing: readonly Playing[];
  readonly bones: Readonly<Record<(typeof BONES)[number], Vec3>>;
  readonly speed: number;
  readonly every: 1 | 2 | 0;
}

interface Body {
  readonly root: THREE.Object3D;
  readonly machine: Machine;
  readonly animated: Animated;
  run: AnimRun;
  last: THREE.Vector3 | null;
  speed: number;
  every: 1 | 2 | 0;
  /** Seconds not yet stepped, and the frames counted, for every other frame. */
  owed: number;
  ticks: number;
}

/** The node an animator moves under a body's node: the copy marked by character.ts or modelsView.ts. */
function animatedIn(node: THREE.Object3D): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  node.traverse((part) => {
    if (!found && part.userData.animated) found = part;
  });
  return found;
}

export function createAnims(
  record: (key: string) => unknown,
  modelClips: (id: string) => { clips: ReadonlyMap<string, THREE.AnimationClip>; hips: number } | null,
  near: number,
) {
  const bodies = new Map<string, Body>();
  const machines = new Map<string, Machine>();
  const at = new THREE.Vector3();

  const machineOf = (animator: string | null) => {
    const key = animator ?? '';
    let made = machines.get(key);
    if (!made) {
      const found = animator === null ? undefined : (record(`animator:${animator}`) as AnimatorRecord | undefined);
      made = compileAnimator(found ?? STOCK_ANIMATOR);
      machines.set(key, made);
    }
    return made;
  };
  const clipInfo = (model: string, clip: string): ClipInfo | undefined => {
    const value =
      model === CHARACTER ? CHARACTER_MODEL : (record(`model:${model}`) as { clips?: ModelClip[] } | undefined);
    return value?.clips?.find((c) => c.name === clip);
  };
  const clipSource: ClipSource = (model, clip) => {
    const made = characterReady();
    if (model === CHARACTER && made) {
      const found = made.clips.get(clip);
      return found ? { clip: found, hips: made.hips } : undefined;
    }
    const found = modelClips(model);
    const one = found?.clips.get(clip);
    return found && one ? { clip: one, hips: found.hips } : undefined;
  };

  const bodyOf = (key: string, node: THREE.Object3D, animator: string | null): Body | null => {
    const root = animatedIn(node);
    if (!root) return null;
    const had = bodies.get(key);
    if (had?.root === root) return had;
    had?.animated.dispose();
    const machine = machineOf(animator);
    const hips = (root.userData.animated as { hips?: number }).hips ?? 0;
    const made: Body = {
      root,
      machine,
      animated: createAnimated(root, hips, clipSource),
      run: startRun(machine),
      last: null,
      speed: 0,
      every: 1,
      owed: 0,
      ticks: 0,
    };
    bodies.set(key, made);
    return made;
  };

  return {
    /** One frame of `dt` seconds, the camera at `eye`; a body left out of `given` is let go. */
    frame(dt: number, eye: Vec3, given: readonly AnimBody[]): void {
      const seen = new Set<string>();
      for (const one of given) {
        const body = bodyOf(one.key, one.node, one.animator);
        if (!body) continue;
        seen.add(one.key);
        body.root.getWorldPosition(at);
        const moved = body.last ? Math.hypot(at.x - body.last.x, at.z - body.last.z) : 0;
        body.last = (body.last ?? new THREE.Vector3()).copy(at);
        if (!one.facts) continue;
        const far = Math.hypot(at.x - eye[0], at.y - eye[1], at.z - eye[2]);
        body.every = far <= near ? 1 : far <= near * 2 ? 2 : 0;
        const measured = dt > 0 ? moved / dt : 0;
        body.speed = one.facts.speed ?? body.speed + (measured - body.speed) * (1 - Math.exp(-dt / SMOOTH_S));
        if (body.every === 0) continue;
        body.owed += dt;
        body.ticks++;
        if (body.every === 2 && body.ticks % 2 === 1) continue;
        const facts: AnimFacts = { ...one.facts, speed: body.speed };
        body.run = stepAnimator(body.machine, body.run, facts, body.owed, clipInfo);
        body.owed = 0;
        body.animated.lay(playedOf(body.machine, 'base', body.run), playedOf(body.machine, 'upper', body.run));
      }
      for (const [key, body] of bodies) {
        if (seen.has(key)) continue;
        body.animated.dispose();
        bodies.delete(key);
      }
    },
    seen(): AnimSeen[] {
      const strip = (played: Played[]) => played.map(({ model: _, ...rest }) => rest);
      return [...bodies].map(([key, body]) => {
        body.root.updateWorldMatrix(true, true);
        const bones = Object.fromEntries(
          BONES.map((bone) => {
            const node = body.root.getObjectByName(bone);
            const p = node ? node.getWorldPosition(new THREE.Vector3()) : at.set(Number.NaN, Number.NaN, Number.NaN);
            return [bone, [p.x, p.y, p.z] as Vec3];
          }),
        ) as AnimSeen['bones'];
        return {
          key,
          layers: {
            base: strip(playedOf(body.machine, 'base', body.run)),
            upper: strip(playedOf(body.machine, 'upper', body.run)),
          },
          playing: body.animated.playing(),
          bones,
          speed: body.speed,
          every: body.every,
        };
      });
    },
    dispose(): void {
      for (const body of bodies.values()) body.animated.dispose();
      bodies.clear();
    },
  };
}

export type Anims = ReturnType<typeof createAnims>;
