import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonical.ts';
import { fnv1a64, utf8Length } from './hash.ts';
import { stateHash } from './stateHash.ts';

/**
 * Sends fixed and generated values to docs/specs/state_hash_oracle.py, an independent Python
 * implementation of the spec, and checks every canonical text, hash and size against @eb/core.
 * Fails rather than skips when Python is missing: a skipped oracle looks exactly like a passing one.
 */
const oraclePath = resolve(import.meta.dirname, '../../../docs/specs/state_hash_oracle.py');

// What the oracle formats identically to ECMAScript: no floats here (fixed cases cover a few).
const oracleSafe = fc.letrec((tie) => ({
  value: fc.oneof(
    { depthSize: 'small' },
    fc.constant(null),
    fc.boolean(),
    fc.maxSafeInteger(),
    fc.string({ unit: 'grapheme' }),
    fc.array(tie('value'), { maxLength: 5 }),
    fc.dictionary(fc.string({ unit: 'grapheme' }), tie('value'), { maxKeys: 5 }),
  ),
})).value;

const fixedValues: unknown[] = [
  {
    rng: { seed: 'golden', s: [1, 2, 3, 4] },
    day: 12,
    party: [
      { id: 'kit', hp: 7, traits: ['steady'] },
      { id: 'rook', hp: 0, traits: [] },
    ],
    flags: { 'met-rook': true, 'debt/paid': false },
    log: ['Day 12: the convoy left.'],
  },
  // UTF-16 order puts 😀 (0xD83D…) before U+FB33, though its code point is higher.
  { '€': 1, '\r': 2, דּ: 3, '1': 4, '😀': 5, '\u0080': 6, ö: 7 },
  { 10: 'b', 9: 'c', 1: 'a' },
  [0.5, -2.75, 1.25, 0, -42, 9007199254740991],
  '\u0001\n"\\\u007f tab\there',
];

const strings = ['', 'a', 'foobar', 'Landnám', '🙂', 'x'.repeat(1000)];

describe('state hash oracle (docs/specs/state_hash_oracle.py)', () => {
  it('agrees with @eb/core on fixed and 300 generated values', () => {
    const values = [...fixedValues, ...fc.sample(oracleSafe, { numRuns: 300, seed: 7 })];
    const output = execFileSync('python3', ['-I', '-B', oraclePath], {
      input: JSON.stringify({ strings, values }),
      encoding: 'utf8',
    });
    const oracle = JSON.parse(output) as {
      fnv1a64: string[];
      values: { canonical: string; hash: string; bytes: number }[];
    };
    expect(oracle.fnv1a64).toEqual(strings.map(fnv1a64));
    expect(oracle.values).toHaveLength(values.length);
    values.forEach((value, i) => {
      const text = canonicalJson(value);
      expect(oracle.values[i], `value ${i}: ${text.slice(0, 80)}`).toEqual({
        canonical: text,
        hash: stateHash(value),
        bytes: utf8Length(text),
      });
    });
  });
});
