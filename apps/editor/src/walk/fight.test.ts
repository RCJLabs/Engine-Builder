/**
 * The walk's fights without a world (M6.4, D76): a stand-in for Rapier's ray, so what fight.ts sends
 * is all there is to read. An engaged archer draws and looses at the player; its arrow, landing,
 * sends its hit only while the archer is still in the fight and standing, as the sim would take it.
 * And the distance the crowd keeps each fighter at, and a fallen NPC laid down as a body to search.
 */
import { type FightView, type SpaceAsk, weaponView } from '@eb/ui';
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../spaces/vec.ts';
import { createFight, WAITING_M } from './fight.ts';
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
    emptied: [],
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

describe('the fight’s other duties', () => {
  function camp(view: FightView) {
    const fell: string[] = [];
    let bodies: readonly { readonly path: string; readonly label: string }[] = [];
    const walker = { cast: () => null, fell: (path: string) => fell.push(path) } as unknown as Walker;
    const outbox: Outbox = { post: () => Promise.resolve('accepted'), pump() {}, close() {}, size: 0 };
    const fight = createFight({ fight: () => view } as SpaceAsk, outbox, {
      walker,
      npcs: () => [
        { actor: 'rook', path: 'rook', at: [0, 0, -3] as Vec3, height: 1.75, here: true },
        { actor: 'wren', path: 'wren', at: [0, 0, -9] as Vec3, height: 1.65, here: true },
      ],
      bodies: (uses) => {
        bodies = uses;
      },
    });
    if (!fight) throw new Error('No fight');
    return { fight, fell, bodies: () => bodies };
  }
  const base: FightView = {
    player: 'hero',
    weapons: { hero: SWORD, rook: SWORD, wren: BOW },
    fallen: [],
    searched: [],
    emptied: [],
    engaged: ['rook'],
  };

  it('keeps an engaged fighter at its reach or most of its range, and one waiting at 5 m, backing away', () => {
    const { fight } = camp(base);
    expect(fight.keep('rook')).toEqual({ distance: SWORD.reach - 0.3 });
    expect(fight.keep('wren')).toEqual({ distance: WAITING_M, away: true });
    expect(camp({ ...base, engaged: ['wren'] }).fight.keep('wren')).toEqual({ distance: BOW.range * 0.8 });
  });

  it('lays a fallen NPC down once, takes its body out of the way, and offers it to Search', () => {
    const { fight, fell, bodies } = camp({ ...base, fallen: ['rook'] });
    fight.frame();
    fight.frame();
    expect(fell).toEqual(['rook']);
    expect(fight.fell('rook')).toBe(true);
    // Its animator lies it down (M6.5): anim.down holds for it and for no one standing.
    expect(fight.anim('rook').down).toBe(true);
    expect(fight.anim('wren').down).toBe(false);
    expect(bodies().map((b) => `${b.path} ${b.label}`)).toEqual(['rook Search']);
  });
});

describe('what an animator reads of a fighter (M6.5)', () => {
  it('gives a swing’s phase and its seconds, a bow’s draw, and a hit for 0.4 s once the sim takes it', async () => {
    const view: FightView = {
      player: 'hero',
      weapons: { hero: SWORD, wren: BOW },
      fallen: [],
      searched: [],
      emptied: [],
      engaged: ['wren'],
    };
    let flying = false;
    const walker = { cast: () => (flying ? { toi: 0.1, player: true } : null), fell() {} } as unknown as Walker;
    const outbox: Outbox = { post: () => Promise.resolve('accepted'), pump() {}, close() {}, size: 0 };
    const fight = createFight({ fight: () => view } as SpaceAsk, outbox, {
      walker,
      npcs: () => [{ actor: 'wren', path: 'wren', at: [0, 0, -10] as Vec3, height: 1.7, here: true }],
      bodies() {},
    });
    if (!fight) throw new Error('No fight');
    const feet: Vec3 = [0, 0, 0];
    expect(fight.anim('hero')).toEqual({ swing: 'none', draw: 'none', weapon: 'melee', down: false, hit: false });
    fight.step(true, feet, 0);
    const hero = fight.anim('hero');
    expect(hero.swing).toBe('windup');
    expect(hero.phase?.length).toBeCloseTo(SWORD.windup / 1000, 9);
    expect(hero.phase?.at).toBeCloseTo(1 / 60, 9);
    const wren = fight.anim('wren');
    expect([wren.swing, wren.draw, wren.weapon]).toEqual(['none', 'draw', 'ranged']);
    for (let i = 0; i < 120 && fight.arrows().length === 0; i++) fight.step(false, feet, 0);
    flying = true;
    fight.step(false, feet, 0);
    expect(fight.anim('hero').hit).toBe(false);
    // The sim's answer comes back before the next step.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fight.anim('hero').hit).toBe(true);
    flying = false;
    // 23 steps on it still holds; the 24th makes 0.4 s, and it ends.
    for (let i = 0; i < 23; i++) fight.step(false, feet, 0);
    expect(fight.anim('hero').hit).toBe(true);
    fight.step(false, feet, 0);
    expect(fight.anim('hero').hit).toBe(false);
  });
});
