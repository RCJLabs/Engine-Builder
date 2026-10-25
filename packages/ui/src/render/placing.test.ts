/** Where a Space widget's stage starts (M5.9, D71): from the world's view, in the space it draws. */
import { describe, expect, it } from 'vitest';
import { placingIn } from './placing.ts';

describe('placingIn', () => {
  const world = {
    space: 'bothy',
    at: { space: 'bothy', feet: [1, 0, 2] as [number, number, number], yaw: 90 },
    arrive: 'door',
    taken: ['bothy/lamp', 'glen/rope', 'glen/rope-coil'],
  };
  it('stands the player where they stood in the space they are in, and nowhere else', () => {
    expect(placingIn('bothy', world)).toEqual({ at: { feet: [1, 0, 2], yaw: 90 }, arrive: 'door', taken: ['lamp'] });
    expect(placingIn('glen', world)).toEqual({ taken: ['rope', 'rope-coil'] });
    expect(placingIn('bothy', { ...world, at: { ...world.at, space: 'glen' } })).toEqual({
      arrive: 'door',
      taken: ['lamp'],
    });
    expect(placingIn('glen', undefined)).toEqual({ taken: [] });
  });
});
