/**
 * An animator's run laid on three's mixer (M6.5, D77, docs/specs/animation.md#in-the-walk). Each
 * clip is bound three ways: the base layer's legs and hips, the base layer's upper body, and the
 * upper layer's upper body. So the upper layer's weight takes the upper body from the base, and the
 * legs walk on under a swing. Every action is held still and given its time and weight from the run
 * each frame; the mixer only blends. Clips from another model have their hips' height keys scaled
 * by the two models' hips, so a short character's hips don't float. Three's animation core only:
 * it runs in Node as on the page.
 */
import { UPPER } from '@eb/models/humanoid';
import * as THREE from 'three/webgpu';
import type { Played } from './animator.ts';

type Role = 'lower' | 'upper' | 'over';

/** A clip by its model and name, as an animator names it, and that model's hips' height in its own units. */
export type ClipSource = (model: string, clip: string) => { clip: THREE.AnimationClip; hips: number } | undefined;

const nodeOf = (track: THREE.KeyframeTrack) => track.name.slice(0, track.name.lastIndexOf('.'));
const upperBones: ReadonlySet<string> = UPPER;
const isUpper = (track: THREE.KeyframeTrack) => upperBones.has(nodeOf(track));

/** One role's part of a clip, its hips' keys scaled by `scale`: made once and shared by every body. */
const parts = new WeakMap<THREE.AnimationClip, Map<string, THREE.AnimationClip>>();
function partOf(clip: THREE.AnimationClip, role: Role, scale: number): THREE.AnimationClip {
  let made = parts.get(clip);
  if (!made) {
    made = new Map();
    parts.set(clip, made);
  }
  const key = `${role}:${scale}`;
  const found = made.get(key);
  if (found) return found;
  const tracks = clip.tracks
    .filter((track) => (role === 'lower' ? !isUpper(track) : isUpper(track)))
    .map((track) => {
      if (scale === 1 || nodeOf(track) !== 'hips' || !track.name.endsWith('.position')) return track;
      const scaled = track.clone();
      for (let i = 0; i < scaled.values.length; i++) scaled.values[i] = (scaled.values[i] as number) * scale;
      return scaled;
    });
  const part = new THREE.AnimationClip(`${clip.name}|${role}`, clip.duration, tracks);
  made.set(key, part);
  return part;
}

/** What the hook reads back of an action playing: its clip, time and weight as the mixer has them. */
export interface Playing {
  readonly clip: string;
  readonly role: Role;
  readonly time: number;
  readonly weight: number;
}

/** A body three draws that an animator moves; `hips` is its own hips' height, in its file's units. */
export function createAnimated(root: THREE.Object3D, hips: number, clips: ClipSource) {
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map<string, { action: THREE.AnimationAction; clip: string; role: Role }>();

  const actionOf = (model: string, name: string, role: Role) => {
    const key = `${model}/${name}|${role}`;
    const known = actions.get(key);
    if (known) return known.action;
    const source = clips(model, name);
    if (!source) return null;
    const scale = source.hips > 0 && hips > 0 ? Math.round((hips / source.hips) * 1e6) / 1e6 : 1;
    const action = mixer.clipAction(partOf(source.clip, role, scale));
    action.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
    action.timeScale = 0;
    action.play();
    actions.set(key, { action, clip: name, role });
    return action;
  };

  return {
    root,
    /** This frame's pose: the base layer's clips and the upper layer's, at the weights the run gives. */
    lay(base: readonly Played[], upper: readonly Played[]): void {
      const want = new Map<THREE.AnimationAction, { time: number; weight: number }>();
      const add = (action: THREE.AnimationAction | null, time: number, weight: number) => {
        if (!action || weight <= 0) return;
        const had = want.get(action);
        want.set(action, { time, weight: (had?.weight ?? 0) + weight });
      };
      const over = Math.min(
        1,
        upper.reduce((sum, p) => sum + (p.clip === null ? 0 : p.weight), 0),
      );
      for (const p of base) {
        if (p.clip === null) continue;
        add(actionOf(p.model, p.clip, 'lower'), p.time, p.weight);
        add(actionOf(p.model, p.clip, 'upper'), p.time, p.weight * (1 - over));
      }
      for (const p of upper) if (p.clip !== null) add(actionOf(p.model, p.clip, 'over'), p.time, p.weight);
      for (const { action } of actions.values()) {
        const now = want.get(action);
        action.enabled = now !== undefined;
        action.setEffectiveWeight(now?.weight ?? 0);
        if (now) action.time = now.time;
      }
      mixer.update(0);
    },
    /** The actions with weight, read back from the mixer. */
    playing(): Playing[] {
      return [...actions.values()]
        .filter(({ action }) => action.enabled && action.getEffectiveWeight() > 0)
        .map(({ action, clip, role }) => ({ clip, role, time: action.time, weight: action.getEffectiveWeight() }));
    },
    dispose(): void {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      actions.clear();
    },
  };
}

export type Animated = ReturnType<typeof createAnimated>;
