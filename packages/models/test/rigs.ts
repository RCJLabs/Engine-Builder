/**
 * Rigs made in code for M6.5's tests (D77): a foreign one as a Mixamo export arrives (its joint
 * names, an A-pose, facing +z, a centimetre armature turned 90° about x, each joint's frame
 * turned at random, and a walk with root motion at 1.4 m/s), a target already on the engine's rig
 * (VRM's names, a T-pose, every frame the world's, facing −z), and what the tests read of either:
 * a document posed at a time, joint positions, and a vertex skinned by glTF's rule.
 */
import { Document, type Node, type Primitive, type Skin } from '@gltf-transform/core';
import { Matrix4, Quaternion, Vector3 } from 'three';

type V3 = [number, number, number];

/** The foreign rig's joints in the world it is shown in: name, parent, where, A-posed. */
const FOREIGN: readonly [string, string | null, V3][] = [
  ['Hips', null, [0, 1, 0]],
  ['Spine', 'Hips', [0, 1.1, 0]],
  ['Spine1', 'Spine', [0, 1.25, 0]],
  ['Spine2', 'Spine1', [0, 1.4, 0]],
  ['Neck', 'Spine2', [0, 1.5, 0]],
  ['Head', 'Neck', [0, 1.6, 0]],
  ['HeadTop_End', 'Head', [0, 1.78, 0]],
  ['LeftShoulder', 'Spine2', [0.05, 1.45, 0]],
  ['LeftArm', 'LeftShoulder', [0.18, 1.45, 0]],
  ['LeftForeArm', 'LeftArm', [0.378, 1.252, 0]],
  ['LeftHand', 'LeftForeArm', [0.555, 1.075, 0]],
  ['LeftHandIndex1', 'LeftHand', [0.6, 1.03, 0.02]],
  ['RightShoulder', 'Spine2', [-0.05, 1.45, 0]],
  ['RightArm', 'RightShoulder', [-0.18, 1.45, 0]],
  ['RightForeArm', 'RightArm', [-0.378, 1.252, 0]],
  ['RightHand', 'RightForeArm', [-0.555, 1.075, 0]],
  ['LeftUpLeg', 'Hips', [0.1, 0.95, 0]],
  ['LeftLeg', 'LeftUpLeg', [0.14, 0.5, 0]],
  ['LeftFoot', 'LeftLeg', [0.17, 0.08, 0]],
  ['LeftToeBase', 'LeftFoot', [0.17, 0.02, 0.12]],
  ['RightUpLeg', 'Hips', [-0.1, 0.95, 0]],
  ['RightLeg', 'RightUpLeg', [-0.14, 0.5, 0]],
  ['RightFoot', 'RightLeg', [-0.17, 0.08, 0]],
  ['RightToeBase', 'RightFoot', [-0.17, 0.02, 0.12]],
];

/** Each joint's own swing over the walk, about a world axis, by the time in seconds. */
const SWING: Readonly<Record<string, (t: number) => Quaternion>> = {
  Hips: (t) => about([0, 1, 0], 0.1 * Math.sin(2 * Math.PI * t)),
  Spine: (t) => about([0, 1, 0], -0.1 * Math.sin(2 * Math.PI * t)),
  LeftUpLeg: (t) => about([1, 0, 0], 0.5 * Math.sin(2 * Math.PI * t)),
  RightUpLeg: (t) => about([1, 0, 0], -0.5 * Math.sin(2 * Math.PI * t)),
  LeftLeg: (t) => about([1, 0, 0], 0.4 * (1 - Math.cos(2 * Math.PI * t))),
  RightLeg: (t) => about([1, 0, 0], 0.4 * (1 + Math.cos(2 * Math.PI * t))),
  LeftArm: (t) => about([1, 0, 0], -0.4 * Math.sin(2 * Math.PI * t)),
  RightArm: (t) => about([1, 0, 0], 0.4 * Math.sin(2 * Math.PI * t)),
  LeftForeArm: () => about([1, 0, 0], 0.3),
  RightForeArm: () => about([1, 0, 0], 0.3),
};

// three takes the axis as given: an axis not of length 1 makes a turn that isn't one.
const about = (axis: V3, angle: number) => new Quaternion().setFromAxisAngle(new Vector3(...axis).normalize(), angle);

