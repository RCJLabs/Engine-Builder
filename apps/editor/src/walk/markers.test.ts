/**
 * Where the quest markers point (M6.6, docs/specs/markers.md): bearings from the camera's yaw, the
 * compass's points, and each kind of target here, elsewhere through a door, and nowhere.
 */
import type { QuestMarker } from '@eb/ui';
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../spaces/vec.ts';
import {
  bearingOf,
  compassPoints,
  distanceOf,
  type MarkerWorld,
  markerPoints,
  stripOffset,
  wrapped,
} from './markers.ts';

const O: Vec3 = [0, 0, 0];

describe('bearingOf', () => {
  it('is right positive from the way yaw 0 looks, along -z', () => {
    expect(bearingOf(O, [0, 0, -5], 0)).toBeCloseTo(0);
    expect(bearingOf(O, [5, 0, 0], 0)).toBeCloseTo(90);
    expect(bearingOf(O, [-5, 0, 0], 0)).toBeCloseTo(-90);
    expect(Math.abs(bearingOf(O, [0, 0, 5], 0))).toBeCloseTo(180);
  });

  it('turns with the camera: yaw 90 looks west, so north is to the right', () => {
    expect(bearingOf(O, [-5, 0, 0], 90)).toBeCloseTo(0);
    expect(bearingOf(O, [0, 0, -5], 90)).toBeCloseTo(90);
    expect(bearingOf([3, 0, 3], [3, 0, -2], -90)).toBeCloseTo(-90);
  });

  it('is held to (-180, 180]', () => {
    expect(wrapped(190)).toBe(-170);
    expect(wrapped(-180)).toBe(180);
    expect(wrapped(540)).toBe(180);
    expect(wrapped(-30)).toBe(-30);
  });
});

describe('the compass', () => {
  it('shows the points within 90° either side, placed by bearing', () => {
    expect(compassPoints(0)).toEqual([
      { label: 'N', offset: 0 },
      { label: 'E', offset: 1 },
      { label: 'W', offset: -1 },
    ]);
    expect(compassPoints(-45).map((p) => p.label)).toEqual(['N', 'E']);
  });

  it('holds a pip past its edge at the edge', () => {
    expect(stripOffset(45)).toBe(0.5);
    expect(stripOffset(170)).toBe(1);
    expect(stripOffset(-120)).toBe(-1);
  });

  it('measures distance across the ground', () => {
    expect(distanceOf([0, 9, 0], [3, 0, 4])).toBe(5);
  });
});

describe('markerPoints', () => {
  const places = new Map<string, Vec3>([
    ['rope', [2, 0, -3]],
    ['door', [0, 0, 10]],
  ]);
  const world: MarkerWorld = {
    here: 'glen',
    // The glen's door leads to the bothy; the bothy's own door to the loft.
    doors: { glen: { door: 'bothy' }, bothy: { hatch: 'loft' } },
    place: (path) => places.get(path),
    actor: (id) =>
      id === 'ada'
        ? { space: 'glen', at: [4, 0, 4], height: 1.8 }
        : id === 'bram'
          ? { space: 'loft' }
          : id === 'cora'
            ? { space: 'barn' }
            : undefined,
  };
  const marker = (objective: string, target: QuestMarker['target']): QuestMarker => ({
    quest: 'supplies',
    objective,
    text: objective,
    target,
  });

  it('stands over an object here, over an actor’s head here, and at the door toward elsewhere', () => {
    const points = markerPoints(
      [
        marker('rope', { space: 'glen', object: 'rope' }),
        marker('ada', { actor: 'ada' }),
        marker('lamp', { space: 'bothy', object: 'lamp' }),
        marker('bram', { actor: 'bram' }),
      ],
      world,
    );
    expect(points.map((p) => [p.objective, p.at, p.door])).toEqual([
      ['rope', [2, 0.5, -3], undefined],
      ['ada', [4, 2.1, 4], undefined],
      ['lamp', [0, 0.5, 10], 'door'],
      // Two doors away: the door out of here on the way.
      ['bram', [0, 0.5, 10], 'door'],
    ]);
  });

  it('shows nothing for this space itself, a space no door reaches, or what isn’t there', () => {
    const points = markerPoints(
      [
        marker('here', { space: 'glen' }),
        marker('barn', { space: 'barn' }),
        marker('cora', { actor: 'cora' }),
        marker('lost', { space: 'glen', object: 'lost' }),
        marker('nobody', { actor: 'nobody' }),
      ],
      world,
    );
    expect(points).toEqual([]);
  });
});
