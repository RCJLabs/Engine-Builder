/**
 * The walk's fights without a world (M6.4, D76): a stand-in for Rapier's ray, so what fight.ts sends
 * is all there is to read. An engaged archer draws and looses at the player; its arrow, landing,
 * sends its hit only while the archer is still in the fight and standing, as the sim would take it.
 */
import { type FightView, type SpaceAsk, weaponView } from '@eb/ui';
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../spaces/vec.ts';
import { createFight } from './fight.ts';
import type { Outbox } from './outbox.ts';
import type { Walker } from './physics.ts';

const BOW = weaponView('bow', { kind: 'ranged', damage: 3 });
const SWORD = weaponView('sword', { kind: 'melee', damage: 4 });

/** Wren 10 m off, engaged and drawing; `after` changes the fight once its arrow flies. */
function archer(after: (view: FightView) => FightView) {
  let view: FightView = {
    player: 'hero',
    weapons: { hero: SWORD, wren: BOW },
    fallen: [],
    searched: [],
    engaged: ['wren'],
  };
  const sent: string[] = [];
  const outbox: Outbox = {
    post: (action) => {
      sent.push(`${action.type} ${String(action.by)}`);
      return Promise.resolve('accepted');
    },
    pump() {},
    close() {},
    size: 0,
  };
  let flying = false;
  // Nothing in the way until the arrow flies; then the ray meets the player's body.
  const walker = {
    cast: () => (flying ? { toi: 0.1, player: true } : null),
    fell() {},
  } as unknown as Walker;
  const ask = { fight: () => view } as SpaceAsk;
  const fight = createFight(ask, outbox, {
    walker,
    npcs: () => [{ actor: 'wren', path: 'wren', at: [0, 0, -10] as Vec3, height: 1.7, here: true }],
    pose() {},
    bodies() {},
  });
  if (!fight) throw new Error('No fight');
  const feet: Vec3 = [0, 0, 0];
  for (let i = 0; i < 120 && fight.arrows().length === 0; i++) fight.step(false, feet, 0);
  expect(fight.arrows()).toHaveLength(1);
  view = after(view);
  flying = true;
  fight.step(false, feet, 0);
  return sent;
}

describe('an archer’s arrow landing', () => {
  it('hits the player while the archer still fights', () => {
    expect(archer((view) => view)).toContain('fighting/hit wren');
  });

  it('sends nothing once the archer has left the fight or fallen', () => {
    expect(archer((view) => ({ ...view, engaged: [] }))).not.toContain('fighting/hit wren');
    expect(archer((view) => ({ ...view, fallen: ['wren'] }))).not.toContain('fighting/hit wren');
  });
});
