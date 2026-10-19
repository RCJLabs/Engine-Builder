/**
 * The subset's finer points (docs/specs/ink.md): `or` as well as `||`, comparisons turned round,
 * arguments in the EXTERNAL's order, whole numbers, escapes and white space, `- else:` last,
 * DONE as END, a knot's own labels before other knots, and the limits the subset sets.
 */
import { engineModules, type FactCatalog, factCatalog } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { compileScene } from './index.ts';

const facts: FactCatalog = {
  ...factCatalog(engineModules),
  'dialogue.heard': {
    args: { talk: { type: 'ref', to: 'talk' }, line: { type: 'text' } },
    domain: { type: 'int', min: 0 },
  },
};

const compile = (lines: string[]) => compileScene(lines.join('\n'), { facts });
const messages = (lines: string[]) => compile(lines).problems.map((p) => `${p.line}: ${p.message}`);
const linesOf = (lines: string[]) => {
  const { talk, problems } = compile(lines);
  expect(problems).toEqual([]);
  return (talk as { lines: Record<string, unknown>[] }).lines;
};
const FLAGS = ['EXTERNAL flag_on(flag)', 'EXTERNAL flag_number(flag)'];
const branchIf = (cond: string, externals = FLAGS) =>
  linesOf([...externals, `{ ${cond}: Yes. }`, 'Then.'])[0]?.branches;

describe('conditions', () => {
  it('read or as ||, and turn a comparison round when the value comes first', () => {
    expect(branchIf('flag_on("a") or flag_on("b")')).toEqual([{ if: 'flag.on(a) or flag.on(b)', line: 'start-2' }]);
    expect(branchIf('2 < flag_number("a")')).toEqual([{ if: 'flag.number(a) > 2', line: 'start-2' }]);
    expect(branchIf('2 > flag_number("a")')).toEqual([{ if: 'flag.number(a) < 2', line: 'start-2' }]);
  });

  it('give each value to the argument the EXTERNAL names in its place', () => {
    expect(branchIf('dialogue_heard("start", "marge") > 0', ['EXTERNAL dialogue_heard(line, talk)'])).toEqual([
      { if: 'dialogue.heard(line: start, talk: marge) > 0', line: 'start-2' },
    ]);
  });

  it('count in whole numbers', () => {
    expect(messages([...FLAGS, 'Hi.', '{ flag_number("a") > 1.5: Yes. }'])).toEqual([
      '4: Whole numbers only: the engine counts in whole numbers',
    ]);
  });

  it('take - else: as a block’s last branch only', () => {
    expect(messages([...FLAGS, '{', '- else: A.', '- flag_on("a"): B.', '}'])).toEqual([
      '5: - else: is a block’s last branch',
    ]);
  });
});

describe('a line', () => {
  it('shows a sign after \\ as the sign, and runs of white space as one space', () => {
    expect(linesOf(['Price \\# 5 \\{ in all \\}.'])[0]?.text).toBe('Price # 5 { in all }.');
    expect(linesOf(['Hello    there.\tNow.'])[0]?.text).toBe('Hello there. Now.');
  });

  it('reads one | in a {condition: this|that}, and three of them at most', () => {
    expect(messages([...FLAGS, 'Hi.', 'A {flag_on("a"): b|c|d}.'])).toEqual([
      '4: Only {condition: this|that} is read: one | at most',
    ]);
    const four = ['a', 'b', 'c', 'd'].map((f) => `{flag_on("${f}"): ${f}|-}`).join(' ');
    expect(messages([...FLAGS, 'Hi.', four])).toEqual([
      '4: At most 3 {condition: this|that} to a line: split it with # beat',
    ]);
  });

  it('brackets a condition with an and or an or where it joins others, and only there', () => {
    const both = '(flag_on("a") or flag_on("b")) and (flag_on("c") or flag_on("d"))';
    const [pass] = linesOf([...FLAGS, `You {${both}: x|y}, {flag_on("e"): z|w}.`]);
    const ab = '(flag.on(a) or flag.on(b)) and (flag.on(c) or flag.on(d))';
    expect(((pass?.branches ?? []) as { if: string }[]).map((b) => b.if)).toEqual([
      `(${ab}) and flag.on(e)`,
      `(${ab}) and not flag.on(e)`,
      `not (${ab}) and flag.on(e)`,
    ]);
    expect(branchIf('flag_on("a") or flag_on("b")')).toEqual([{ if: 'flag.on(a) or flag.on(b)', line: 'start-2' }]);
    const [alone] = linesOf([...FLAGS, 'You {flag_on("a") or flag_on("b"): x|y}.']);
    expect(((alone?.branches ?? []) as { if: string }[]).map((b) => b.if)).toEqual(['flag.on(a) or flag.on(b)']);
    const [pick] = linesOf([...FLAGS, 'Pick.', '* {flag_on("a") or flag_on("b")} {flag_on("c")} [Go.] -> END']);
    expect(((pick?.options ?? []) as { if: string }[])[0]?.if).toBe('(flag.on(a) or flag.on(b)) and flag.on(c)');
  });

  it('takes no { or } in its tags', () => {
    expect(messages(['Hi.', 'Then. # speaker: hild}'])).toEqual(['2: Tags are plain text: no { or }']);
  });
});

describe('diverts and choices', () => {
  it('end at DONE as at END, and find a knot’s own label before a knot of that name', () => {
    const lines = linesOf([
      '-> hill',
      '=== hill ===',
      'Up.',
      '* [Again.] -> choose',
      '* [Down.] -> DONE',
      '- (choose) Pick.',
      '-> END',
      '=== choose ===',
      'The other.',
      '-> END',
    ]);
    expect(((lines[0]?.options ?? []) as { next?: string }[]).map((o) => o.next)).toEqual(['hill-choose', undefined]);
  });

  it('are no deeper than the choices above them', () => {
    expect(messages(['Hi.', '** [Deep.]', '-> END'])).toEqual([
      '2: This choice is deeper than the choices above it: 1 level at most here',
    ]);
  });
});
