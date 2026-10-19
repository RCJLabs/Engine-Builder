/**
 * The talk map's layout (M3.8, D46, docs/specs/editor-kits.md#the-dialogue-kit-m38): a box for
 * each line, in rows by the fewest steps from a start (the kit's stepsFrom, which W121 reads
 * too), and where each line's options, their outcomes and its Then lead. Lines no start reaches
 * come last, in a row of their own. Read from the form's value as it stands, which may not hold
 * together yet: whatever isn't the shape a talk has is left out, and no value throws. A line's
 * branches lead on as its options do, and a line with no text and no option says it passes
 * (M3.11), as ink scenes' lines that only branch do.
 */
import { stepsFrom, type TalkRecord } from '@eb/kits';

/** Where a box leads: by an option, an outcome, a branch or its Then, to a line or to the talk's end. */
export interface Exit {
  /** “Chip in for gas”, “Watch me send it”, 60%, If flag.on(paid), or Then. */
  readonly by: string;
  /** The line it leads to; undefined when it ends the talk. */
  readonly to: string | undefined;
  /** False when the talk has no line `to` (E035). */
  readonly found: boolean;
}

export interface Box {
  /** Its place in the talk's lines, as the form's paths have it: /lines/<index>. */
  readonly index: number;
  readonly id: string;
  /** The line's own speaker, or the talk's. */
  readonly speaker: string | undefined;
  readonly text: string;
  /** No text and no option: the talk passes over it, going on by its branches or its Then. */
  readonly passes: boolean;
  /** In order: each option's (or each of its outcomes'), each branch's, then the line's own Then. */
  readonly exits: readonly Exit[];
}

export interface MapRow {
  /** Steps from a start: 0 for the lines the talk opens at. Undefined for lines no start reaches. */
  readonly steps: number | undefined;
  readonly boxes: readonly Box[];
}

type Loose = Readonly<Record<string, unknown>>;

const loose = (value: unknown): Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Loose) : {};
const listOf = (value: unknown): Loose[] => (Array.isArray(value) ? value.map(loose) : []);
const textOf = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

interface LooseOption {
  readonly label: string;
  readonly next: string | undefined;
  readonly outcomes: readonly { readonly chance: unknown; readonly next: string | undefined }[] | undefined;
}

function optionOf(value: Loose): LooseOption {
  // Outcomes left empty roll nothing (E001): the option leads where its own Leads to says.
  const outcomes =
    Array.isArray(value.outcomes) && value.outcomes.length > 0
      ? listOf(value.outcomes).map((o) => ({ chance: o.chance, next: textOf(o.next) }))
      : undefined;
  return { label: textOf(value.label) ?? textOf(value.id) ?? 'An option', next: textOf(value.next), outcomes };
}

interface LooseBranch {
  readonly when: string;
  readonly line: string | undefined;
}

const branchOf = (value: Loose): LooseBranch => ({
  when: textOf(value.if) ?? 'a condition',
  line: textOf(value.line),
});

function exitsOf(
  options: readonly LooseOption[],
  branches: readonly LooseBranch[],
  then: string | undefined,
  lines: ReadonlySet<string>,
): Exit[] {
  const exit = (by: string, to: string | undefined): Exit => ({ by, to, found: to === undefined || lines.has(to) });
  const exits = options.flatMap((option) =>
    option.outcomes
      ? option.outcomes.map((o) =>
          exit(`“${option.label}”, ${typeof o.chance === 'number' ? o.chance : '?'}%`, o.next ?? option.next),
        )
      : [exit(`“${option.label}”`, option.next)],
  );
  for (const branch of branches) exits.push(exit(`If ${branch.when}`, branch.line));
  // A line with no options goes on to its Then, or ends; one with options goes on only when none is shown.
  if (then !== undefined || options.length === 0) exits.push(exit('Then', then));
  return exits;
}

/** The map of a talk's value: its rows, those a start reaches by steps, then the rest. */
export function talkMap(value: unknown): MapRow[] {
  const talk = loose(value);
  const lines = listOf(talk.lines).flatMap((line, index) => {
    const id = textOf(line.id);
    const options = listOf(line.options).map(optionOf);
    return id === undefined ? [] : [{ index, id, line, options, branches: listOf(line.branches).map(branchOf) }];
  });
  const ids = new Set(lines.map((l) => l.id));
  // What stepsFrom reads, and no more: ids and where they lead.
  const shape = {
    starts: listOf(talk.starts).flatMap((start) => (textOf(start.line) ? [{ line: start.line as string }] : [])),
    lines: lines.map(({ id, line, options, branches }) => ({
      id,
      text: '',
      next: textOf(line.next),
      options: options.map((o, i) => ({ id: String(i), label: '', next: o.next, outcomes: o.outcomes })),
      branches: branches.map((b) => ({ if: { fact: 'map.branch' }, line: b.line })),
    })),
  } as unknown as TalkRecord;
  const steps = stepsFrom(shape);
  const first = new Map<string, number>();
  for (const { id, index } of lines) if (!first.has(id)) first.set(id, index);
  const rows = new Map<number | undefined, Box[]>();
  for (const { index, id, line, options, branches } of lines) {
    // A second line with one id is never shown: the kit shows the first (E035).
    const at = first.get(id) === index ? steps.get(id) : undefined;
    const box: Box = {
      index,
      id,
      speaker: textOf(line.speaker) ?? textOf(talk.speaker),
      text: typeof line.text === 'string' ? line.text : '',
      passes: textOf(line.text) === undefined && options.length === 0,
      exits: exitsOf(options, branches, textOf(line.next), ids),
    };
    rows.set(at, [...(rows.get(at) ?? []), box]);
  }
  const reached = [...rows.keys()].filter((k): k is number => k !== undefined).sort((a, b) => a - b);
  const order: (number | undefined)[] = rows.has(undefined) ? [...reached, undefined] : reached;
  return order.map((at) => ({ steps: at, boxes: rows.get(at) ?? [] }));
}
