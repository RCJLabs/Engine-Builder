/** The buses' gains (M4.8): Sound is the master, each bus its headroom times its volume, Effects setting the interface's too. */
import { describe, expect, it } from 'vitest';
import { busGains, HEADROOM } from './player.ts';

describe('busGains', () => {
  it('sets each bus to its headroom times its volume, the master to Sound', () => {
    expect(busGains({ sound: 80, music: 100, ambience: 100, effects: 100, vibration: true })).toEqual({
      master: 0.8,
      ...HEADROOM,
    });
    expect(busGains({ sound: 100, music: 50, ambience: 0, effects: 70, vibration: false })).toEqual({
      master: 1,
      music: 0.3,
      ambience: 0,
      effects: 0.7,
      interface: 0.42,
    });
    expect(HEADROOM).toEqual({ music: 0.6, ambience: 0.7, effects: 1, interface: 0.6 });
  });
});
