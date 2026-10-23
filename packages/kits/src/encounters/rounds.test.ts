/**
 * A fight worked out round by round (docs/specs/encounters.md#working-a-fight-out): fights small
 * enough to work out by hand, and random small fights against a second way of working them out,
 * which follows each fighter's health and every strike on its own.
 */
import { Rng } from '@eb/core';
import { describe, expect, it } from 'vitest';
import type { Fighter, Match } from './lines.ts';
import { breakAt, endsOf, fallenAt, volley } from './rounds.ts';
import { RESULTS, type Result } from './types.ts';

const fighter = (health: number, more: Partial<Fighter> = {}): Fighter => ({
  actor: 'x',
  health,
  hit: 50,
  dodge: 0,
  damage: 1,
  armour: 0,
  ...more,
});
const match = (party: Fighter[], foes: Fighter[], more: Partial<Match> = {}): Match => ({
  encounter: 'e',
  combat: 'c',
  health: 'hp',
  party,
  foes,
  hitMin: 0,
  hitMax: 100,
  rounds: 20,
  breaks: 100,
  ...more,
});
const sure = (health: number, damage = 1) => fighter(health, { hit: 100, damage });

describe('a round', () => {
  it('adds each strike in turn: two at even odds, for 2 and 3', () => {
    const strikers = [fighter(1, { damage: 2 }), fighter(1, { damage: 3 })];
    expect(volley(strikers, 0, fighter(1), match([], []))).toEqual([0.25, 0, 0.25, 0.25, 0, 0.25]);
  });

  it('starts at the front, takes the target’s dodge off the hit and its armour off the damage, at least 1', () => {
    const strikers = [fighter(1, { hit: 100, damage: 9 }), fighter(1, { hit: 70, damage: 3 })];
    const target = fighter(1, { dodge: 20, armour: 5 });
    // Only the second strikes: 70 − 20 = 50%, for max(1, 3 − 5) = 1.
    expect(volley(strikers, 1, target, match([], []))).toEqual([0.5, 0.5]);
  });

  it('keeps a hit’s chance within the combat’s bounds', () => {
    const bounded = match([], [], { hitMin: 5, hitMax: 95 });
    expect(volley([fighter(1, { hit: 200 })], 0, fighter(1), bounded)[1]).toBeCloseTo(0.95, 12);
    expect(volley([fighter(1, { hit: 0 })], 0, fighter(1, { dodge: 50 }), bounded)[1]).toBeCloseTo(0.05, 12);
  });
});

describe('a fight', () => {
  it('ends in a win once the foes break, the party’s hurt kept', () => {
    // Every strike lands: after two rounds the raider is out and Ana has lost 2 of 3.
    const ends = endsOf(match([sure(3)], [sure(2)]));
    expect(ends).toEqual({ win: [0, 0, 1, 0], draw: [0, 0, 0, 0], lose: [0, 0, 0, 0] });
  });

  it('is a draw when both sides go down in the same round, or the rounds run out', () => {
    expect(endsOf(match([sure(1)], [sure(1)]))).toEqual({ win: [0, 0], draw: [0, 1], lose: [0, 0] });
    const short = endsOf(match([fighter(1)], [fighter(1)], { rounds: 1 }));
    expect(short).toEqual({ win: [0.25, 0], draw: [0.25, 0.25], lose: [0, 0.25] });
  });

  it('is lost at once with no one standing, and won at once against no one', () => {
    expect(endsOf(match([], [sure(2)]))).toEqual({ win: [0], draw: [0], lose: [1] });
    expect(endsOf(match([sure(2)], []))).toEqual({ win: [1, 0, 0], draw: [0, 0, 0], lose: [0, 0, 0] });
  });

  it('breaks the foes at a share of their health, rounded up', () => {
    expect(breakAt([fighter(4), fighter(6)], 50)).toBe(5);
    expect(breakAt([fighter(4), fighter(6)], 33)).toBe(4);
    expect(breakAt([fighter(4), fighter(6)], 100)).toBe(10);
    // Broken at 1 of 2: the first sure strike wins it.
    expect(endsOf(match([sure(3)], [sure(2)], { breaks: 50 })).win).toEqual([0, 1, 0, 0]);
  });

  it('puts hurt on the front and what is left over on the next', () => {
    const line = [fighter(2), fighter(3), fighter(1)];
    expect([0, 1, 2, 4, 5, 6].map((hurt) => fallenAt(line, hurt))).toEqual([0, 0, 1, 1, 2, 3]);
    // Ana's 3 a hit fells the first raider and wounds the next, 3 of their 4; both struck back at
    // once, standing as the round began, so she has lost 2 when the one round runs out.
    const ends = endsOf(match([sure(9, 3)], [sure(2), sure(2)], { rounds: 1 }));
    expect(ends.draw[2]).toBe(1);
    // Two rounds: the wounded raider falls to her next blow, and only it strikes back.
    expect(endsOf(match([sure(9, 3)], [sure(2), sure(2)], { rounds: 2 })).win[3]).toBe(1);
  });
});

