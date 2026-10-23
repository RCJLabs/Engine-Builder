/**
 * Fighting in a game (docs/specs/encounters.md#fighting-it): the brawl's crew and ship against
 * raiders and a brute. The roll lands in the preview's table, the hurt falls front first, the
 * fallen are seen to, and the result's effects run.
 */
import type { GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { brawled, brawlWith, RECORDS } from '../../test/brawl.ts';
import { type Fighter, type FightRow, volley } from './index.ts';
import { fightTable } from './table.ts';

const { start, apply, reduce, fact, preview, game, sim } = brawled;
const hp = (state: GameState, actor: string) => fact(state, 'stats.current', { actor, stat: 'hp' }) as number;
const crewHurt = (state: GameState) => 10 - hp(state, 'ana') - hp(state, 'bo') - hp(state, 'cy');

/** The fight's preview as the sim reads the state, and the beats of fighting it. */
function fought(state: GameState, effect: Record<string, unknown>) {
  const shown = preview(state, { effect: 'fight', ...effect });
  const step = reduce(state, { effect: 'fight', ...effect });
  expect(step.accepted).toBe(true);
  const beat = step.beats.find((b) => b.type === 'encounters/fought') as unknown as Record<string, unknown>;
  return { shown, after: step.state, beat, beats: step.beats };
}

describe('a fight', () => {
  it('rolls once against the table its preview shows, the roll landing in the row of its result and hurt', () => {
    for (let n = 0; n < 40; n++) {
      const state = start(`raid-${n}`);
      const { shown, after, beat } = fought(state, { encounter: 'raiders' });
      const rows = shown.rows as FightRow[];
      let to = 0;
      const row = rows.find((r) => {
        to += r.weight;
        return (beat.roll as number) <= to;
      }) as FightRow;
      expect({ result: beat.result, hurt: beat.hurt }).toEqual({ result: row.result, hurt: row.hurt });
      expect(crewHurt(after)).toBe(beat.hurt);
    }
  });

  it('shows the crew front first, each raider, and each result with its chance, hurt, falls and effects', () => {
    const shown = preview(start(), { effect: 'fight', encounter: 'raiders' });
    expect(shown).toMatchObject({
      encounter: 'raiders',
      combat: 'melee',
      health: 'hp',
      fighters: ['ana', 'bo', 'cy'],
      foes: ['raider', 'raider', 'raider'],
    });
    const outcomes = shown.outcomes as { result: string; chance: number; effects: { from: number; to: number }[] }[];
    expect(outcomes.reduce((sum, o) => sum + o.chance, 0)).toBe(100);
    expect(outcomes.find((o) => o.result === 'win')?.effects[0]).toMatchObject({ from: 0, to: 3 });
  });

  it('puts the hurt on the front and what is left over on the next, the fallen downed and gone from the roster', () => {
    // Seeds until Ana falls: her 5 lost, the rest on Bo.
    for (let n = 0; n < 200; n++) {
      const { after, beat, beats } = fought(start(`fall-${n}`), { encounter: 'raiders' });
      if ((beat.hurt as number) < 5) continue;
      const hurt = beat.hurt as number;
      expect(hp(after, 'ana')).toBe(0);
      expect(hp(after, 'bo')).toBe(Math.max(0, 3 - (hurt - 5)));
      expect(fact(after, 'stats.has', { actor: 'ana', status: 'downed' })).toBe(1);
      expect(fact(after, 'roster.member', { actor: 'ana' })).toBe(false);
      expect(fact(after, 'roster.left', { actor: 'ana' })).toBe('fell to raiders');
      expect(
        beats.filter((b) => b.type === 'encounters/fell').map((b) => (b as unknown as { actor: string }).actor),
      ).toContain('ana');
      return;
    }
    throw new Error('Ana never fell in 200 seeds');
  });

  it('counts fights, wins and losses, and runs the result’s effects', () => {
    let state = start('counts');
    const results: string[] = [];
    for (let n = 0; n < 6; n++) {
      const { after, beat } = fought(state, { encounter: 'brute', fighters: ['ship'] });
      results.push(beat.result as string);
      state = apply(after, { effect: 'heal-stat', actor: 'ship', stat: 'hp' });
    }
    const count = (result: string) => results.filter((r) => r === result).length;
    expect(fact(state, 'encounters.fought', { encounter: 'brute' })).toBe(6);
    expect(fact(state, 'encounters.won', { encounter: 'brute' })).toBe(count('win'));
    expect(fact(state, 'encounters.lost', { encounter: 'brute' })).toBe(count('lose'));
    const loot = fought(start('loot'), { encounter: 'raiders' });
    const by = { win: 3, lose: -1, draw: 0 }[loot.beat.result as 'win' | 'lose' | 'draw'];
    expect(fact(loot.after, 'flag.number', { flag: 'loot' })).toBe(by);
  });
});

describe('who fights', () => {
  const reader = (state: GameState) => ({
    content: game.content(state, sim),
    fact: (id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim),
  });

  it('is the roster in the order they joined, those already down left out', () => {
    let state = start();
    state = apply(state, { effect: 'leave', actor: 'ana', why: 'shore leave' }, { effect: 'join', actor: 'ana' });
    expect(
      fightTable(reader(state), { roster: true }, { effect: 'fight', encounter: 'raiders' }).match.party.map(
        (f) => f.actor,
      ),
    ).toEqual(['bo', 'cy', 'ana']);
    state = apply(state, { effect: 'damage-stat', actor: 'bo', stat: 'hp', by: 3 });
    expect(preview(state, { effect: 'fight', encounter: 'raiders' }).fighters).toEqual(['cy', 'ana']);
  });

  it('is the actors a fight or its encounter names, and a fight’s own names win', () => {
    expect(preview(start(), { effect: 'fight', encounter: 'boarding' }).fighters).toEqual(['ship']);
    expect(preview(start(), { effect: 'fight', encounter: 'boarding', fighters: ['cy', 'cy'] }).fighters).toEqual([
      'cy',
    ]);
  });

  it('loses at once with nobody standing', () => {
    const state = apply(start(), { effect: 'damage-stat', actor: 'ship', stat: 'hp', by: 6 });
    expect(preview(state, { effect: 'fight', encounter: 'boarding' }).rows).toEqual([
      { result: 'lose', hurt: 0, weight: 10_000 },
    ]);
  });

  it('can’t be the roster without its kit: the fight names nobody (E054)', () => {
    const alone = brawlWith(RECORDS, false);
    expect(() => alone.preview(alone.start(), { effect: 'fight', encounter: 'raiders' })).toThrow(/E054/);
    expect(alone.preview(alone.start(), { effect: 'fight', encounter: 'boarding' }).fighters).toEqual(['ship']);
  });
});

describe('a stance', () => {
  it('adds to each of the party’s stats for the fight, and a status and gear count as well', () => {
    const table = (effect: Record<string, unknown>, state = start()) =>
      fightTable(
        { content: game.content(state, sim), fact: (id, args) => game.fact(state, id, args, sim) },
        { roster: true },
        { effect: 'fight', encounter: 'raiders', ...effect },
      ).match.party[0];
    expect(table({})).toMatchObject({ actor: 'ana', health: 5, hit: 60, dodge: 0, damage: 2, armour: 0 });
    expect(table({ hit: 15, dodge: 5, damage: -1, armour: 2 })).toMatchObject({
      hit: 75,
      dodge: 5,
      damage: 1,
      armour: 2,
    });
    const keen = apply(start(), { effect: 'add-status', actor: 'ana', status: 'keen' });
    expect(table({}, keen)).toMatchObject({ hit: 80 });
  });

  it('moves the odds: a keener crew wins more often', () => {
    const win = (effect: Record<string, unknown>) =>
      (
        preview(start(), { effect: 'fight', encounter: 'raiders', ...effect }).outcomes as {
          result: string;
          chance: number;
        }[]
      ).find((o) => o.result === 'win')?.chance ?? 0;
    expect(win({ hit: 20 })).toBeGreaterThan(win({}));
    expect(win({ hit: -30 })).toBeLessThan(win({}));
  });

  it('can’t push a hit’s chance past the combat’s bounds, 5 and 95% when it leaves them unset', () => {
    const state = start();
    const reader = {
      content: game.content(state, sim),
      fact: (id: string, args?: Record<string, unknown>) => game.fact(state, id, args, sim),
    };
    const match = (hit: number) =>
      fightTable(reader, { roster: true }, { effect: 'fight', encounter: 'raiders', hit }).match;
    expect(match(0)).toMatchObject({ hitMin: 5, hitMax: 95 });
    // Three of the crew, each striking the front raider: at -100 each still hits 5% of the time.
    const missed = (m: ReturnType<typeof match>) => volley(m.party, 0, m.foes[0] as Fighter, m)[0];
    expect(missed(match(-100))).toBeCloseTo(0.95 * 0.95 * 0.95, 12);
    expect(missed(match(100))).toBeCloseTo(0.05 * 0.05 * 0.05, 12);
  });
});
