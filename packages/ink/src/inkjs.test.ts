/**
 * The compiler's reading of ink held to inkle's own (D49): each scene compiled by inkjs and played
 * down every way its choices go, under every state its conditions read, and the talk this package
 * makes of it played the same way. Each way must say the same paragraphs, by the same speakers,
 * fire the same effects in the same order, and offer the same choices at each turn.
 */
import { engineModules, evaluate, type FactCatalog, type FactTest, factCatalog, parseCondition } from '@eb/core';
import { Compiler } from 'inkjs/full';
import { describe, expect, it } from 'vitest';
import { parseEffect } from './fx.ts';
import { compileScene } from './index.ts';
import { tidy } from './text.ts';

const facts: FactCatalog = { ...factCatalog(engineModules), 'time.day': { domain: { type: 'int', min: 1 } } };

interface State {
  readonly on: Readonly<Record<string, boolean>>;
  readonly day: number;
}

interface Way {
  readonly said: string[];
  readonly fx: unknown[];
  readonly offered: string[][];
  readonly done: boolean;
}

const LIMIT = 400;

/** The speaker tag among a line's tags, the effects among them. */
function readTags(tags: readonly string[]) {
  let speaker = '';
  const fx: unknown[] = [];
  for (const tag of tags) {
    const [key, ...rest] = tag.split(':');
    if (key?.trim() === 'speaker') speaker = rest.join(':').trim();
    if (key?.trim() === 'fx') fx.push(parseEffect(rest.join(':')));
  }
  return { speaker, fx };
}

function inkWays(source: string, state: State): Map<string, Way> {
  const compiler = new Compiler(source);
  const story = compiler.Compile();
  expect([...compiler.errors, ...compiler.warnings]).toEqual([]);
  story.BindExternalFunction('flag_on', (flag: string) => state.on[flag] ?? false, true);
  story.BindExternalFunction('time_day', () => state.day, true);
  const ways = new Map<string, Way>();
  const play = (picks: number[]) => {
    story.ResetState();
    const way: Way = { said: [], fx: [], offered: [], done: false };
    for (let turn = 0; ; turn++) {
      while (story.canContinue) {
        const text = tidy(story.Continue() ?? '');
        const { speaker, fx } = readTags(story.currentTags ?? []);
        way.fx.push(...fx);
        if (text !== '') way.said.push(`${speaker}|${text}`);
      }
      const offered = story.currentChoices.map((choice) => tidy(choice.text));
      if (offered.length === 0) {
        ways.set(picks.join(','), { ...way, done: true });
        return;
      }
      way.offered.push(offered);
      if (turn === picks.length) {
        for (let pick = 0; pick < offered.length && ways.size < LIMIT; pick++) play([...picks, pick]);
        return;
      }
      story.ChooseChoiceIndex(picks[turn] as number);
    }
  };
  play([]);
  return ways;
}

type Line = Record<string, unknown> & { id: string };
type Option = { id: string; label: string; if?: string; once?: boolean; effects?: unknown[]; next?: string };

function talkWay(talk: { starts: { line: string }[]; lines: Line[] }, state: State, picks: readonly number[]): Way {
  const read = (test: FactTest) =>
    test.fact === 'flag.on'
      ? (state.on[test.args?.flag as string] ?? false)
      : test.fact === 'time.day'
        ? state.day
        : undefined;
  const holds = (text: unknown) => {
    if (text === undefined) return true;
    const parsed = parseCondition(text as string, facts);
    if (!parsed.ok) throw new Error(parsed.message);
    return evaluate(parsed.condition, read) === true;
  };
  const way: Way = { said: [], fx: [], offered: [], done: false };
  const saidOptions = new Set<string>();
  let at: string | undefined = talk.starts[0]?.line;
  for (let steps = 0, turn = 0; at !== undefined && steps < 1000; steps++) {
    const line = talk.lines.find((l) => l.id === at) as Line;
    way.fx.push(...((line.effects as unknown[]) ?? []));
    const shown = ((line.options as Option[]) ?? []).filter((o) => holds(o.if) && !(o.once && saidOptions.has(o.id)));
    if (typeof line.text === 'string') {
      for (const para of line.text.split('\n')) way.said.push(`${(line.speaker as string) ?? ''}|${para}`);
    }
    if (shown.length > 0) {
      way.offered.push(shown.map((o) => o.label));
      if (turn === picks.length) return way;
      const option = shown[picks[turn++] as number] as Option;
      saidOptions.add(option.id);
      way.fx.push(...(option.effects ?? []));
      at = option.next;
      continue;
    }
    const branch = ((line.branches as { if: string; line?: string }[]) ?? []).find((b) => holds(b.if));
    at = branch ? branch.line : (line.next as string | undefined);
  }
  return { ...way, done: true };
}

