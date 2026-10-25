/** NPCs turning to face the player (M6.1, D73): the yaw toward them, the short way round, eased, and back. */
import { describe, expect, it } from 'vitest';
import { BACK_MS, createFacing, FACE_MS, shortest, yawAt, yawToward } from './facing.ts';

describe('facing', () => {
  it('faces −z at 0°, as a turn’s yaw is read, and the other ways round from there', () => {
    expect(yawToward([0, 0, 0], [0, 0, -5])).toBe(0);
    expect(yawToward([0, 0, 0], [-5, 0, 0])).toBeCloseTo(90, 9);
    expect(yawToward([0, 0, 0], [5, 0, 0])).toBeCloseTo(-90, 9);
    expect(Math.abs(yawToward([2, 0, 2], [2, 9, 7]))).toBeCloseTo(180, 9);
    expect(yawToward([1, 0, 1], [1, 3, 1])).toBe(0);
  });

  it('turns the short way round, past ±180', () => {
    expect(shortest(170, -170)).toBe(20);
    expect(shortest(-170, 170)).toBe(-20);
    expect(shortest(0, 90)).toBe(90);
    expect(shortest(10, 10)).toBe(0);
  });

  it('eases a turn in and out, and ends it where it was going', () => {
    const turn = { path: 'smith', from: 170, to: -170, start: 1000, ms: 200 };
    expect(yawAt(turn, 900)).toBe(170);
    expect(yawAt(turn, 1100)).toBeCloseTo(180, 9);
    expect(yawAt(turn, 1050)).toBeLessThan(175);
    expect(yawAt(turn, 1200)).toBe(190);
    expect(yawAt(turn, 5000)).toBe(190);
  });

  it('faces the player as the talk opens, holds there, and turns back once the walk goes on', () => {
    const facing = createFacing();
    expect(facing.turn(0)).toBeNull();
    facing.face('smith', 1000, 30, 30, -60);
    expect(facing.turning(1000 + FACE_MS / 2)).toBe(true);
    expect(facing.turn(1000 + FACE_MS)).toEqual({ path: 'smith', yaw: -60 });
    // Its time up, one frame more lays its end on the node (M6.3: paused, that frame was lost).
    expect(facing.turning(5000)).toBe(true);
    // Held facing the player while the talk is open: the turn stays, nothing more to draw.
    expect(facing.turning(5001)).toBe(false);
    expect(facing.turn(5000)).toEqual({ path: 'smith', yaw: -60 });
    facing.back(6000);
    expect(facing.turning(6000 + BACK_MS / 2)).toBe(true);
    expect(facing.turn(6000 + BACK_MS)).toEqual({ path: 'smith', yaw: 30 });
    expect(facing.turning(6000 + BACK_MS + 1)).toBe(true);
    expect(facing.turning(6000 + BACK_MS + 2)).toBe(false);
    expect(facing.turn(9000)).toBeNull();
    // A walk going on with nobody faced turns nobody.
    facing.back(9500);
    expect(facing.turn(9500)).toBeNull();
  });
});
