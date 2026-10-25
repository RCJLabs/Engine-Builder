/**
 * The NPCs' senses (M6.3, D75, docs/specs/ai.md#perception): sight within range and cone with a
 * clear ray, the player's noises within both reaches, looks five times a second and a report once
 * a second of walking, as ai/sensed.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../spaces/vec.ts';
import { createSenses, type Senser, type Standing, sight } from './senses.ts';

const GUARD: Senser = { actor: 'guard', path: 'guard', sight: 15, cone: 120, hearing: 10, height: 1.75, radius: 0.3 };
// Yaw 0 faces −z: the guard at the origin looks towards z < 0.
const facingNorth: Standing = { path: 'guard', at: [0, 0, 0], yaw: 0 };
const open = () => null;

describe('sight', () => {
  it('sees a player ahead within range, in centimetres from eyes to chest', () => {
    const cm = sight(GUARD, facingNorth, [0, 0, -5], open);
    const eyes = 1.75 * 0.9;
    expect(cm).toBe(Math.round(Math.hypot(5, 1.2 - eyes) * 100));
  });

  it('sees nothing behind, outside half its cone, or past its range', () => {
    expect(sight(GUARD, facingNorth, [0, 0, 5], open)).toBeNull();
    // 61° off to the side, with a 120° cone.
    const side: Vec3 = [Math.sin((61 * Math.PI) / 180) * -5, 0, -Math.cos((61 * Math.PI) / 180) * 5];
    expect(sight(GUARD, facingNorth, side, open)).toBeNull();
    const inside: Vec3 = [Math.sin((59 * Math.PI) / 180) * -5, 0, -Math.cos((59 * Math.PI) / 180) * 5];
    expect(sight(GUARD, facingNorth, inside, open)).not.toBeNull();
    expect(sight(GUARD, facingNorth, [0, 0, -16], open)).toBeNull();
    expect(sight({ ...GUARD, sight: 0 }, facingNorth, [0, 0, -2], open)).toBeNull();
  });

  it('sees nothing through a wall, but the ray meeting the player is a sighting', () => {
    expect(sight(GUARD, facingNorth, [0, 0, -5], () => 2)).toBeNull();
    expect(sight(GUARD, facingNorth, [0, 0, -5], () => 4.5)).not.toBeNull();
    // The ray starts outside the guard's own body.
    let from: Vec3 = [0, 0, 0];
    sight(GUARD, facingNorth, [0, 0, -5], (start) => {
      from = start;
      return null;
    });
    expect(from[2]).toBeLessThan(-0.3);
  });
});

describe('a report', () => {
  const built = () => [facingNorth];

  it('looks five times a second and says what it saw once a second of walking', () => {
    const senses = createSenses('green', [GUARD]);
    const reports = [];
    // 20 ms frames, so the sums are whole: 1000/60 adds up to just under a second.
    for (let i = 0; i < 50; i++) {
      const report = senses.frame(20, [0, 0, -1], built, open);
      if (report) reports.push(report);
    }
    expect(reports).toHaveLength(1);
    const [report] = reports as [{ type: string; space: string; ms: number; npcs: Record<string, { seen: number[] }> }];
    expect(report).toMatchObject({ type: 'ai/sensed', space: 'green', ms: 1000 });
    expect(report.npcs.guard?.seen).toHaveLength(5);
  });

  it('names no NPC that sensed nothing, and says so still, for the sim to calm it', () => {
    const senses = createSenses('green', [GUARD]);
    const report = senses.frame(1000, [0, 0, 5], built, open);
    expect(report).toEqual({ type: 'ai/sensed', space: 'green', ms: 1000, npcs: {} });
  });

  it('hears running once a report, landing and Interact each time, within both reaches', () => {
    const senses = createSenses('green', [GUARD]);
    for (let i = 0; i < 10; i++) senses.noise('run', [0, 0, 5], built);
    senses.noise('land', [0, 0, 4.9], built);
    senses.noise('land', [0, 0, 5.1], built);
    senses.noise('use', [0, 0, 3], built);
    expect(senses.frame(1000, [0, 0, 5], built, open)).toMatchObject({ npcs: { guard: { heard: 3 } } });
    const deaf = createSenses('green', [{ ...GUARD, hearing: 2 }]);
    deaf.noise('run', [0, 0, 3], built);
    expect(deaf.frame(1000, [0, 0, 3], built, open)).toMatchObject({ npcs: {} });
  });

  it('says nothing in a space with no NPC that senses', () => {
    expect(createSenses('green', []).frame(5000, [0, 0, 0], built, open)).toBeNull();
  });
});
