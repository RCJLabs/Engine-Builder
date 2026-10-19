/**
 * The checks that follow a talk's ways through (M3.11, docs/specs/dialogue.md#checks): lines
 * without text that pass to each other in a loop (E035), lines from which the talk can never end
 * (W130), and the lint that walks every path from a start (W129), carrying the conditions that
 * held on the way, so a branch or an option whose If the way to it rules out is found, as nested
 * conditions in an ink scene make easy to write. What it knows is forgotten at each effect, since
 * an effect can change any fact, and a fact of the dialogue kit's is forgotten as a line is shown.
 */
import { type Condition, type FactCatalog, parseCondition, satisfiability } from '@eb/core';
import { goesOnTo, type Line, type TalkOption, type TalkRecord } from '@eb/kits';

/** Past this many steps of the walk, it stops, and says nothing of what it didn't reach. */
export const WALK_LIMIT = 20_000;

const alwaysShown = (option: TalkOption) => option.if === undefined && option.once !== true;
/** Whether a line can show no option, and so go on by its branches and Then. */
const goesOn = (line: Line) => !(line.options ?? []).some(alwaysShown);
const leadsOf = (option: TalkOption) =>
  option.outcomes ? option.outcomes.map((outcome) => outcome.next ?? option.next) : [option.next];

function byId(talk: TalkRecord): Map<string, Line> {
  const lines = new Map<string, Line>();
  for (const line of talk.lines) if (!lines.has(line.id)) lines.set(line.id, line);
  return lines;
}

/** Lines without text that can pass to each other in a loop, where the talk would pass round forever. */
export function passingLoops(talk: TalkRecord): Set<string> {
  const lines = byId(talk);
  const loops = new Set<string>();
  const state = new Map<string, 'on' | 'done'>();
  const visit = (id: string) => {
    const line = lines.get(id);
    if (line === undefined || line.text !== undefined || !goesOn(line) || state.get(id) === 'done') return;
    if (state.get(id) === 'on') {
      loops.add(id);
      return;
    }
    state.set(id, 'on');
    for (const to of goesOnTo(line)) visit(to);
    state.set(id, 'done');
  };
  for (const line of talk.lines) visit(line.id);
  return loops;
}

/** Lines from which no way on reaches an end of the talk. */
export function endless(talk: TalkRecord): Set<string> {
  const lines = byId(talk);
  const ends = (line: Line) =>
    (goesOn(line) && (line.next === undefined || (line.branches ?? []).some((b) => b.line === undefined))) ||
    (line.options ?? []).some((option) => leadsOf(option).includes(undefined));
  const onward = (line: Line) => [
    ...(line.options ?? []).flatMap((option) => leadsOf(option).filter((to) => to !== undefined)),
    ...(goesOn(line) ? goesOnTo(line) : []),
  ];
  const canEnd = new Set<string>();
  for (let grew = true; grew; ) {
    grew = false;
    for (const [id, line] of lines) {
      // A way on to a line the talk lacks is E035's, so it isn't counted against the talk here.
      if (canEnd.has(id) || !(ends(line) || onward(line).some((to) => canEnd.has(to) || !lines.has(to)))) continue;
      canEnd.add(id);
      grew = true;
    }
  }
  return new Set([...lines.keys()].filter((id) => !canEnd.has(id)));
}

export interface Walk {
  /** False when it stopped at WALK_LIMIT. */
  readonly complete: boolean;
  readonly lines: ReadonlySet<string>;
  /** `<line>/<option's place>` for each option shown on some way. */
  readonly options: ReadonlySet<string>;
  /** `<line>/<branch's place>` for each branch taken on some way. */
  readonly branches: ReadonlySet<string>;
}

/** A condition as a tree: written as text, or as JSON; undefined when it doesn't parse (E011 says so). */
export function treeOf(value: unknown, catalog: FactCatalog): Condition | undefined {
  if (typeof value !== 'string') return value as Condition | undefined;
  const parsed = parseCondition(value, catalog);
  return parsed.ok ? parsed.condition : undefined;
}

const mentionsDialogue = (c: Condition): boolean =>
  'all' in c
    ? c.all.some(mentionsDialogue)
    : 'any' in c
      ? c.any.some(mentionsDialogue)
      : 'not' in c
        ? mentionsDialogue(c.not)
        : c.fact.startsWith('dialogue.');

interface Step {
  readonly line: string;
  readonly known: readonly Condition[];
}

/** Every way from a start, carrying the conditions that held on it; it stops after `limit` steps. */
export function walkTalk(talk: TalkRecord, catalog: FactCatalog, limit = WALK_LIMIT): Walk {
  const lines = byId(talk);
  const tree = (value: unknown) => treeOf(value, catalog);
  const holds = (known: readonly Condition[]) =>
    known.length === 0 || satisfiability({ all: [...known] }, { catalog }).canBeTrue !== false;
  const reached = { lines: new Set<string>(), options: new Set<string>(), branches: new Set<string>() };
  const queue: Step[] = [];
  const seen = new Set<string>();
  // Each condition once, in one order, so a loop that passes the same branch again adds nothing and the walk settles.
  const push = (line: string | undefined, known: readonly Condition[]) => {
    if (line === undefined || !holds(known)) return;
    const once = new Map(known.map((c) => [JSON.stringify(c), c]));
    queue.push({ line, known: [...once.keys()].sort().map((key) => once.get(key) as Condition) });
  };
  const before: Condition[] = [];
  for (const start of talk.starts) {
    const own = tree(start.if);
    push(start.line, own ? [...before, own] : before);
    if (own) before.push({ not: own });
  }
  for (let steps = 0; queue.length > 0; steps++) {
    if (steps >= limit) return { complete: false, ...reached };
    const { line: id, known } = queue.pop() as Step;
    const key = `${id}|${JSON.stringify(known)}`;
    const line = lines.get(id);
    if (seen.has(key) || line === undefined) continue;
    seen.add(key);
    reached.lines.add(id);
    const shown = line.effects?.length ? [] : known.filter((c) => !mentionsDialogue(c));
    (line.options ?? []).forEach((option, j) => {
      const own = tree(option.if);
      const here = own ? [...shown, own] : shown;
      if (!holds(here)) return;
      reached.options.add(`${id}/${j}`);
      const changes = (option.effects?.length ?? 0) > 0 || option.cost !== undefined || option.outcomes !== undefined;
      const after = changes ? [] : here.filter((c) => !mentionsDialogue(c));
      for (const to of leadsOf(option)) push(to, after);
    });
    if (!goesOn(line)) continue;
    const ruledOut: Condition[] = [];
    (line.branches ?? []).forEach((branch, k) => {
      const own = tree(branch.if);
      const here = own ? [...shown, ...ruledOut, own] : [...shown, ...ruledOut];
      if (holds(here)) {
        reached.branches.add(`${id}/${k}`);
        push(branch.line, here);
      }
      if (own) ruledOut.push({ not: own });
    });
    push(line.next, [...shown, ...ruledOut]);
  }
  return { complete: true, ...reached };
}
