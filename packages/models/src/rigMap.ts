/**
 * A skin's joints matched to the engine's humanoid (M6.5, D77, docs/specs/animation.md#importing-a-rigged-model):
 * each joint's name read for its side and its base word, so Mixamo's `mixamorig:LeftForeArm`,
 * Unreal's `lowerarm_l`, Blender's `forearm.L` and VRM's `leftLowerArm` all come to the left lower
 * arm; the spine's joints by their order up the chain; and every match held to the hierarchy, a
 * lower arm under its upper arm. What a model's form says wins over all of it.
 */
import { HUMANOID, type HumanBone, PARENT, REQUIRED } from './humanoid.ts';

export interface Joint {
  readonly name: string;
  /** Its parent's index among the joints, or −1 for one whose parent isn't a joint. */
  readonly parent: number;
}

export interface RigMap {
  /** Each humanoid bone found, as the name of the joint it is. */
  readonly bones: Partial<Record<HumanBone, string>>;
  /** The required bones not found: any one means the skin imports unrigged (W152). */
  readonly missing: readonly HumanBone[];
}

type Kind =
  | 'hips'
  | 'spine'
  | 'chest'
  | 'upperChest'
  | 'neck'
  | 'head'
  | 'Shoulder'
  | 'UpperArm'
  | 'LowerArm'
  | 'Hand'
  | 'UpperLeg'
  | 'LowerLeg'
  | 'Foot'
  | 'Toes';

/** Base words, side taken off, to what they are. */
const WORDS: Readonly<Record<string, Kind>> = {
  hips: 'hips',
  hip: 'hips',
  pelvis: 'hips',
  spine: 'spine',
  chest: 'chest',
  upperchest: 'upperChest',
  neck: 'neck',
  head: 'head',
  shoulder: 'Shoulder',
  clavicle: 'Shoulder',
  collar: 'Shoulder',
  upperarm: 'UpperArm',
  uparm: 'UpperArm',
  arm: 'UpperArm',
  lowerarm: 'LowerArm',
  forearm: 'LowerArm',
  lowarm: 'LowerArm',
  elbow: 'LowerArm',
  hand: 'Hand',
  wrist: 'Hand',
  upperleg: 'UpperLeg',
  upleg: 'UpperLeg',
  thigh: 'UpperLeg',
  lowerleg: 'LowerLeg',
  lowleg: 'LowerLeg',
  leg: 'LowerLeg',
  calf: 'LowerLeg',
  shin: 'LowerLeg',
  knee: 'LowerLeg',
  foot: 'Foot',
  ankle: 'Foot',
  toes: 'Toes',
  toe: 'Toes',
  toebase: 'Toes',
  ball: 'Toes',
};

const SIDED: readonly Kind[] = ['Shoulder', 'UpperArm', 'LowerArm', 'Hand', 'UpperLeg', 'LowerLeg', 'Foot', 'Toes'];

interface Read {
  readonly side: 'left' | 'right' | null;
  readonly kind: Kind | null;
}

/** A joint's name read: its namespace and rig prefix off, then its side, then its base word. */
export function readJointName(name: string): Read {
  let rest = name.slice(Math.max(name.lastIndexOf(':'), name.lastIndexOf('|')) + 1);
  rest = rest.replace(/^(mixamorig\d*_|def[-_]|bip0*1[ _]|b_|j_|bn_)/i, '');
  let side: Read['side'] = null;
  const sides: readonly [RegExp, 'left' | 'right'][] = [
    // Case matters here: `leftUpperArm` and `Left_Arm` have a side, `leftover` has none.
    [/^(?:left|Left|LEFT)(?=[A-Z_.\- ]|$)/, 'left'],
    [/^(?:right|Right|RIGHT)(?=[A-Z_.\- ]|$)/, 'right'],
    [/^l[_.\- ]/i, 'left'],
    [/^r[_.\- ]/i, 'right'],
    [/[_.\- ]left$/i, 'left'],
    [/[_.\- ]right$/i, 'right'],
    [/[_.\- ]l$/i, 'left'],
    [/[_.\- ]r$/i, 'right'],
  ];
  for (const [pattern, which] of sides) {
    if (pattern.test(rest)) {
      side = which;
      rest = rest.replace(pattern, '');
      break;
    }
  }
  // Separators and a trailing count go, so `spine_02`, `Spine2` and `spine.002` are all a spine.
  const base = rest
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\d+$/, '');
  const kind = WORDS[base] ?? null;
  if (kind === null) return { side, kind };
  const sided = SIDED.includes(kind);
  // A sided word with no side, or a trunk word with one, is something else (a twist, a prop).
  return sided === (side !== null) ? { side, kind } : { side, kind: null };
}

