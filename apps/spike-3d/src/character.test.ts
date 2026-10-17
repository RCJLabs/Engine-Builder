import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { BONE_NAMES, PARTS, walker, weightsOf } from './character.ts';

const leftLeg = PARTS.find((part) => part.lower === 'shin-l') as (typeof PARTS)[number];

/** Each vertex where the skeleton puts it now, as the GPU skins it. */
function skinned(mesh: THREE.SkinnedMesh): THREE.Vector3[] {
  mesh.updateMatrixWorld(true);
  const position = mesh.geometry.getAttribute('position');
  return Array.from({ length: position.count }, (_, i) =>
    mesh.applyBoneTransform(i, new THREE.Vector3().fromBufferAttribute(position, i)),
  );
}

describe('weightsOf', () => {
  it('follows the lower bone below the bend, the upper above, and blends across it', () => {
    const upper = (y: number) => weightsOf(leftLeg, y, BONE_NAMES)[2];
    expect([upper(0.2), upper(0.4), upper(0.6), upper(0.9)]).toEqual([0, 0, 1, 1]);
    expect(upper(0.5)).toBeCloseTo(0.5, 12);
    const blend = [0.42, 0.46, 0.5, 0.54, 0.58].map(upper);
    expect(blend).toEqual([...blend].sort((a, b) => a - b));
    const [lower, top] = weightsOf(leftLeg, 0.5, BONE_NAMES);
    expect([BONE_NAMES[lower], BONE_NAMES[top]]).toEqual(['shin-l', 'thigh-l']);
  });

  it('refuses a part whose bones are not in the skeleton', () => {
    expect(() => weightsOf(leftLeg, 0.5, ['root'])).toThrow('No bone');
  });
});

describe('walker', () => {
  it('binds every vertex to real bones, with weights that add to 1', () => {
    const { mesh } = walker();
    expect(mesh.skeleton.bones.map((bone) => bone.name)).toEqual(BONE_NAMES);
    const index = mesh.geometry.getAttribute('skinIndex');
    const weight = mesh.geometry.getAttribute('skinWeight');
    const wrong: number[] = [];
    for (let i = 0; i < index.count; i++) {
      const bones = [index.getX(i), index.getY(i), index.getZ(i), index.getW(i)];
      const sum = weight.getX(i) + weight.getY(i) + weight.getZ(i) + weight.getW(i);
      if (bones.some((b) => b >= BONE_NAMES.length) || Math.abs(sum - 1) > 1e-6) wrong.push(i);
    }
    expect(wrong).toEqual([]);
  });

  it('stands as modelled before it moves, feet at its origin', () => {
    const { mesh } = walker();
    const rest = mesh.geometry.getAttribute('position');
    const moved = skinned(mesh).map((v, i) => v.distanceTo(new THREE.Vector3().fromBufferAttribute(rest, i)));
    expect(Math.max(...moved)).toBeLessThan(1e-6);
    expect(Math.min(...skinned(mesh).map((v) => v.y))).toBeCloseTo(0, 6);
  });

  it('carries each sole on its shin as the knee bends', () => {
    const figure = walker();
    figure.pose(1 / (4 * 1.1));
    const vertices = skinned(figure.mesh);
    const rest = figure.mesh.geometry.getAttribute('position');
    for (const [side, x] of [
      ['l', -0.15],
      ['r', 0.15],
    ] as const) {
      const sole = vertices.filter((_, i) => rest.getY(i) === 0 && Math.abs(rest.getX(i) - x) < 0.1);
      const centre = sole.reduce((sum, v) => sum.add(v), new THREE.Vector3()).divideScalar(sole.length);
      const shin = figure.mesh.skeleton.getBoneByName(`shin-${side}`) as THREE.Bone;
      expect(centre.distanceTo(shin.localToWorld(new THREE.Vector3(0, -0.5, 0))), side).toBeLessThan(1e-4);
    }
  });

  it('swings its feet against each other', () => {
    const figure = walker();
    // How far the right foot is ahead of the left, `seconds` into the walk.
    const lead = (seconds: number) => {
      figure.pose(seconds);
      const feet = skinned(figure.mesh).filter((v) => v.y < 0.2);
      const meanZ = (side: number) => {
        const zs = feet.filter((v) => Math.sign(v.x) === side).map((v) => v.z);
        return zs.reduce((sum, z) => sum + z, 0) / zs.length;
      };
      return meanZ(1) - meanZ(-1);
    };
    // A stride takes 1 / 1.1 s; a quarter and three quarters in, the legs are at their widest.
    expect(lead(1 / (4 * 1.1))).toBeGreaterThan(0.4);
    expect(lead(3 / (4 * 1.1))).toBeLessThan(-0.4);
  });
});
