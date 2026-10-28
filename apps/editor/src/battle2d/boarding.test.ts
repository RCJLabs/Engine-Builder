/**
 * The boarding deck's battle, headless (M7.5, D87, docs/specs/tactics.md#a-stage-in-code): the deck walked as the
 * page walks it, the alarm sending Ines and Oren to their posts and the boarders' sheet starting the battle only
 * once both stand there, each where their walker stands; the clock stopping while it is fought; the crew played
 * by the kit's own AI to an end over seeds, which the e2e's winning line replays; and no second battle after.
 */
import { type Action, canonicalJson } from '@eb/core';
import { aiAction, arenaOf, type TacticsSlice } from '@eb/kits';
import { beforeAll, describe, expect, it } from 'vitest';
import { type Boarding, inBattle, openBoarding, toBattle, walkBoarding } from '../../test/boardingWalk.ts';
import { tileUnder } from '../stage2d/tilemap2d.ts';

let boarding: Boarding;
beforeAll(async () => {
  boarding = await openBoarding();
}, 30_000);

const sliceOf = (state: unknown) => (state as { tactics: TacticsSlice }).tactics;

describe('the boarders', () => {
  it('come only once Ines and Oren both stand at their posts, each unit where its walker stands', () => {
    const quiet = walkBoarding(boarding, '1');
    for (let i = 0; i < 600; i++) quiet.frame();
    expect(inBattle(quiet.play)).toBe(false);
    const { play, walkers, heard } = toBattle(boarding, '1');
    expect(heard).toContain('ines bridge');
    expect(heard).toContain('oren bridge-door');
    const units = play.view.world?.battle?.view?.units ?? [];
    expect(units.map((u) => `${u.id} ${u.actor} ${u.side}`)).toEqual([
      'c1 ines crew',
      'c2 oren crew',
      'e1 pirate foes',
      'e2 pirate foes',
      'e3 brute foes',
    ]);
    for (const actor of ['ines', 'oren'])
      expect(units.find((u) => u.actor === actor)?.at, actor).toEqual(
        tileUnder(boarding.tiles, walkers.get(actor)?.at ?? [0, 0]),
      );
    // While it is fought the clock stands still and only the battle's actions are offered.
    expect(play.view.offered.every((o) => o.type.startsWith('tactics/'))).toBe(true);
    expect(play.view.world?.clock).toBeUndefined();
  });

  it('is fought to an end by the kit’s AI on every seed, the crew winning some, and never comes again', () => {
    const { content } = boarding.opened.setup.sim;
    let won = 0;
    const SEEDS = 20;
    for (let n = 1; n <= SEEDS; n++) {
      const walked = toBattle(boarding, String(n));
      const { play } = walked;
      for (let i = 0; i < 400 && inBattle(play); i++) {
        const battle = sliceOf(play.state).battle;
        if (!battle) break;
        const move = aiAction(arenaOf(content, boarding.world.tiles ?? {}, battle.battle), battle);
        const action = { ...move, type: `tactics/${move.type}` } as Action;
        expect(
          play.view.offered.some((o) => canonicalJson(o) === canonicalJson(action)),
          JSON.stringify(action),
        ).toBe(true);
        expect(play.act(action).accepted).toBe(true);
      }
      expect(inBattle(play), `seed ${n}`).toBe(false);
      const slice = sliceOf(play.state);
      if (slice.won.boarders === 1) won++;
      // The shift goes on, the clock again, and the sheet never starts it twice.
      for (let i = 0; i < 300; i++) walked.frame();
      expect(sliceOf(play.state).fought).toEqual({ boarders: 1 });
    }
    console.log(`boarding: the crew won ${won} of ${SEEDS}`);
    expect(won).toBeGreaterThan(0);
  });
});
