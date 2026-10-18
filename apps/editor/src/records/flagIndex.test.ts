/**
 * The record index with flags (M3.1): a flag's lint reads every record that names it, and a
 * set-flag's check reads the flag, so an edit to one is an edit to the others' problems too.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { problemsOf, project, shown } from '../../test/index-files.ts';

const MET = 'records/flag/met.json';
const RAIDS = 'records/flag/raids.json';
const SHEET = 'records/sheet/voyage.json';

const sheet = (flag: string, to: unknown, reads: string | null) =>
  JSON.stringify({
    rows: [
      {
        id: 'a',
        when: { event: 'flag/changed' },
        ...(reads ? { if: `flag.on(${reads})` } : {}),
        do: [{ effect: 'set-flag', flag, to }],
      },
    ],
  });

describe('the index with flags', () => {
  it('checks a flag again when a record that names it changes, and the record when the flag does', async () => {
    const files = project();
    files.write(MET, '{}');
    files.write(SHEET, sheet('met', true, null));
    let { index } = await files.update(null);
    expect(problemsOf(index, 'flag:met')).toEqual([
      "W108 : Set by sheet:voyage, but no condition or row's When reads it",
    ]);
    // The sheet reads it now: the flag's warning goes, though only the sheet was written.
    files.write(SHEET, sheet('met', true, 'met'));
    ({ index } = await files.update([SHEET]));
    expect(problemsOf(index, 'flag:met')).toEqual([]);
    // The flag becomes a number: the sheet's set-flag and condition are wrong, though only the flag changed.
    files.write(MET, '{ "number": { "max": 3 } }');
    ({ index } = await files.update([MET]));
    expect(problemsOf(index, 'sheet:voyage')).toEqual([
      'E026 /rows/0/do/0/to: "met" is a number: set it to a whole number',
      'E026 /rows/0/if: "met" is a number: read it with flag.number',
    ]);
    // The sheet goes: nothing names the flag.
    files.write(SHEET, null);
    ({ index } = await files.update([SHEET]));
    expect(problemsOf(index, 'flag:met')).toEqual(['W110 : Nothing sets or reads this flag']);
  });
});

describe('the index with flags, edit after edit', () => {
  const step = fc.oneof(
    fc.record({
      kind: fc.constant('sheet' as const),
      flag: fc.constantFrom('met', 'raids', 'ghost'),
      to: fc.constantFrom(true, 2, 9),
      reads: fc.constantFrom('met', 'raids', null),
    }),
    fc.record({ kind: fc.constant('flag' as const), path: fc.constantFrom(MET, RAIDS), number: fc.boolean() }),
    fc.record({ kind: fc.constant('drop' as const), path: fc.constantFrom(MET, RAIDS, SHEET) }),
  );

  it('always matches the index read afresh', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(step, { minLength: 1, maxLength: 8 }), async (steps) => {
        const files = project();
        files.write(MET, '{}');
        files.write(RAIDS, '{ "number": { "min": 0, "max": 5 } }');
        files.write(SHEET, sheet('met', true, 'raids'));
        await files.update(null);
        for (const s of steps) {
          const path = s.kind === 'sheet' ? SHEET : s.path;
          if (s.kind === 'sheet') files.write(SHEET, sheet(s.flag, s.to, s.reads));
          else if (s.kind === 'flag') files.write(s.path, s.number ? '{ "number": { "max": 4 } }' : '{}');
          else files.write(s.path, null);
          const { index, fresh } = await files.update([path]);
          expect(shown(index)).toEqual(shown(fresh));
        }
      }),
      { numRuns: 60 },
    );
  });
});