/** A fixed stream of turns, so the rig's odd frames are the same on every run. */
function turns(seed: number) {
  let s = seed;
  const next = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  return () => about([next() - 0.5, next() - 0.5, next() - 0.5].map((v) => v || 0.1) as V3, next() * 6);
}

export const WALK_PACE = 1.4;
const FPS = 30;

/** The foreign rig: a document whose world shows it as FOREIGN says, and its walk. */
export function foreignRig(): Document {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  const armature = doc.createNode('Armature').setRotation(about([1, 0, 0], -Math.PI / 2).toArray() as never);
  armature.setScale([0.01, 0.01, 0.01]);
  scene.addChild(armature);
  const outer = new Matrix4().compose(
    new Vector3(),
    new Quaternion(...armature.getRotation()),
    new Vector3(0.01, 0.01, 0.01),
  );
  const turn = turns(11);
  const worldTurn = new Map<string, Quaternion>(FOREIGN.map(([name]) => [name, turn()]));
  const world = (name: string) => {
    const [, , at] = FOREIGN.find(([n]) => n === name) as (typeof FOREIGN)[number];
    return new Matrix4().compose(new Vector3(...at), worldTurn.get(name) as Quaternion, new Vector3(1, 1, 1));
  };
  const parentWorld = (parent: string | null) => (parent ? world(parent) : outer);
  const nodes = new Map<string, Node>();
  for (const [name, parent] of FOREIGN) {
    const local = parentWorld(parent).clone().invert().multiply(world(name));
    const node = doc.createNode(`mixamorig:${name}`).setMatrix(local.toArray() as never);
    nodes.set(name, node);
    (parent ? (nodes.get(parent) as Node) : armature).addChild(node);
  }
  const joints = FOREIGN.map(([name]) => nodes.get(name) as Node);
  const binds = new Float32Array(joints.length * 16);
  FOREIGN.forEach(([name], i) => {
    binds.set(world(name).invert().toArray(), i * 16);
  });
  const skin = doc
    .createSkin()
    .setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(binds).setBuffer(buffer));
  for (const joint of joints) skin.addJoint(joint);
  armature.addChild(doc.createNode('Body').setMesh(bodyMesh(doc, buffer)).setSkin(skin));
  walk(doc, buffer, nodes, world, outer);
  return doc;
}

/** Four vertices about each joint, weighted 0.7 to it and 0.3 to its parent. */
function bodyMesh(doc: Document, buffer: ReturnType<Document['createBuffer']>) {
  const positions: number[] = [];
  const joints: number[] = [];
  const weights: number[] = [];
  FOREIGN.forEach(([, parent, at], i) => {
    const up = parent ? FOREIGN.findIndex(([n]) => n === parent) : i;
    for (const [dx, dz] of [
      [0.04, 0],
      [-0.04, 0],
      [0, 0.04],
      [0, -0.04],
    ] as const) {
      positions.push(at[0] + dx, at[1] + 0.01, at[2] + dz);
      joints.push(i, up, 0, 0);
      weights.push(0.7, 0.3, 0, 0);
    }
  });
  const accessor = (type: 'VEC3' | 'VEC4', array: Float32Array | Uint16Array) =>
    doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const primitive = doc
    .createPrimitive()
    .setMode(0)
    .setAttribute('POSITION', accessor('VEC3', new Float32Array(positions)))
    .setAttribute('JOINTS_0', accessor('VEC4', new Uint16Array(joints)))
    .setAttribute('WEIGHTS_0', accessor('VEC4', new Float32Array(weights)));
  return doc.createMesh('body').addPrimitive(primitive);
}