/** The oracle: every fighter's health and every strike on its own, by enumeration. */
function oracle(m: Match): Record<Result, number[]> {
  const partyTotal = m.party.reduce((s, f) => s + f.health, 0);
  const foeTotal = m.foes.reduce((s, f) => s + f.health, 0);
  const breaking = breakAt(m.foes, m.breaks);
  const ends: Record<Result, number[]> = { win: [], draw: [], lose: [] };
  for (const r of RESULTS) ends[r] = new Array(partyTotal + 1).fill(0);
  const hurtOf = (line: number[], of: readonly Fighter[]) => of.reduce((s, f, i) => s + f.health - (line[i] ?? 0), 0);
  const strikes = (by: readonly Fighter[], line: number[], at: Fighter) =>
    by
      .filter((_, i) => (line[i] ?? 0) > 0)
      .map((s) => ({
        p: Math.min(m.hitMax, Math.max(m.hitMin, s.hit - at.dodge)) / 100,
        d: Math.max(1, s.damage - at.armour),
      }));
  const outcomes = (list: { p: number; d: number }[]): [number, number][] =>
    list.reduce<[number, number][]>(
      (acc, s) => acc.flatMap(([q, d]) => [[q * (1 - s.p), d] as [number, number], [q * s.p, d + s.d]]),
      [[1, 0]],
    );
  const hit = (line: number[], by: number) => {
    const next = [...line];
    let left = by;
    for (let i = 0; i < next.length && left > 0; i++) {
      const take = Math.min(next[i] as number, left);
      next[i] = (next[i] as number) - take;
      left -= take;
    }
    return next;
  };
  const front = (line: number[], of: readonly Fighter[]) => of[line.findIndex((h) => h > 0)] as Fighter;
  function walk(party: number[], foes: number[], q: number, round: number) {
    const [hurt, lost] = [hurtOf(party, m.party), hurtOf(foes, m.foes)];
    const down = hurt >= partyTotal;
    const broken = lost >= breaking || foeTotal === 0;
    if (down || broken || round === m.rounds) {
      const r: Result = down && broken ? 'draw' : broken ? 'win' : down ? 'lose' : 'draw';
      (ends[r] as number[])[hurt] = ((ends[r] as number[])[hurt] as number) + q;
      return;
    }
    for (const [qa, da] of outcomes(strikes(m.party, party, front(foes, m.foes)))) {
      for (const [qb, db] of outcomes(strikes(m.foes, foes, front(party, m.party)))) {
        walk(hit(party, db), hit(foes, da), q * qa * qb, round + 1);
      }
    }
  }
  walk(
    m.party.map((f) => f.health),
    m.foes.map((f) => f.health),
    1,
    0,
  );
  return ends;
}

describe('worked out exactly', () => {
  it('agrees with every fighter and strike followed on its own, over 60 random small fights', () => {
    const rng = Rng.create('encounters-oracle');
    for (let n = 0; n < 60; n++) {
      const side = (count: number) =>
        Array.from({ length: count }, () =>
          fighter(rng.int(1, 3), {
            hit: rng.int(20, 90),
            dodge: rng.int(0, 15),
            damage: rng.int(1, 3),
            armour: rng.int(0, 1),
          }),
        );
      const m = match(side(rng.int(1, 2)), side(rng.int(1, 3)), {
        rounds: rng.int(1, 4),
        breaks: rng.int(0, 1) === 0 ? 50 : 100,
        hitMin: 5,
        hitMax: 95,
      });
      const [ours, theirs] = [endsOf(m), oracle(m)];
      for (const r of RESULTS) {
        (ours[r] as number[]).forEach((q, hurt) => {
          expect(q).toBeCloseTo((theirs[r] as number[])[hurt] as number, 12);
        });
      }
      const sum = RESULTS.flatMap((r) => [...ours[r]]).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 12);
    }
  });
});

describe('the tables kept', () => {
  // endsOf keeps the last tables it worked out (M4.12): a number left out of their key would hand
  // one fight another's table.
  it('gives the same numbers the same table, and works a fight out again when any number changes', () => {
    const party = [fighter(3, { hit: 60, damage: 2 }), fighter(2)];
    const foes = [fighter(3), fighter(2, { hit: 20, damage: 2 })];
    const base = match(party, foes, { hitMin: 5, hitMax: 95, rounds: 6, breaks: 60 });
    const first = endsOf(base);
    expect(endsOf({ ...base, party: party.map((f) => ({ ...f })) })).toBe(first);
    const changed = (line: Fighter[], key: keyof Omit<Fighter, 'actor'>, by: number) =>
      line.map((f, i) => (i === 0 ? { ...f, [key]: f[key] + by } : f));
    const others: [string, Match][] = [
      ['hitMin', { ...base, hitMin: 30 }],
      ['hitMax', { ...base, hitMax: 50 }],
      ['rounds', { ...base, rounds: 2 }],
      ['breaks', { ...base, breaks: 100 }],
      ...(['health', 'hit', 'dodge', 'damage', 'armour'] as const).flatMap((key): [string, Match][] => [
        [`the party's ${key}`, { ...base, party: changed(party, key, key === 'hit' ? -30 : 1) }],
        [`the foes' ${key}`, { ...base, foes: changed(foes, key, key === 'hit' ? 30 : 1) }],
      ]),
    ];
    for (const [what, other] of others) expect(endsOf(other), what).not.toEqual(first);
  });
});