/** Each joint's depth below the first joint with no joint above it. */
function depths(joints: readonly Joint[]): number[] {
  const out: number[] = [];
  const of = (i: number): number => {
    const known = out[i];
    if (known !== undefined) return known;
    const parent = joints[i]?.parent ?? -1;
    const depth = parent < 0 ? 0 : of(parent) + 1;
    out[i] = depth;
    return depth;
  };
  for (let i = 0; i < joints.length; i++) of(i);
  return out;
}

const isAbove = (joints: readonly Joint[], above: number, i: number): boolean => {
  for (let at = joints[i]?.parent ?? -1; at >= 0; at = joints[at]?.parent ?? -1) if (at === above) return true;
  return false;
};

/** The skin's joints matched to the humanoid, or `given` (a model form's map) where it names a joint. */
export function mapJoints(joints: readonly Joint[], given: Partial<Record<HumanBone, string>> = {}): RigMap {
  const depth = depths(joints);
  const reads = joints.map((joint) => readJointName(joint.name));
  const found = new Map<HumanBone, number>();
  const shallowest = (match: (read: Read, i: number) => boolean): number | undefined =>
    reads
      .map((read, i) => ({ read, i }))
      .filter(({ read, i }) => match(read, i))
      .sort((a, b) => (depth[a.i] as number) - (depth[b.i] as number))[0]?.i;

  const trunk = (kind: Kind) => shallowest((read) => read.kind === kind);
  for (const kind of ['hips', 'neck', 'head'] as const) {
    const i = trunk(kind);
    if (i !== undefined) found.set(kind, i);
  }
  // The spine's joints in order up the chain: three or more are spine, chest and upper chest.
  const chain = reads
    .map((read, i) => ({ read, i }))
    .filter(({ read }) => read.kind === 'spine' || read.kind === 'chest' || read.kind === 'upperChest')
    .sort((a, b) => (depth[a.i] as number) - (depth[b.i] as number))
    .map(({ i }) => i);
  const named = (kind: Kind) => chain.find((i) => reads[i]?.kind === kind);
  const spines = chain.filter((i) => reads[i]?.kind === 'spine');
  const [first] = spines;
  if (first !== undefined) found.set('spine', first);
  const chest = named('chest') ?? (spines.length >= 3 ? spines[Math.floor(spines.length / 2)] : spines[1]);
  if (chest !== undefined) found.set('chest', chest);
  const upper = named('upperChest') ?? (spines.length >= 3 ? spines[spines.length - 1] : undefined);
  if (upper !== undefined) found.set('upperChest', upper);
  for (const side of ['left', 'right'] as const) {
    for (const kind of SIDED) {
      const i = shallowest((read) => read.side === side && read.kind === kind);
      if (i !== undefined) found.set(`${side}${kind}` as HumanBone, i);
    }
  }
  const index = new Map(joints.map((joint, i) => [joint.name, i]));
  for (const [bone, name] of Object.entries(given) as [HumanBone, string][]) {
    const i = index.get(name);
    if (i !== undefined) found.set(bone, i);
  }
  // Held to the hierarchy, from the hips out: a bone not under its nearest found parent goes.
  for (const bone of HUMANOID) {
    const i = found.get(bone);
    if (i === undefined) continue;
    let parent = PARENT[bone];
    while (parent !== null && !found.has(parent)) parent = PARENT[parent];
    const above = parent === null ? undefined : found.get(parent);
    if (above !== undefined && !isAbove(joints, above, i)) found.delete(bone);
  }
  const bones: Partial<Record<HumanBone, string>> = {};
  for (const bone of HUMANOID) {
    const i = found.get(bone);
    if (i !== undefined) bones[bone] = joints[i]?.name as string;
  }
  return { bones, missing: REQUIRED.filter((bone) => !found.has(bone)) };
}
