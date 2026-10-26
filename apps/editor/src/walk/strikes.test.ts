/**
 * The arithmetic of a fight (M6.4, D76, docs/specs/combat.md#a-hit), without a world: what a swing
 * reaches (strike.ts), the foe soft aim turns to (aim.ts), and an arrow's flight (arrows.ts). The
 * rays are stand-ins; Rapier's are camp.test.ts's.
 */
import { weaponView } from '@eb/ui';
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../spaces/vec.ts';
import { AIM_CONE, aimAt, turnedToward } from './aim.ts';
import { ARROW_GRAVITY, aimedVelocity, loose, stepArrows } from './arrows.ts';
import { reached, type Target } from './strike.ts';

const SWORD = weaponView('sword', { kind: 'melee', damage: 4 });
const BOW = weaponView('bow', { kind: 'ranged', damage: 3 });
const body = (actor: string, feet: Vec3): Target => ({ actor, feet, height: 1.75, radius: 0.35 });
const wielder = { feet: [0, 0, 0] as Vec3, height: 1.75, yaw: 0 };
const clear = () => true;
const names = (targets: readonly Target[]) => targets.map((t) => t.actor);

describe('what a swing reaches', () => {
  it('takes the bodies within its reach and half its arc of where the wielder faces, nearest first', () => {
    // Yaw 0 faces −z. The sword reaches 2 m past a body's edge, 50° either side.
    const ahead = body('ahead', [0, 0, -2.2]);
    const near = body('near', [0, 0, -1]);
    const side = body('side', [1.2, 0, -1.2]);
    expect(names(reached(wielder, SWORD, [ahead, side, near], clear))).toEqual(['near', 'side', 'ahead']);
  });

  it('leaves one past its reach, one out of its arc and one behind', () => {
    const far = body('far', [0, 0, -3]);
    const wide = body('wide', [1.5, 0, -0.3]);
    const behind = body('behind', [0, 0, 1.5]);
    expect(reached(wielder, SWORD, [far, wide, behind], clear)).toEqual([]);
  });

  it('leaves one with something between, as the ray says', () => {
    const near = body('near', [0, 0, -1]);
    expect(reached(wielder, SWORD, [near], () => false)).toEqual([]);
  });
});

describe('soft aim', () => {
  const foe = (actor: string, at: Vec3) => ({ actor, path: actor, at });

  it('turns to the nearest foe within the cone and the weapon’s aim', () => {
    const ahead = foe('ahead', [0, 0, -2]);
    const off = foe('off', [0.5, 0, -1]);
    const wide = foe('wide', [1.5, 0, -1.5]);
    expect(Math.atan2(0.5, 1) * (180 / Math.PI)).toBeLessThan(AIM_CONE);
    expect(aimAt([ahead, off, wide], [0, 0, 0], 0, SWORD)?.actor).toBe('off');
    expect(aimAt([wide], [0, 0, 0], 0, SWORD)).toBeUndefined();
  });

  it('reaches a sword’s length and half a metre, a bow’s range', () => {
    const far = foe('far', [0, 0, -3]);
    expect(aimAt([far], [0, 0, 0], 0, SWORD)).toBeUndefined();
    expect(aimAt([far], [0, 0, 0], 0, BOW)?.actor).toBe('far');
  });

  it('turns over the wind-up, the short way round', () => {
    expect(turnedToward(0, [0, 0, 0], [1, 0, 0], 0.5)).toBeCloseTo(-45);
    expect(turnedToward(170, [0, 0, 0], [0, 0, 1], 1)).toBeCloseTo(180);
  });
});

describe('an arrow', () => {
  /** Flies `arrow` until it passes z = `z`, nothing in the way: where it is then. */
  const flyTo = (from: Vec3, velocity: Vec3, z: number) => {
    let arrows = [loose('hero', 'bow', from, velocity)];
    for (let i = 0; i < 600 && arrows[0] && (arrows[0].at[2] as number) > z; i++)
      arrows = stepArrows(arrows, 1 / 60, () => null).flying;
    return arrows[0]?.at;
  };

  it('is aimed up for the drop, so it comes down on what it was aimed at', () => {
    const from: Vec3 = [0, 1.3, 0];
    const at = flyTo(from, aimedVelocity(from, [0, 1.3, -20], BOW.speed), -20);
    expect(at?.[1]).toBeCloseTo(1.3, 0);
  });

  it('falls under gravity when loosed level', () => {
    // Half a second level at 40 m/s: 20 m out and about 1.2 m down.
    const at = flyTo([0, 1.3, 0], [0, 0, -BOW.speed], -20);
    expect(1.3 - (at?.[1] ?? 0)).toBeCloseTo(0.5 * ARROW_GRAVITY * 0.25, 0);
  });

  it('hits the first body its ray meets, and a solid stops it with no hit', () => {
    const arrow = loose('wren', 'bow', [0, 1.3, 0], [0, 0, -40]);
    const hit = stepArrows([arrow], 1 / 60, (_from, _dir, most) => ({ toi: most / 2, actor: 'hero' }));
    expect(hit.hits).toEqual([{ by: 'wren', weapon: 'bow', on: 'hero' }]);
    expect(hit.flying).toEqual([]);
    const wall = stepArrows([arrow], 1 / 60, (_from, _dir, most) => ({ toi: most / 2 }));
    expect(wall).toMatchObject({ hits: [], flying: [] });
    expect(wall.stopped).toHaveLength(1);
  });
});
