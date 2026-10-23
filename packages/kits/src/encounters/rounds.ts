/**
 * A fight worked out round by round, exactly (docs/specs/encounters.md#working-a-fight-out): the
 * chance of every pair of hurts after each round, until every way the fight can go has ended or
 * the rounds run out. Hurt falls on the front and what is left over on the next, so a side's
 * state is the one number; and the fighters who strike are those from the front on, so a volley
 * depends only on the two fronts, and each pair is worked out once. Floats, added and multiplied
 * in one order, which every engine rounds alike; the table rounds them to whole numbers after.
 */
import type { Fighter, Match } from './lines.ts';
import type { Result } from './types.ts';

/** Each result's chance by the party's hurt, from 0 to the party's total. */
export type Ends = Readonly<Record<Result, readonly number[]>>;

const total = (line: readonly Fighter[]) => line.reduce((sum, fighter) => sum + fighter.health, 0);

/** The foes are broken once their hurt reaches this: `ceil(total × breaks / 100)` in whole numbers. */
export const breakAt = (foes: readonly Fighter[], breaks: number) => Math.floor((total(foes) * breaks + 99) / 100);

/** The front's place in a line at each hurt below its total: the first fighter with health left. */
function frontsOf(line: readonly Fighter[]): number[] {
  const fronts: number[] = [];
  line.forEach((fighter, index) => {
    for (let i = 0; i < fighter.health; i++) fronts.push(index);
  });
  return fronts;
}

/** How many of the line have fallen at a hurt: those whose health and all ahead of them it covers. */
export function fallenAt(line: readonly Fighter[], hurt: number): number {
  let before = 0;
  let fallen = 0;
  for (const fighter of line) {
    before += fighter.health;
    if (before <= hurt) fallen++;
  }
  return fallen;
}

/** The chances of each total the strikers from `from` on deal the target in one round: `dist[0]` none. */
export function volley(strikers: readonly Fighter[], from: number, target: Fighter, match: Match): number[] {
  let dist = [1];
  for (const striker of strikers.slice(from)) {
    const chance = Math.min(match.hitMax, Math.max(match.hitMin, striker.hit - target.dodge));
    const damage = Math.max(1, striker.damage - target.armour);
    const next = new Array<number>(dist.length + damage).fill(0);
    dist.forEach((q, dealt) => {
      next[dealt] = (next[dealt] as number) + (q * (100 - chance)) / 100;
      next[dealt + damage] = (next[dealt + damage] as number) + (q * chance) / 100;
    });
    dist = next;
  }
  return dist;
}

const resultOf = (broken: boolean, down: boolean): Result => (broken && down ? 'draw' : broken ? 'win' : 'lose');

// The ends of the last fights worked out, by their numbers: a choice's odds, a bot's look at them
// and the fight itself all ask for the same table, and a big one takes milliseconds (M4.12).
const KEPT = 64;
const kept = new Map<string, Ends>();

const keyOf = (match: Match) =>
  JSON.stringify([
    match.hitMin,
    match.hitMax,
    match.breaks,
    match.rounds,
    ...[match.party, match.foes].map((line) => line.map((f) => [f.health, f.hit, f.dodge, f.damage, f.armour])),
  ]);

/** Every way the fight can end, by result and the party's hurt: worked out once for the same numbers. */
export function endsOf(match: Match): Ends {
  const key = keyOf(match);
  const known = kept.get(key);
  if (known) return known;
  const ends = workedOut(match);
  if (kept.size >= KEPT) kept.delete(kept.keys().next().value as string);
  const frozen: Ends = Object.freeze({
    win: Object.freeze(ends.win),
    draw: Object.freeze(ends.draw),
    lose: Object.freeze(ends.lose),
  });
  kept.set(key, frozen);
  return frozen;
}

function workedOut(match: Match): Record<Result, number[]> {
  const partyTotal = total(match.party);
  const breaking = breakAt(match.foes, match.breaks);
  const ends: Record<Result, number[]> = {
    win: new Array<number>(partyTotal + 1).fill(0),
    draw: new Array<number>(partyTotal + 1).fill(0),
    lose: new Array<number>(partyTotal + 1).fill(0),
  };
  if (partyTotal === 0) return { ...ends, lose: [1] };
  if (breaking === 0) return { ...ends, win: ends.win.map((_, hurt) => (hurt === 0 ? 1 : 0)) };
  const [partyFronts, foeFronts] = [frontsOf(match.party), frontsOf(match.foes)];
  // One volley each way for every pair of fronts.
  const dealt = match.party.map((_, p) => match.foes.map((foe) => volley(match.party, p, foe, match)));
  const taken = match.party.map((fighter) => match.foes.map((_, f) => volley(match.foes, f, fighter, match)));
  const width = breaking;
  let now = new Array<number>(partyTotal * width).fill(0);
  now[0] = 1;
  for (let round = 0; round < match.rounds; round++) {
    const next = new Array<number>(partyTotal * width).fill(0);
    for (let hurt = 0; hurt < partyTotal; hurt++) {
      for (let lost = 0; lost < breaking; lost++) {
        const chance = now[hurt * width + lost] as number;
        if (chance === 0) continue;
        const [p, f] = [partyFronts[hurt] as number, foeFronts[lost] as number];
        const out = (dealt[p] as number[][])[f] as number[];
        const back = (taken[p] as number[][])[f] as number[];
        out.forEach((a, by) => {
          if (a === 0) return;
          const broken = lost + by >= breaking;
          back.forEach((b, from) => {
            if (b === 0) return;
            const toHurt = Math.min(partyTotal, hurt + from);
            const q = chance * a * b;
            const down = toHurt >= partyTotal;
            if (broken || down) {
              const row = ends[resultOf(broken, down)];
              row[toHurt] = (row[toHurt] as number) + q;
            } else next[toHurt * width + lost + by] = (next[toHurt * width + lost + by] as number) + q;
          });
        });
      }
    }
    now = next;
  }
  // What is still fighting when the rounds run out is a draw.
  now.forEach((chance, cell) => {
    const hurt = Math.floor(cell / width);
    ends.draw[hurt] = (ends.draw[hurt] as number) + chance;
  });
  return ends;
}
