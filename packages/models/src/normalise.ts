/**
 * A skin's skeleton normalised onto the engine's rig (M6.5, D77, docs/specs/animation.md#importing-a-rigged-model).
 * Every joint gets a frame R, its rest world rotation with the T-pose turn of the arms and legs
 * above it; then its node rests at the identity rotation, offset from its parent by the parent's
 * R and scale turned onto its own offset; its inverse bind matrix becomes R·S·IBM; and every key
 * of a clip moves into the new frames, a rotation q becoming R_parent·q·R⁻¹. Since the old world of
 * a joint at any pose is the new one times R·S, every product of a joint's world and its inverse
 * bind is unchanged, so the mesh draws as it did; and with R the T-posed rest, a clip's rotations
 * mean the same on every model normalised. A model facing +z is turned to face −z on the way.
 */
import type { Accessor, Document, Node, Skin } from '@gltf-transform/core';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { type HumanBone, T_POSE } from './humanoid.ts';

export interface Normalised {
  /** The bones turned to the T-pose by more than a degree. */
  readonly turned: readonly HumanBone[];
  /** Whether the model was turned round to face −z. */
  readonly faced: boolean;
}

interface Rest {
  readonly at: Vector3;
  readonly turn: Quaternion;
  readonly scale: number;
}

const restOf = (matrix: ArrayLike<number>): Rest => {
  const at = new Vector3();
  const turn = new Quaternion();
  const scale = new Vector3();
  new Matrix4().fromArray(Array.from(matrix)).decompose(at, turn, scale);
  return { at, turn, scale: (scale.x + scale.y + scale.z) / 3 };
};

const ONE_DEGREE = Math.PI / 180;
const HALF_TURN = new Quaternion(0, 1, 0, 0);

/** The joints in an order where each comes after its parent, and each one's parent joint index. */
function order(joints: readonly Node[]): { sorted: number[]; parents: number[] } {
  const index = new Map(joints.map((node, i) => [node, i]));
  const parents = joints.map((node) => index.get(node.getParentNode() as Node) ?? -1);
  const depth = (i: number): number => ((parents[i] as number) < 0 ? 0 : depth(parents[i] as number) + 1);
  const sorted = joints.map((_, i) => i).sort((a, b) => depth(a) - depth(b));
  return { sorted, parents };
}

/** Each joint's frame R: its rest turned to the T-pose, the turns of those above carried down. */
function framesOf(
  joints: readonly Node[],
  bones: Partial<Record<HumanBone, string>>,
  rests: readonly Rest[],
  sorted: readonly number[],
  parents: readonly number[],
): { frames: Quaternion[]; turned: HumanBone[] } {
  const byName = new Map(joints.map((node, i) => [node.getName(), i]));
  const boneAt = new Map(Object.entries(bones).map(([bone, name]) => [byName.get(name as string), bone as HumanBone]));
  const carried: Quaternion[] = joints.map(() => new Quaternion());
  const frames: Quaternion[] = joints.map(() => new Quaternion());
  const turned: HumanBone[] = [];
  for (const i of sorted) {
    const parent = parents[i] as number;
    const turn = parent < 0 ? new Quaternion() : (carried[parent] as Quaternion).clone();
    const bone = boneAt.get(i);
    const pose = bone ? T_POSE[bone] : undefined;
    const child = pose ? byName.get(bones[pose.child] as string) : undefined;
    if (pose && child !== undefined) {
      const along = (rests[child] as Rest).at
        .clone()
        .sub((rests[i] as Rest).at)
        .applyQuaternion(turn)
        .normalize();
      const to = new Vector3(...pose.to);
      if (along.angleTo(to) > ONE_DEGREE) {
        turn.premultiply(new Quaternion().setFromUnitVectors(along, to));
        turned.push(bone as HumanBone);
      }
    }
    carried[i] = turn;
    frames[i] = turn.clone().multiply((rests[i] as Rest).turn);
  }
  return { frames, turned };
}

/** An accessor of floats, its own, so a sampler sharing its output with another isn't changed twice. */
function ownFloats(doc: Document, from: Accessor): Accessor {
  const out = doc.createAccessor().setType(from.getType()).setBuffer(from.getBuffer());
  const size = from.getElementSize();
  const array = new Float32Array(from.getCount() * size);
  const element: number[] = [];
  for (let k = 0; k < from.getCount(); k++) array.set(from.getElement(k, element), k * size);
  return out.setArray(array);
}

/**
 * The skeleton normalised in place: its nodes, the skin's inverse binds when there is a skin (a
 * clip set has none), children that aren't joints, and clips.
 */
