/**
 * The starter character drawn and moved through three's mixer in Node (M6.5, D77): decoded from its
 * GLB, copied for a figure on bones of its own, its clips laid as the animator's run says, the upper
 * layer taking the upper body from the base while the legs keep walking.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three/webgpu';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIGURE } from '../spaces/figureLook.ts';
import type { Played } from './animator.ts';
import { CHARACTER, type Character, createCharacters, loadCharacter } from './character.ts';
import { type ClipSource, createAnimated } from './mixer.ts';

const GLB = resolve(
  import.meta.dirname,
  '../../../../starter-character/assets/starter-character/starter-character.glb',
);
const LOOK = { height: FIGURE.height, clothes: '#112233', trim: FIGURE.trim, skin: FIGURE.skin };

let made: Character;
beforeAll(async () => {
  const bytes = readFileSync(GLB);
  made = await loadCharacter(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
});

const clips: ClipSource = (model, name) => {
  const clip = model === CHARACTER ? made.clips.get(name) : undefined;
  return clip ? { clip, hips: made.hips } : undefined;
};
const play = (clip: string, time: number, weight = 1): Played => ({
  state: clip,
  model: CHARACTER,
  clip,
  time,
  weight,
});
const at = (root: THREE.Object3D, bone: string) => {
  root.updateMatrixWorld(true);
  return (root.getObjectByName(bone) as THREE.Object3D).getWorldPosition(new THREE.Vector3());
};
const turnOf = (root: THREE.Object3D, bone: string) =>
  (root.getObjectByName(bone) as THREE.Object3D).quaternion.clone();
/** How far apart two turns' parts are: the file's keys sit a hair off unit length, which angleTo reads as 0.01 rad. */
const apart = (a: THREE.Quaternion, b: THREE.Quaternion) =>
  Math.max(...a.toArray().map((v, i) => Math.abs(v - (b.toArray()[i] as number))));

describe('the starter character in three', () => {
  it('decodes to its sixteen clips, 1.76 m to its hair and its hips at 0.95 m', () => {
    expect(made.clips.size).toBe(16);
    expect(made.height).toBeCloseTo(1.76, 2);
    expect(made.hips).toBeCloseTo(0.95, 3);
  });

  it('copies a figure at its height, its clothes in the look’s colour, its bones its own', () => {
    const characters = createCharacters();
    const tall = characters.character(made, { ...LOOK, height: 2.2 });
    const other = characters.character(made, LOOK);
    const body = tall.children[0] as THREE.Object3D;
    expect(body.scale.x).toBeCloseTo(2.2 / made.height, 6);
    const colours = new Set<string>();
    body.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh)
        colours.add(
          `${(mesh.material as THREE.Material).name}:#${(mesh.material as THREE.MeshStandardMaterial).color.getHexString()}`,
        );
    });
    expect(colours).toContain('clothes:#112233');
    expect(tall.getObjectByName('hips')).not.toBe(other.getObjectByName('hips'));
    expect(tall.userData.figure).toEqual({ ...LOOK, height: 2.2 });
  });

  it('stands in its idle: the arms down from the T, the feet on the ground', () => {
    const body = createCharacters().character(made, LOOK).children[0] as THREE.Object3D;
    const animated = createAnimated(body, made.hips, clips);
    animated.lay([play('idle', 0)], []);
    expect(at(body, 'rightHand').y).toBeLessThan(1);
    expect(at(body, 'leftFoot').y).toBeGreaterThan(0.05);
    expect(
      animated
        .playing()
        .map((p) => `${p.clip}|${p.role}`)
        .sort(),
    ).toEqual(['idle|lower', 'idle|upper']);
  });

  it('lets the upper layer take the upper body while the legs keep the base’s walk', () => {
    const walking = createCharacters().character(made, LOOK).children[0] as THREE.Object3D;
    const both = createCharacters().character(made, LOOK).children[0] as THREE.Object3D;
    const winding = createCharacters().character(made, LOOK).children[0] as THREE.Object3D;
    createAnimated(walking, made.hips, clips).lay([play('walk', 0.3)], []);
    createAnimated(both, made.hips, clips).lay([play('walk', 0.3)], [play('windup', 1)]);
    createAnimated(winding, made.hips, clips).lay([play('idle', 0)], [play('windup', 1)]);
    // The legs walk; the arm is the wind-up's.
    expect(apart(turnOf(both, 'leftUpperLeg'), turnOf(walking, 'leftUpperLeg'))).toBeLessThan(1e-6);
    expect(apart(turnOf(both, 'rightUpperArm'), turnOf(winding, 'rightUpperArm'))).toBeLessThan(1e-6);
    expect(turnOf(both, 'rightUpperArm').angleTo(turnOf(walking, 'rightUpperArm'))).toBeGreaterThan(0.3);
  });

  it('blends an upper clip at half weight halfway between the base’s arm and its own', () => {
    const half = createCharacters().character(made, LOOK).children[0] as THREE.Object3D;
    const none = createCharacters().character(made, LOOK).children[0] as THREE.Object3D;
    const full = createCharacters().character(made, LOOK).children[0] as THREE.Object3D;
    createAnimated(half, made.hips, clips).lay([play('idle', 0)], [play('windup', 1, 0.5)]);
    createAnimated(none, made.hips, clips).lay([play('idle', 0)], []);
    createAnimated(full, made.hips, clips).lay([play('idle', 0)], [play('windup', 1)]);
    const a = turnOf(none, 'rightUpperArm');
    const b = turnOf(full, 'rightUpperArm');
    expect(turnOf(half, 'rightUpperArm').angleTo(a.clone().slerp(b, 0.5))).toBeLessThan(0.02);
  });

  it('moves the right hand down and forward over a strike, the figure facing −z', () => {
    const body = createCharacters().character(made, LOOK).children[0] as THREE.Object3D;
    const animated = createAnimated(body, made.hips, clips);
    animated.lay([play('idle', 0)], [play('strike', 0)]);
    const from = at(body, 'rightHand');
    animated.lay([play('idle', 0)], [play('strike', 1)]);
    const to = at(body, 'rightHand');
    // Raised over the head and cut down to the waist in front (clips.ts): 0.75 m down, 0.84 m forward.
    expect(from.y).toBeGreaterThan(1.7);
    expect(to.y).toBeLessThan(from.y - 0.6);
    expect(to.z).toBeLessThan(from.z - 0.7);
  });

  it('scales the hips’ keys of a clip from a model with other hips', () => {
    const body = createCharacters().character(made, LOOK).children[0] as THREE.Object3D;
    const short: ClipSource = (_model, name) => {
      const clip = made.clips.get(name);
      return clip ? { clip, hips: made.hips * 2 } : undefined;
    };
    createAnimated(body, made.hips, short).lay([play('idle', 0)], []);
    expect((body.getObjectByName('hips') as THREE.Object3D).position.y).toBeCloseTo(made.hips / 2, 3);
  });
});
