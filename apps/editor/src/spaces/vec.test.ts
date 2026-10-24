import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { mulQuat, quatOfAxis, quatOfTurn, rotate, turnOfQuat, type Vec3 } from './vec.ts';

const rad = MathUtils.degToRad;
const threeQuat = (turn: Vec3) =>
  new Quaternion().setFromEuler(new Euler(rad(turn[0]), rad(turn[1]), rad(turn[2]), 'YXZ'));
const close = (a: readonly number[], b: readonly number[], digits = 9) => {
  for (const [i, value] of a.entries())
    expect(value, `item ${i} of [${a.join(', ')}]`).toBeCloseTo(b[i] as number, digits);
};

// Turns a person might type, and some with pitch near straight up or down.
const TURNS: Vec3[] = [
  [0, 0, 0],
  [0, 90, 0],
  [30, 45, 60],
  [-20, 170, -100],
  [89, 10, 5],
  [-89.9, -45, 30],
  [12.5, -135, 179],
];

describe('turns as three reads them (Euler YXZ in degrees)', () => {
  it('make the quaternion three makes', () => {
    for (const turn of TURNS) {
      const q = threeQuat(turn);
      close(quatOfTurn(turn), [q.x, q.y, q.z, q.w]);
    }
  });

  it('come back from a quaternion as three reads one', () => {
    for (const turn of TURNS) {
      const q = threeQuat(turn);
      const euler = new Euler().setFromQuaternion(q, 'YXZ');
      close(turnOfQuat([q.x, q.y, q.z, q.w]), [euler.x, euler.y, euler.z].map(MathUtils.radToDeg), 6);
    }
  });

  it('read straight up as a pitch of 90 with no roll', () => {
    const [pitch, , roll] = turnOfQuat(quatOfTurn([90, 30, 20]));
    expect(pitch).toBeCloseTo(90, 5);
    expect(roll).toBe(0);
  });

  it('turn about an axis, and one after another, as three does', () => {
    const q = quatOfAxis([0, 1, 0], 90);
    close(rotate(q, [1, 0, 0]), [0, 0, -1]);
    const a = quatOfAxis([1, 0, 0], 30);
    const b = quatOfTurn([10, 20, 30]);
    const ours = mulQuat(a, b);
    const theirs = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), rad(30)).multiply(threeQuat([10, 20, 30]));
    close(ours, [theirs.x, theirs.y, theirs.z, theirs.w]);
    const v = new Vector3(1, 2, 3).applyQuaternion(theirs);
    close(rotate(ours, [1, 2, 3]), [v.x, v.y, v.z]);
  });
});
