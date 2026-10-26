/**
 * A space's map for the Map screen (M6.6, docs/specs/markers.md#in-play): the player's pin where the
 * sim last heard them or at the spawn point, the targets here, the door for one elsewhere, and the
 * baked map's bounds and image, or plain ground squared up round the objects.
 */
import type { PackWorld } from '@eb/core';
import type { QuestMarker } from '@eb/ui';
import { describe, expect, it } from 'vitest';
import { mapOf, squareRound } from './mapPins.ts';

const door = { label: 'Open', effects: [{ effect: 'enter-space', space: 'bothy', spawn: 'mat' }] };
const world: PackWorld = {
  spaces: {
    glen: {
      name: 'Glen',
      objects: [
        { id: 'start', shape: 'box', at: [0, 0, 6], turn: [0, 90, 0], components: { spawn: { start: true } } },
        { id: 'rope', shape: 'box', at: [3, 0, -2] },
        { id: 'door', shape: 'box', at: [-6, 0, 0], components: { interact: { label: 'Open' } } },
      ],
    },
    bothy: { name: 'Bothy', objects: [{ id: 'lamp', shape: 'box', at: [1, 1, 1] }] },
  },
  prefabs: {},
  triggers: {},
  files: { 'spaces/glen.map.webp': 'UklGRg==' },
  records: {},
  fields: {},
  uses: { glen: { door } },
  spawns: { glen: ['start'], bothy: [] },
  start: 'glen',
};
const marker = (objective: string, target: QuestMarker['target']): QuestMarker => ({
  quest: 'supplies',
  objective,
  text: `Find the ${objective}`,
  target,
});
const MARKERS = [marker('rope', { space: 'glen', object: 'rope' }), marker('lamp', { space: 'bothy', object: 'lamp' })];

describe('mapOf', () => {
  it('pins the player at the start, the rope here and the door toward the lamp, on plain ground', () => {
    const map = mapOf(world, { space: 'glen', markers: MARKERS });
    expect(map.image).toBeUndefined();
    expect(map.pins).toEqual([
      { kind: 'player', at: [0, 6], yaw: 90 },
      { kind: 'target', at: [3, -2], quest: 'supplies', objective: 'rope', text: 'Find the rope' },
      { kind: 'door', at: [-6, 0], quest: 'supplies', objective: 'lamp', text: 'Find the lamp' },
    ]);
    // Squared up round the objects, 4 m to spare: x from -6 to 3, z from -2 to 6.
    expect(map.bounds).toEqual(
      squareRound([
        [-6, -2],
        [3, 6],
      ]),
    );
    expect(map.bounds[2] - map.bounds[0]).toBe(map.bounds[3] - map.bounds[1]);
  });

  it('pins the player where the sim last heard them, and draws the baked map in its bounds', () => {
    const baked = {
      ...world,
      maps: { glen: { bounds: [-20, -20, 20, 20], size: [1024, 1024], image: 'spaces/glen.map.webp' } },
    } as PackWorld;
    const map = mapOf(baked, { space: 'glen', markers: [], at: { feet: [1, 0, 2], yaw: -30 } });
    expect(map.pins).toEqual([{ kind: 'player', at: [1, 2], yaw: -30 }]);
    expect(map.bounds).toEqual([-20, -20, 20, 20]);
    expect(map.image).toBe('data:image/webp;base64,UklGRg==');
  });

  it('squares up round no points as a little ground about the origin', () => {
    expect(squareRound([])).toEqual([-4, -4, 4, 4]);
    expect(
      squareRound([
        [0, 0],
        [10, 2],
      ]),
    ).toEqual([-4, -8, 14, 10]);
  });
});
