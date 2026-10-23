/**
 * Times a fight's table (M4.7): every way it can end, worked out round by round over every pair
 * of hurts, then made whole. The drift's raiders, the pit's thraex and melee, a boarding the size
 * of Space-Wrecked's (3 crew of 10 against 4 boarders of 8), and two fights far larger than any
 * game here writes. Milliseconds per table, the median of 5 rounds. The instrument behind the
 * "Encounters" readings in ROADMAP.md.
 *
 *   node packages/kits/test/fights-bench.ts
 */
import { breakAt, endsOf, type Fighter, type Match, rowsOf } from '../src/index.ts';

const fighter = (health: number, hit: number, damage: number, dodge = 0, armour = 0): Fighter => ({
  actor: 'x',
  health,
  hit,
  dodge,
  damage,
  armour,
});
const line = (n: number, make: () => Fighter) => Array.from({ length: n }, make);
const match = (party: Fighter[], foes: Fighter[], more: Partial<Match> = {}): Match => ({
  encounter: 'bench',
  combat: 'bench',
  health: 'hp',
  party,
  foes,
  hitMin: 5,
  hitMax: 95,
  rounds: 20,
  breaks: 100,
  ...more,
});

const CASES: Record<string, Match> = {
  'the drift’s raiders (12 against 10, breaking at half)': match(
    [fighter(12, 60, 2, 0, 1)],
    [fighter(10, 55, 3, 0, 1)],
    { rounds: 10, breaks: 50 },
  ),
  'the pit’s thraex (Spartacus, 12 against 10)': match([fighter(12, 65, 2, 15)], [fighter(10, 55, 2, 10)], {
    rounds: 12,
    breaks: 80,
    hitMin: 10,
    hitMax: 90,
  }),
  'the pit’s melee (14 and 12 against 3 of 6)': match(
    [fighter(14, 55, 3, 5), fighter(12, 65, 2, 15)],
    line(3, () => fighter(6, 40, 2)),
    { rounds: 12, hitMin: 10, hitMax: 90 },
  ),
  'a boarding (3 of 10 against 4 of 8)': match(
    line(3, () => fighter(10, 65, 3, 10, 1)),
    line(4, () => fighter(8, 55, 3, 5)),
  ),
  'six of 30 against six of 30': match(
    line(6, () => fighter(30, 60, 4, 10, 1)),
    line(6, () => fighter(30, 60, 4, 10, 1)),
  ),
  'two of 100 against two of 100': match(
    line(2, () => fighter(100, 60, 6, 10)),
    line(2, () => fighter(100, 60, 6, 10)),
  ),
};

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] as number;

for (const [name, fight] of Object.entries(CASES)) {
  const pairs = fight.party.reduce((sum, f) => sum + f.health, 0) * breakAt(fight.foes, fight.breaks);
  const runs = pairs > 10_000 ? 3 : 50;
  const rounds: number[] = [];
  for (let round = 0; round < 5; round++) {
    const start = performance.now();
    for (let i = 0; i < runs; i++) rowsOf(endsOf(fight));
    rounds.push((performance.now() - start) / runs);
  }
  console.log(`${name}: ${median(rounds).toFixed(2)} ms a table, ${pairs} pairs of hurts`);
}
