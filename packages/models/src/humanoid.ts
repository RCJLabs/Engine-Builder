/**
 * The engine's one rig (M6.5, D77, docs/specs/animation.md#the-rig): VRM 1.0's humanoid bones, their
 * parents, which are required, which the upper-body layer moves, and the T-pose direction the
 * import turns an arm or a leg to. Upright on +y and facing −z, as every placed thing faces, so a
 * figure's left is −x. Plain data, apart from @eb/models' import, so the stage reads it cheaply.
 */

export const HUMANOID = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'leftToes',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
  'rightToes',
] as const;

export type HumanBone = (typeof HUMANOID)[number];

/** VRM 1.0's required bones: without one of these a skin imports unrigged (W152). */
export const REQUIRED: readonly HumanBone[] = [
  'hips',
  'spine',
  'head',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
];

/** Each bone's humanoid parent; an optional one left out is skipped to the next above it. */
export const PARENT: Readonly<Record<HumanBone, HumanBone | null>> = {
  hips: null,
  spine: 'hips',
  chest: 'spine',
  upperChest: 'chest',
  neck: 'upperChest',
  head: 'neck',
  leftShoulder: 'upperChest',
  leftUpperArm: 'leftShoulder',
  leftLowerArm: 'leftUpperArm',
  leftHand: 'leftLowerArm',
  rightShoulder: 'upperChest',
  rightUpperArm: 'rightShoulder',
  rightLowerArm: 'rightUpperArm',
  rightHand: 'rightLowerArm',
  leftUpperLeg: 'hips',
  leftLowerLeg: 'leftUpperLeg',
  leftFoot: 'leftLowerLeg',
  leftToes: 'leftFoot',
  rightUpperLeg: 'hips',
  rightLowerLeg: 'rightUpperLeg',
  rightFoot: 'rightLowerLeg',
  rightToes: 'rightFoot',
};

/** What the upper-body layer moves: the spine up, and everything hanging from it. */
export const UPPER: ReadonlySet<HumanBone> = new Set<HumanBone>([
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
]);

/**
 * The bones turned to the T-pose at import, each toward its child: the arms out along ∓x and the
 * legs straight down. The spine, neck, hands and feet keep their own rest, as VRM asks of a model,
 * since a spine's curve and a foot's slope differ from one body to the next.
 */
export const T_POSE: Readonly<Partial<Record<HumanBone, { child: HumanBone; to: [number, number, number] }>>> = {
  leftShoulder: { child: 'leftUpperArm', to: [-1, 0, 0] },
  leftUpperArm: { child: 'leftLowerArm', to: [-1, 0, 0] },
  leftLowerArm: { child: 'leftHand', to: [-1, 0, 0] },
  rightShoulder: { child: 'rightUpperArm', to: [1, 0, 0] },
  rightUpperArm: { child: 'rightLowerArm', to: [1, 0, 0] },
  rightLowerArm: { child: 'rightHand', to: [1, 0, 0] },
  leftUpperLeg: { child: 'leftLowerLeg', to: [0, -1, 0] },
  leftLowerLeg: { child: 'leftFoot', to: [0, -1, 0] },
  rightUpperLeg: { child: 'rightLowerLeg', to: [0, -1, 0] },
  rightLowerLeg: { child: 'rightFoot', to: [0, -1, 0] },
};

export const isHumanBone = (name: string): name is HumanBone => (HUMANOID as readonly string[]).includes(name);