const STATES: State[] = [
  { on: {}, day: 1 },
  { on: { a: true }, day: 3 },
  { on: { b: true }, day: 5 },
  { on: { a: true, b: true, c: true }, day: 9 },
];

function sameWays(lines: string[]): void {
  const source = lines.join('\n');
  const { talk, problems } = compileScene(source, { facts });
  expect(problems).toEqual([]);
  for (const state of STATES) {
    for (const [key, ink] of inkWays(source, state)) {
      const picks = key === '' ? [] : key.split(',').map(Number);
      expect({ state, picks, ...talkWay(talk as never, state, picks) }).toEqual({ state, picks, ...ink });
    }
  }
}

const HEAD = ['EXTERNAL flag_on(flag)', 'EXTERNAL time_day()'];

describe('a scene plays as inkjs plays it', () => {
  it('with text, speakers, choices and gathers', () => {
    sameWays([
      ...HEAD,
      'At dusk a woman comes up the path.',
      'She stops at your table. # fx: set-flag(flag: met, value: true)',
      '"I keep the bridge." # speaker: modgudr',
      '# speaker: modgudr',
      '"It rings."',
      '* ["Is my grandfather there?"]',
      '  # fx: add-to-flag(flag: truth, by: 1)',
      '  She thinks about it.',
      '  "Two benches down." # speaker: modgudr',
      '* ["What do you want?"]',
      '  "Say it." # speaker: modgudr',
      '- She waits.',
      '* ["The quiet dead count."]',
      '  # fx: set-flag(flag: sided, value: true)',
      '  # fx: add-to-flag(flag: truth, by: 2)',
      '  You say it.',
      '* [Say nothing.]',
      '- The clerk writes something down.',
      '-> END',
    ]);
  });

  it('with conditions on choices, blocks, branches and inline text', () => {
    sameWays([
      ...HEAD,
      'The letter.',
      '{',
      '- flag_on("a") && time_day() > 2:',
      '  "A, late." # speaker: ulf',
      '  { flag_on("b"): And b. }',
      '- flag_on("b"): -> short',
      '- else:',
      '  # fx: set-flag(flag: c, value: true)',
      '  Nothing much.',
      '}',
      'You write {flag_on("a"):to Ulf|home}{flag_on("c"):, at last|}.',
      '* {flag_on("a")} [Answer Ulf.]',
      '  You answer.',
      '* {not flag_on("a")} [Answer home.]',
      '* [Burn it.]',
      '  # fx: add-to-flag(flag: ash, by: 1)',
      '- -> END',
      '=== short ===',
      'Only b.',
      '{ time_day() >= 5: -> END }',
      'Still early.',
      '-> END',
    ]);
  });

  it('with nested choices, a labelled gather that loops, and diverts to labels', () => {
    sameWays([
      ...HEAD,
      '-> hill',
      '=== hill ===',
      'The raven comes.',
      '- (choose)',
      'What now?',
      '* [Fly.]',
      '  ** [At dawn.]',
      '     Early.',
      '  ** [At noon.] -> hill.done',
      '  -- Up you go.',
      '* [Wait.]',
      '  The hill doesn’t come down.',
      '  -> choose',
      '* [Rest.] -> choose',
      '- (done) It is decided.',
      '-> END',
    ]);
  });

  it('with choices that can all be hidden, and a flow that runs out at the top', () => {
    sameWays([...HEAD, 'Pick.', '* {flag_on("a")} [A.]', '  Took a.', '* {flag_on("b")} [B.]', '- After.']);
    sameWays([...HEAD, 'Pick.', '* {flag_on("a")} [A.] -> END', '* {flag_on("b")} [B.] -> END', '- After.', '-> END']);
  });
});
