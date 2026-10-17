import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fnv1a32, hashParts } from './hash.ts';
import { Rng } from './rng.ts';

/**
 * Runs docs/specs/rng_oracle.py, an independent Python implementation of the spec, and checks
 * every case against @eb/core. The golden vectors in rng.test.ts freeze the numbers; this
 * proves they are the spec's numbers and not just whatever the TS happens to produce.
 * Python is on every GitHub runner and in Claude Code's containers; if it is missing the test
 * fails rather than skipping, since a skipped oracle looks exactly like a passing one.
 */
const oraclePath = resolve(import.meta.dirname, '../../../docs/specs/rng_oracle.py');

const draws = (rng: Rng, n: number): number[] => Array.from({ length: n }, () => rng.nextU32());

function tsCases() {
  const stepped = Rng.create('engine-builder');
  draws(stepped, 3);
  const dice = Rng.create('dice');
  const wide = Rng.create('wide');
  const odds = Rng.create('odds');
  const weights = Rng.create('weights');
  return {
    fnv1a32: Object.fromEntries(['', 'a', 'foobar', 'engine-builder', 'Landnám', '🙂'].map((s) => [s, fnv1a32(s)])),
    hashParts: hashParts('run-7', 3, 12),
    next: draws(Rng.create('engine-builder'), 8),
    forkLoot: draws(Rng.create('engine-builder').fork('loot'), 4),
    forkNumber: draws(Rng.create('engine-builder').fork(7), 2),
    stateAfter3: [...stepped.toState().s],
    dice: Array.from({ length: 12 }, () => dice.int(1, 6)),
    wide: Array.from({ length: 8 }, () => wide.int(0, 3221225471)),
    odds: Array.from({ length: 10 }, () => odds.chance(70, 100)),
    deck: Rng.create('deck').shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    weights: Array.from({ length: 10 }, () => weights.weightedIndex([5, 0, 3, 2])),
  };
}

describe('rng oracle (docs/specs/rng_oracle.py)', () => {
  it('agrees with @eb/core on every case', () => {
    const output = execFileSync('python3', ['-I', oraclePath], { encoding: 'utf8' });
    const oracle = JSON.parse(output) as Record<string, unknown>;
    const ours = tsCases();
    expect(Object.keys(oracle).sort()).toEqual(Object.keys(ours).sort());
    for (const [name, value] of Object.entries(ours)) expect(oracle[name], name).toEqual(value);
  });
});
