/**
 * The rig at import (M6.5, D77, docs/specs/animation.md#the-gate): joints mapped from each family's
 * names; a foreign rig normalised with every vertex where it was at any pose; its walk played on a
 * rig already the engine's with the same arm and leg directions; and the walk taken in place, its
 * pace read back.
 */
import { Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { foreignRig, poseAt, positionOf, skinned, targetRig, WALK_PACE } from '../test/rigs.ts';
import { REQUIRED } from './humanoid.ts';
import { normaliseRig } from './normalise.ts';
import { rigModel } from './rig.ts';
import { type Joint, mapJoints, readJointName } from './rigMap.ts';

/** A chain of names as joints, each the parent of the next unless `parents` says otherwise. */
const chain = (names: readonly string[], parents: Readonly<Record<string, string>>): Joint[] =>
  names.map((name) => ({ name, parent: parents[name] ? names.indexOf(parents[name] as string) : -1 }));

const MIXAMO = [
  'Hips',
  'Spine',
  'Spine1',
  'Spine2',
  'Neck',
  'Head',
  'LeftShoulder',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'LeftHandIndex1',
  'RightShoulder',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'LeftToeBase',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
  'RightToeBase',
];
const MIXAMO_UP: Record<string, string> = {
  Spine: 'Hips',
  Spine1: 'Spine',
  Spine2: 'Spine1',
  Neck: 'Spine2',
  Head: 'Neck',
  LeftShoulder: 'Spine2',
  LeftArm: 'LeftShoulder',
  LeftForeArm: 'LeftArm',
  LeftHand: 'LeftForeArm',
  LeftHandIndex1: 'LeftHand',
  RightShoulder: 'Spine2',
  RightArm: 'RightShoulder',
  RightForeArm: 'RightArm',
  RightHand: 'RightForeArm',
  LeftUpLeg: 'Hips',
  LeftLeg: 'LeftUpLeg',
  LeftFoot: 'LeftLeg',
  LeftToeBase: 'LeftFoot',
  RightUpLeg: 'Hips',
  RightLeg: 'RightUpLeg',
  RightFoot: 'RightLeg',
  RightToeBase: 'RightFoot',
};
const prefixed = (prefix: string) => {
  const names = MIXAMO.map((n) => `${prefix}${n}`);
  const up = Object.fromEntries(Object.entries(MIXAMO_UP).map(([k, v]) => [`${prefix}${k}`, `${prefix}${v}`]));
  return chain(names, up);
};

describe('joints mapped to the humanoid', () => {
  it('reads a side and a base word from each family’s names', () => {
    expect(readJointName('mixamorig:LeftForeArm')).toEqual({ side: 'left', kind: 'LowerArm' });
    expect(readJointName('lowerarm_l')).toEqual({ side: 'left', kind: 'LowerArm' });
    expect(readJointName('DEF-forearm.R')).toEqual({ side: 'right', kind: 'LowerArm' });
    expect(readJointName('leftLowerArm')).toEqual({ side: 'left', kind: 'LowerArm' });
    expect(readJointName('Bip01 L Thigh')).toEqual({ side: 'left', kind: 'UpperLeg' });
    expect(readJointName('spine_02')).toEqual({ side: null, kind: 'spine' });
    // A twist and a finger are other things; a side on a trunk word or none on a limb's, too.
    expect(readJointName('upperarm_twist_01_l').kind).toBeNull();
    expect(readJointName('LeftHandIndex1').kind).toBeNull();
    expect(readJointName('hand').kind).toBeNull();
    expect(readJointName('leftover').side).toBeNull();
  });

  it('maps Mixamo’s skeleton, its three spine joints in order up the chain', () => {
    const { bones, missing } = mapJoints(prefixed('mixamorig:'));
    expect(missing).toEqual([]);
    expect(bones).toMatchObject({
      hips: 'mixamorig:Hips',
      spine: 'mixamorig:Spine',
      chest: 'mixamorig:Spine1',
      upperChest: 'mixamorig:Spine2',
      leftUpperArm: 'mixamorig:LeftArm',
      leftLowerArm: 'mixamorig:LeftForeArm',
      leftUpperLeg: 'mixamorig:LeftUpLeg',
      leftLowerLeg: 'mixamorig:LeftLeg',
      rightToes: 'mixamorig:RightToeBase',
    });
  });

  it('maps Unreal’s names', () => {
    const names = [
      'pelvis',
      'spine_01',
      'spine_02',
      'spine_03',
      'neck_01',
      'head',
      'clavicle_l',
      'upperarm_l',
      'lowerarm_l',
      'hand_l',
      'clavicle_r',
      'upperarm_r',
      'lowerarm_r',
      'hand_r',
      'thigh_l',
      'calf_l',
      'foot_l',
      'ball_l',
      'thigh_r',
      'calf_r',
      'foot_r',
      'ball_r',
    ];
    const up: Record<string, string> = {
      spine_01: 'pelvis',
      spine_02: 'spine_01',
      spine_03: 'spine_02',
      neck_01: 'spine_03',
      head: 'neck_01',
      clavicle_l: 'spine_03',
      upperarm_l: 'clavicle_l',
      lowerarm_l: 'upperarm_l',
      hand_l: 'lowerarm_l',
      clavicle_r: 'spine_03',
      upperarm_r: 'clavicle_r',
      lowerarm_r: 'upperarm_r',
      hand_r: 'lowerarm_r',
      thigh_l: 'pelvis',
      calf_l: 'thigh_l',
      foot_l: 'calf_l',
      ball_l: 'foot_l',
      thigh_r: 'pelvis',
      calf_r: 'thigh_r',
      foot_r: 'calf_r',
      ball_r: 'foot_r',
    };
    const { bones, missing } = mapJoints(chain(names, up));
    expect(missing).toEqual([]);
    expect(bones).toMatchObject({
      hips: 'pelvis',
      chest: 'spine_02',
      leftShoulder: 'clavicle_l',
      rightLowerLeg: 'calf_r',
    });
  });

  it('says which required bones are missing, and drops one not under its parent', () => {
    // The forearm named as nothing the tables know, still where it hangs.
    const unknown = prefixed('').map((j) => (j.name === 'LeftForeArm' ? { ...j, name: 'LeftThing' } : j));
    expect(mapJoints(unknown).missing).toEqual(['leftLowerArm']);
    // A "LeftHand" hung from the hips isn't the left arm's hand.
    const astray = chain(MIXAMO, { ...MIXAMO_UP, LeftHand: 'Hips' });
    expect(mapJoints(astray).missing).toContain('leftHand');
  });

  it('takes what a model’s form says over the names', () => {
    const { bones } = mapJoints(prefixed('mixamorig:'), { chest: 'mixamorig:Spine2' });
    expect(bones.chest).toBe('mixamorig:Spine2');
    expect(REQUIRED).toHaveLength(15);
  });
});

describe('a foreign rig normalised', () => {
  const HALF_TURN = new Quaternion(0, 1, 0, 0);

  it('keeps every vertex where it was at every pose, turned to face −z', () => {
    const doc = foreignRig();
    const times = [0, 0.13, 0.5, 0.77];
    const before = times.map((t) => skinned(doc, poseAt(doc, t)));
    const skin = doc.getRoot().listSkins()[0];
    if (!skin) throw new Error('No skin');
    const { bones } = mapJoints(
      skin
        .listJoints()
        .map((n) => ({ name: n.getName(), parent: skin.listJoints().indexOf(n.getParentNode() as never) })),
    );
    const done = normaliseRig(doc, skin.listJoints(), bones, skin);
    expect(done.faced).toBe(true);
    // The A-pose's arms come up and its splayed legs straighten; a forearm in line with its upper
    // arm rides along with it, needing no turn of its own.
    expect([...done.turned].sort()).toEqual(['leftUpperArm', 'leftUpperLeg', 'rightUpperArm', 'rightUpperLeg']);
    times.forEach((t, k) => {
      const after = skinned(doc, poseAt(doc, t));
      const worst = Math.max(
        ...after.map((v, i) =>
          v.distanceTo(((before[k] as Vector3[])[i] as Vector3).clone().applyQuaternion(HALF_TURN)),
        ),
      );
      expect(worst).toBeLessThan(1e-5);
    });
  });

  it('rests at the identity, named as the humanoid, the arms out along ∓x', () => {
    const doc = foreignRig();
    rigModel(doc);
    const node = (name: string) =>
      doc
        .getRoot()
        .listNodes()
        .find((n) => n.getName() === name);
    expect(node('leftLowerArm')?.getRotation()).toEqual([0, 0, 0, 1]);
    const rest = poseAt(doc, 0, doc, 'none');
    const along = positionOf(rest, node('leftLowerArm') as never)
      .sub(positionOf(rest, node('leftUpperArm') as never))
      .normalize();
    expect(along.angleTo(new Vector3(-1, 0, 0))).toBeLessThan(1e-4);
  });

  it('plays its walk on a rig already the engine’s with the same arm and leg directions', () => {
    const source = foreignRig();
    rigModel(source);
    const target = targetRig();
    const pairs = [
      ['leftUpperArm', 'leftLowerArm'],
      ['leftLowerArm', 'leftHand'],
      ['rightUpperArm', 'rightLowerArm'],
      ['leftUpperLeg', 'leftLowerLeg'],
      ['leftLowerLeg', 'leftFoot'],
      ['rightUpperLeg', 'rightLowerLeg'],
    ] as const;
    const nodeIn = (doc: typeof source, name: string) =>
      doc
        .getRoot()
        .listNodes()
        .find((n) => n.getName() === name) as never;
    for (const t of [0.1, 0.35, 0.6, 0.9]) {
      const a = poseAt(source, t);
      const b = poseAt(target, t, source);
      for (const [from, to] of pairs) {
        const one = positionOf(a, nodeIn(source, to))
          .sub(positionOf(a, nodeIn(source, from)))
          .normalize();
        const two = positionOf(b, nodeIn(target, to))
          .sub(positionOf(b, nodeIn(target, from)))
          .normalize();
        expect(one.angleTo(two) * (180 / Math.PI), `${from} at ${t}`).toBeLessThan(1);
      }
    }
  });

  it('takes the walk in place, its sway kept, and reads its pace', () => {
    const doc = foreignRig();
    const rigged = rigModel(doc);
    expect(rigged?.rigged).toBe(true);
    const walk = rigged?.clips.find((c) => c.name === 'walk');
    expect(walk?.length).toBeCloseTo(1, 4);
    expect(Math.abs((walk?.pace ?? 0) - WALK_PACE) / WALK_PACE).toBeLessThan(0.01);
    const hips = doc
      .getRoot()
      .listNodes()
      .find((n) => n.getName() === 'hips') as never;
    const start = positionOf(poseAt(doc, 0), hips);
    const end = positionOf(poseAt(doc, 1), hips);
    expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThan(1e-4);
    const swayed = Math.max(...[0.25, 0.75].map((t) => Math.abs(positionOf(poseAt(doc, t), hips).x - start.x)));
    expect(swayed).toBeGreaterThan(0.02);
  });

  it('leaves a skin missing a required bone as it came, listing its clips', () => {
    const doc = foreignRig();
    const forearm = doc
      .getRoot()
      .listNodes()
      .find((n) => n.getName() === 'mixamorig:LeftForeArm');
    forearm?.setName('mixamorig:LeftThing');
    const rigged = rigModel(doc);
    expect(rigged).toMatchObject({ rigged: false, missing: ['leftLowerArm'] });
    expect(rigged?.clips.map((c) => [c.name, c.pace])).toEqual([['walk', 0]]);
    expect(
      doc
        .getRoot()
        .listNodes()
        .some((n) => n.getName() === 'hips'),
    ).toBe(false);
  });
});

describe('a foreign rig packed as the import packs it (M6.5)', () => {
  it('comes out of the pack on the rig: read again, nothing to turn or face, its walk still paced', async () => {
    const { packModel, readModel } = await import('./pack.ts');
    const { modelIO } = await import('./io.ts');
    const plain = await (await modelIO()).writeBinary(foreignRig());
    let rigged: ReturnType<typeof rigModel> = null;
    const glb = await packModel({ name: 'hero.glb', bytes: plain }, [], {}, (doc) => {
      rigged = rigModel(doc);
    });
    const first = rigged as ReturnType<typeof rigModel>;
    expect(first?.rigged).toBe(true);
    expect(first?.faced).toBe(true);
    expect(first?.clips.find((c) => c.name === 'walk')?.pace).toBeCloseTo(WALK_PACE, 2);
    const again = rigModel(await readModel({ name: 'hero.glb', bytes: glb }, [], {}));
    expect(again?.rigged).toBe(true);
    expect(again?.turned).toEqual([]);
    expect(again?.faced).toBe(false);
    // In place already: the packed walk's hips go nowhere.
    expect(again?.clips.find((c) => c.name === 'walk')?.pace).toBeCloseTo(0, 2);
  });
});
