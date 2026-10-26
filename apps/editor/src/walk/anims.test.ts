/**
 * The walk's animated bodies in Node (M6.5, D77, docs/specs/animation.md#in-the-walk): the starter
 * character decoded from its GLB, copied for a body, and stepped by its stock animator every frame
 * near the camera, every other frame out to twice that, and not at all beyond; held under a talk;
 * its speed measured from how far it moved; let go when it isn't given; made again when its node is.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type * as THREE from 'three/webgpu';
import { beforeAll, describe, expect, it } from 'vitest';
import { STILL } from '../anim/animator.ts';
import { type Character, createCharacters } from '../anim/character.ts';
import { loadCharacter } from '../anim/characterLoad.ts';
import { FIGURE } from '../spaces/figureLook.ts';
import type { Vec3 } from '../spaces/vec.ts';
import { type AnimBody, createAnims, NEAR_M } from './anims.ts';

const GLB = resolve(
  import.meta.dirname,
  '../../../../starter-character/assets/starter-character/starter-character.glb',
);
const LOOK = { height: FIGURE.height, clothes: FIGURE.clothes, trim: FIGURE.trim, skin: FIGURE.skin };

let made: Character;
beforeAll(async () => {
  const bytes = readFileSync(GLB);
  made = await loadCharacter(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
});

const figure = (x: number): THREE.Object3D => {
  const group = createCharacters().character(made, LOOK);
  group.position.set(x, 0, 0);
  group.updateMatrixWorld(true);
  return group;
};
const EYE: Vec3 = [0, 1.6, 0];
const body = (key: string, node: THREE.Object3D, facts: AnimBody['facts'] = STILL): AnimBody => ({
  key,
  node,
  animator: null,
  facts,
});
const timeOf = (anims: ReturnType<typeof createAnims>, key: string) =>
  anims.seen().find((a) => a.key === key)?.layers.base[0]?.time ?? Number.NaN;

describe('the walk’s animated bodies', () => {
  it('steps a body near every frame, one out to twice as far every other frame, and holds one beyond', () => {
    const anims = createAnims(
      () => undefined,
      () => null,
      NEAR_M,
    );
    const [near, mid, far] = [figure(10), figure(45), figure(70)];
    const all = [body('near', near), body('mid', mid), body('far', far)];
    for (let i = 0; i < 6; i++) anims.frame(0.1, EYE, all);
    expect(anims.seen().map((a) => [a.key, a.every])).toEqual([
      ['near', 1],
      ['mid', 2],
      ['far', 0],
    ]);
    expect(timeOf(anims, 'near')).toBeCloseTo(0.6, 6);
    // Every other frame, with both frames' time: the same time by the sixth.
    expect(timeOf(anims, 'mid')).toBeCloseTo(0.6, 6);
    anims.frame(0.1, EYE, all);
    expect(timeOf(anims, 'mid')).toBeCloseTo(0.6, 6);
    expect(timeOf(anims, 'far')).toBe(0);
  });

  it('halves the distances on Low', () => {
    const anims = createAnims(
      () => undefined,
      () => null,
      NEAR_M / 2,
    );
    anims.frame(0.1, EYE, [body('a', figure(20)), body('b', figure(40))]);
    expect(anims.seen().map((a) => a.every)).toEqual([2, 0]);
  });

  it('holds a body whose facts are null, and measures the speed of one given none', () => {
    const anims = createAnims(
      () => undefined,
      () => null,
      NEAR_M,
    );
    const walker = figure(0);
    const held = figure(2);
    const { speed: _, ...moving } = STILL;
    anims.frame(0.1, EYE, [body('walker', walker, moving), body('held', held, null)]);
    for (let i = 1; i <= 20; i++) {
      walker.position.x = i * 0.25;
      walker.updateMatrixWorld(true);
      anims.frame(0.1, EYE, [body('walker', walker, moving), body('held', held, null)]);
    }
    const seen = anims.seen();
    // 2.5 m/s measured: past the walk's 0.2, short of the run's 3.5.
    expect(seen.find((a) => a.key === 'walker')?.speed).toBeCloseTo(2.5, 1);
    expect(seen.find((a) => a.key === 'walker')?.layers.base[0]?.state).toBe('walk');
    expect(timeOf(anims, 'held')).toBe(0);
  });

  it('lets a body go when it isn’t given, and starts again on a node built again', () => {
    const anims = createAnims(
      () => undefined,
      () => null,
      NEAR_M,
    );
    anims.frame(0.5, EYE, [body('a', figure(1)), body('b', figure(2))]);
    anims.frame(0.5, EYE, [body('a', figure(1))]);
    expect(anims.seen().map((a) => a.key)).toEqual(['a']);
    // A node built again is a new body: its run started over, one frame in where the old one was two.
    expect(timeOf(anims, 'a')).toBeCloseTo(0.5, 6);
  });

  it('plays an actor’s own animator from the world’s records, and the stock one for a name it lacks', () => {
    const slow = {
      clips: 'starter-character',
      base: { start: 'idle', states: [{ id: 'idle', clip: 'idle', loop: true, speed: 0.5 }] },
    };
    const anims = createAnims(
      (key) => (key === 'animator:slow' ? slow : undefined),
      () => null,
      NEAR_M,
    );
    const [a, b] = [figure(1), figure(2)];
    for (let i = 0; i < 4; i++)
      anims.frame(0.25, EYE, [
        { ...body('slow', a), animator: 'slow' },
        { ...body('none', b), animator: 'missing' },
      ]);
    expect(timeOf(anims, 'slow')).toBeCloseTo(0.5, 6);
    expect(timeOf(anims, 'none')).toBeCloseTo(1, 6);
  });
});