/** The walk: each joint's swing as local turns, and the hips carried 1.4 m/s along +z, swaying. */
function walk(
  doc: Document,
  buffer: ReturnType<Document['createBuffer']>,
  nodes: ReadonlyMap<string, Node>,
  world: (name: string) => Matrix4,
  outer: Matrix4,
) {
  const animation = doc.createAnimation('walk');
  const times = Array.from({ length: FPS + 1 }, (_, k) => k / FPS);
  const input = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(times)).setBuffer(buffer);
  const turnOf = (m: Matrix4) => new Quaternion().setFromRotationMatrix(new Matrix4().extractRotation(m));
  for (const [name, parent] of FOREIGN) {
    const swing = SWING[name];
    if (!swing) continue;
    const up = turnOf(parent ? world(parent) : outer).invert();
    const keys = times.flatMap((t) =>
      up
        .clone()
        .multiply(swing(t))
        .multiply(turnOf(world(name)))
        .toArray(),
    );
    channel(doc, animation, input, buffer, nodes.get(name) as Node, 'rotation', 'VEC4', keys);
  }
  const into = outer.clone().invert();
  const hips = times.flatMap((t) =>
    new Vector3(0.03 * Math.sin(2 * Math.PI * t), 1 + 0.02 * Math.cos(4 * Math.PI * t), WALK_PACE * t)
      .applyMatrix4(into)
      .toArray(),
  );
  channel(doc, animation, input, buffer, nodes.get('Hips') as Node, 'translation', 'VEC3', hips);
}

function channel(
  doc: Document,
  animation: ReturnType<Document['createAnimation']>,
  input: ReturnType<Document['createAccessor']>,
  buffer: ReturnType<Document['createBuffer']>,
  node: Node,
  path: 'rotation' | 'translation',
  type: 'VEC3' | 'VEC4',
  keys: number[],
) {
  const output = doc.createAccessor().setType(type).setArray(new Float32Array(keys)).setBuffer(buffer);
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
  animation
    .addSampler(sampler)
    .addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
}

/** A rig already on the engine's: VRM's names, the T-pose, every frame the world's, facing −z. */
export function targetRig(): Document {
  const doc = new Document();
  const scene = doc.createScene();
  const layout: readonly [string, string | null, V3][] = [
    ['hips', null, [0, 1, 0]],
    ['spine', 'hips', [0, 1.1, 0]],
    ['chest', 'spine', [0, 1.25, 0]],
    ['upperChest', 'chest', [0, 1.4, 0]],
    ['neck', 'upperChest', [0, 1.5, 0]],
    ['head', 'neck', [0, 1.6, 0]],
    ...(['left', 'right'] as const).flatMap((side): [string, string | null, V3][] => {
      const x = side === 'left' ? -1 : 1;
      return [
        [`${side}Shoulder`, 'upperChest', [0.05 * x, 1.45, 0]],
        [`${side}UpperArm`, `${side}Shoulder`, [0.18 * x, 1.45, 0]],
        [`${side}LowerArm`, `${side}UpperArm`, [0.46 * x, 1.45, 0]],
        [`${side}Hand`, `${side}LowerArm`, [0.71 * x, 1.45, 0]],
        [`${side}UpperLeg`, 'hips', [0.1 * x, 0.95, 0]],
        [`${side}LowerLeg`, `${side}UpperLeg`, [0.1 * x, 0.5, 0]],
        [`${side}Foot`, `${side}LowerLeg`, [0.1 * x, 0.08, 0]],
        [`${side}Toes`, `${side}Foot`, [0.1 * x, 0.02, -0.12]],
      ];
    }),
  ];
  const nodes = new Map<string, Node>();
  const placed = new Map(layout.map(([name, , at]) => [name, at]));
  for (const [name, parent, at] of layout) {
    const from = parent ? (placed.get(parent) as V3) : ([0, 0, 0] as V3);
    const node = doc.createNode(name).setTranslation([at[0] - from[0], at[1] - from[1], at[2] - from[2]]);
    nodes.set(name, node);
    if (parent) (nodes.get(parent) as Node).addChild(node);
    else scene.addChild(node);
  }
  return doc;
}

