/** The sun's shadow camera fitted round what is drawn (M5.7, D69). */
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { newGrid } from '../terrain/grid.ts';
import { fitShadowsTo } from './shadows.ts';

const sunAt = (x: number, y: number, z: number) => {
  const sun = new THREE.DirectionalLight();
  sun.position.set(x, y, z);
  return sun;
};

describe('the sun’s shadow camera', () => {
  it('covers the terrain’s corners and heights', () => {
    const sun = sunAt(0, 50, 0);
    // 64 m a side, 16 m high: 32 m each way from the origin.
    fitShadowsTo(sun, newGrid({ size: 65, spacing: 1, low: -4, high: 16, layers: [] }), undefined);
    expect(sun.shadow.camera.right).toBeCloseTo(Math.hypot(32, 32, 16), 5);
    expect(sun.shadow.camera.far).toBeCloseTo(50 + 2 * Math.hypot(32, 32, 16), 5);
  });

  it('reaches an object beyond the terrain, by where it stands as well as its size', () => {
    const sun = sunAt(0, 50, 0);
    const objects = new THREE.Group();
    const far = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    far.position.set(100, 0, 0);
    objects.add(far);
    fitShadowsTo(sun, newGrid({ size: 65, spacing: 1, low: -4, high: 16, layers: [] }), objects);
    expect(sun.shadow.camera.right).toBeGreaterThanOrEqual(101);
  });

  it('reaches the ground nearer the sun than the sun is to the origin', () => {
    // The editor's own sun, 15.6 m from the origin, over a space 21 m round it: the camera's near
    // plane goes 5.6 m behind it, so the near edge of the sphere is in front of it.
    const sun = sunAt(6, 12, 8);
    const objects = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.BoxGeometry(30, 0.2, 30));
    objects.add(ground);
    fitShadowsTo(sun, null, objects);
    const r = sun.shadow.camera.right;
    expect(r).toBeGreaterThan(sun.position.length());
    expect(sun.shadow.camera.near).toBeLessThanOrEqual(sun.position.length() - r);
    expect(sun.shadow.camera.far).toBeGreaterThanOrEqual(sun.position.length() + r);
  });

  it('keeps 10 m round an empty space', () => {
    const sun = sunAt(0, 50, 0);
    fitShadowsTo(sun, null, new THREE.Group());
    expect(sun.shadow.camera.right).toBe(10);
  });
});