export function normaliseRig(
  doc: Document,
  joints: readonly Node[],
  bones: Partial<Record<HumanBone, string>>,
  skin: Skin | null,
): Normalised {
  const { sorted, parents } = order(joints);
  const top = joints[sorted[0] as number] as Node;
  const above = top.getParentNode();
  const outer = restOf(above ? above.getWorldMatrix() : new Matrix4().toArray());
  const rests = joints.map((node) => restOf(node.getWorldMatrix()));
  // Facing +z: the left arm runs out along +x. Turn the whole rig about y before anything else.
  const leftArm = byBone(joints, bones, 'leftUpperArm');
  const leftElbow = byBone(joints, bones, 'leftLowerArm');
  const faced = leftArm >= 0 && leftElbow >= 0 && (rests[leftElbow] as Rest).at.x > (rests[leftArm] as Rest).at.x;
  if (faced) {
    for (const rest of [...rests, outer]) {
      rest.at.applyQuaternion(HALF_TURN);
      rest.turn.premultiply(HALF_TURN);
    }
  }
  const { frames, turned } = framesOf(joints, bones, rests, sorted, parents);
  const parentFrame = (i: number) => {
    const parent = parents[i] as number;
    return parent < 0 ? outer.turn : (frames[parent] as Quaternion);
  };
  const parentScale = (i: number) => {
    const parent = parents[i] as number;
    return parent < 0 ? outer.scale : (rests[parent] as Rest).scale;
  };
  const offsetOf = (i: number) => ((parents[i] as number) < 0 ? outer.at : new Vector3());

  rewriteClips(doc, joints, { frames, parentFrame, parentScale, offsetOf });
  // Children that aren't joints (a sword in a hand) keep their place: their local takes R·S.
  joints.forEach((node, i) => {
    const frame = new Matrix4().makeRotationFromQuaternion(frames[i] as Quaternion);
    frame.scale(new Vector3().setScalar((rests[i] as Rest).scale));
    for (const child of node.listChildren()) {
      if (joints.includes(child)) continue;
      child.setMatrix(frame.clone().multiply(new Matrix4().fromArray(child.getMatrix())).toArray() as never);
    }
  });
  if (skin) rebind(doc, skin, frames, rests);
  // The new rest: identity turns, each offset the T-posed one, the top hung from the scene itself.
  const posed = joints.map(() => new Vector3());
  for (const i of sorted) {
    const parent = parents[i] as number;
    const local = new Vector3(...(joints[i] as Node).getTranslation()).multiplyScalar(parentScale(i));
    posed[i] = local.applyQuaternion(parentFrame(i)).add(parent < 0 ? offsetOf(i) : (posed[parent] as Vector3));
  }
  for (const i of sorted) {
    const parent = parents[i] as number;
    const offset = parent < 0 ? (posed[i] as Vector3) : (posed[i] as Vector3).clone().sub(posed[parent] as Vector3);
    (joints[i] as Node).setTranslation(offset.toArray()).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]);
  }
  if (above) {
    above.removeChild(top);
    for (const scene of doc.getRoot().listScenes())
      if (scene.listChildren().includes(sceneRootOf(above))) scene.addChild(top);
  }
  if (skin && skin.getSkeleton() !== top) skin.setSkeleton(top);
  rename(doc, joints, bones);
  return { turned, faced };
}

const byBone = (joints: readonly Node[], bones: Partial<Record<HumanBone, string>>, bone: HumanBone) =>
  joints.findIndex((node) => node.getName() === bones[bone]);

const sceneRootOf = (node: Node): Node => {
  let at = node;
  for (let up = at.getParentNode(); up; up = at.getParentNode()) at = up;
  return at;
};

interface Frames {
  readonly frames: readonly Quaternion[];
  readonly parentFrame: (i: number) => Quaternion;
  readonly parentScale: (i: number) => number;
  readonly offsetOf: (i: number) => Vector3;
}

/** Every key of every clip on a joint carried into the new frames; tangents turned, not moved. */
function rewriteClips(doc: Document, joints: readonly Node[], frames: Frames): void {
  const index = new Map(joints.map((node, i) => [node, i]));
  for (const animation of doc.getRoot().listAnimations()) {
    for (const channel of animation.listChannels()) {
      const i = index.get(channel.getTargetNode() as Node);
      const path = channel.getTargetPath();
      const sampler = channel.getSampler();
      const from = sampler?.getOutput();
      if (i === undefined || !sampler || !from || (path !== 'rotation' && path !== 'translation')) continue;
      const out = ownFloats(doc, from);
      const cubic = sampler.getInterpolation() === 'CUBICSPLINE';
      const element: number[] = [];
      const parent = frames.parentFrame(i);
      const inverse = (frames.frames[i] as Quaternion).clone().invert();
      for (let k = 0; k < out.getCount(); k++) {
        const value = out.getElement(k, element);
        // In a cubic spline the middle of each three is the value; the others are tangents.
        const isValue = !cubic || k % 3 === 1;
        if (path === 'rotation') {
          const q = new Quaternion(...(value as [number, number, number, number]));
          out.setElement(k, parent.clone().multiply(q).multiply(inverse).toArray() as number[]);
        } else {
          const t = new Vector3(...(value as [number, number, number]))
            .multiplyScalar(frames.parentScale(i))
            .applyQuaternion(parent);
          if (isValue) t.add(frames.offsetOf(i));
          out.setElement(k, t.toArray());
        }
      }
      sampler.setOutput(out);
    }
  }
}

/** Each joint's inverse bind matrix with its frame and scale put before it: R·S·IBM. */
function rebind(doc: Document, skin: Skin, frames: readonly Quaternion[], rests: readonly Rest[]): void {
  const from = skin.getInverseBindMatrices();
  if (!from) throw new Error('A skin with no inverse bind matrices binds at its rest: nothing to normalise against');
  const out = ownFloats(doc, from);
  const element: number[] = [];
  frames.forEach((frame, i) => {
    const turn = new Matrix4()
      .makeRotationFromQuaternion(frame)
      .scale(new Vector3().setScalar((rests[i] as Rest).scale));
    out.setElement(i, turn.multiply(new Matrix4().fromArray(out.getElement(i, element))).toArray());
  });
  skin.setInverseBindMatrices(out);
}

/** The mapped joints named as the humanoid's bones; any other node already so named steps aside. */
function rename(doc: Document, joints: readonly Node[], bones: Partial<Record<HumanBone, string>>): void {
  const mapped = new Map(Object.entries(bones).map(([bone, name]) => [name as string, bone]));
  const wanted = new Set(mapped.values());
  for (const node of doc.getRoot().listNodes()) {
    if (!mapped.has(node.getName()) && wanted.has(node.getName())) node.setName(`${node.getName()}_`);
  }
  for (const node of joints) {
    const bone = mapped.get(node.getName());
    if (bone) node.setName(bone);
  }
}