/** Every node's world matrix with `clip`'s keys at `t` laid over its rest; `play` lends another document's clip by node name. */
export function poseAt(doc: Document, t: number, play: Document = doc, clip = 'walk'): Map<Node, Matrix4> {
  const byName = new Map(
    doc
      .getRoot()
      .listNodes()
      .map((node) => [node.getName(), node]),
  );
  const trs = new Map(
    doc
      .getRoot()
      .listNodes()
      .map((node) => [
        node,
        {
          at: new Vector3(...node.getTranslation()),
          turn: new Quaternion(...node.getRotation()),
          scale: new Vector3(...node.getScale()),
        },
      ]),
  );
  const animation = play
    .getRoot()
    .listAnimations()
    .find((a) => a.getName() === clip);
  for (const channel of animation?.listChannels() ?? []) {
    const node = byName.get(channel.getTargetNode()?.getName() ?? '');
    const sampler = channel.getSampler();
    const path = channel.getTargetPath();
    if (!node || !sampler || (path !== 'rotation' && path !== 'translation')) continue;
    const value = sample(sampler.getInput() as never, sampler.getOutput() as never, t, path === 'rotation');
    const state = trs.get(node);
    if (path === 'rotation') state?.turn.fromArray(value);
    else state?.at.fromArray(value);
  }
  const worlds = new Map<Node, Matrix4>();
  const of = (node: Node): Matrix4 => {
    const known = worlds.get(node);
    if (known) return known;
    const up = node.getParentNode();
    const state = trs.get(node) as { at: Vector3; turn: Quaternion; scale: Vector3 };
    const m = new Matrix4().compose(state.at, state.turn, state.scale);
    const out = up ? of(up).clone().multiply(m) : m;
    worlds.set(node, out);
    return out;
  };
  for (const node of doc.getRoot().listNodes()) of(node);
  return worlds;
}

type Floats = { getCount(): number; getScalar(i: number): number; getElement(i: number, out: number[]): number[] };

function sample(input: Floats, output: Floats, t: number, turn: boolean): number[] {
  const n = input.getCount();
  let k = 0;
  while (k < n - 2 && input.getScalar(k + 1) <= t) k++;
  const t0 = input.getScalar(k);
  const t1 = input.getScalar(Math.min(k + 1, n - 1));
  const u = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
  const a = output.getElement(k, []);
  const b = output.getElement(Math.min(k + 1, n - 1), []);
  if (turn) {
    const from = new Quaternion().fromArray(a);
    return from.slerp(new Quaternion().fromArray(b), u).toArray();
  }
  return a.map((v, i) => v + ((b[i] as number) - v) * u);
}

/** A joint's world position. */
export const positionOf = (worlds: ReadonlyMap<Node, Matrix4>, node: Node) =>
  new Vector3().setFromMatrixPosition(worlds.get(node) as Matrix4);

/**
 * Every vertex of the first skinned mesh, primitive by primitive, skinned by glTF's rule:
 * Σ weight · joint world · inverse bind · position.
 */
export function skinned(doc: Document, worlds: ReadonlyMap<Node, Matrix4>): Vector3[] {
  const node = doc
    .getRoot()
    .listNodes()
    .find((n) => n.getSkin() && n.getMesh()) as Node;
  const skin = node.getSkin() as NonNullable<ReturnType<Node['getSkin']>>;
  return (node.getMesh()?.listPrimitives() ?? []).flatMap((primitive) => skinnedPrimitive(skin, primitive, worlds));
}

function skinnedPrimitive(skin: Skin, primitive: Primitive, worlds: ReadonlyMap<Node, Matrix4>): Vector3[] {
  const binds = skin.getInverseBindMatrices() as NonNullable<ReturnType<typeof skin.getInverseBindMatrices>>;
  const positions = primitive.getAttribute('POSITION');
  const joints = primitive.getAttribute('JOINTS_0');
  const weights = primitive.getAttribute('WEIGHTS_0');
  if (!positions || !joints || !weights) return [];
  const out: Vector3[] = [];
  for (let v = 0; v < positions.getCount(); v++) {
    const at = new Vector3().fromArray(positions.getElement(v, [] as number[]));
    const sum = new Vector3();
    const js = joints.getElement(v, [] as number[]);
    weights.getElement(v, [] as number[]).forEach((w, k) => {
      if (w === 0) return;
      const joint = skin.listJoints()[js[k] as number] as Node;
      const m = (worlds.get(joint) as Matrix4)
        .clone()
        .multiply(new Matrix4().fromArray(binds.getElement(js[k] as number, [] as number[])));
      sum.add(at.clone().applyMatrix4(m).multiplyScalar(w));
    });
    out.push(sum);
  }
  return out;
}
