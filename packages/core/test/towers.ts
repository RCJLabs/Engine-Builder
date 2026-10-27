/**
 * A building the room tests share (M7.3, D85): the tower, four floors of two 48 by 24 slots, its crypt and
 * store on the ground, a hall across the first floor, barracks and a chapel above, the watch at the top,
 * and stairs on alternate sides.
 */
import type { PackBuilding } from '../src/world/rooms/index.ts';

export const TOWER: PackBuilding = {
  object: 'tower',
  at: [32, 8],
  slot: [48, 24],
  slots: 2,
  floors: 4,
  climb: 24,
  rooms: {
    crypt: [0, 0, 1],
    store: [0, 1, 1],
    hall: [1, 0, 2],
    barracks: [2, 0, 1],
    chapel: [2, 1, 1],
    watch: [3, 0, 2],
  },
  stairs: [
    [0, 12],
    [1, 84],
    [2, 12],
  ],
  places: { bell: [1, 50], warden: [2, 70], crypt: [0, 20], watch: [3, 40], gap: [0, 95] },
};
