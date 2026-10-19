/**
 * Where a talk's lines lead (docs/specs/dialogue.md#checks, #the-map): the lines a line leads to,
 * and the fewest steps from a start to each line a start reaches. W121 warns of a line no start
 * reaches, and the editor's map draws each line in the row its steps give.
 */
import type { Line, TalkRecord } from './types.ts';

/** The lines a line leads to, as written: each option's and its outcomes', its branches', then its own. */
export function leadsFrom(line: Line): string[] {
  const to: string[] = [];
  for (const option of line.options ?? []) {
    if (option.next !== undefined) to.push(option.next);
    for (const outcome of option.outcomes ?? []) if (outcome.next !== undefined) to.push(outcome.next);
  }
  for (const branch of line.branches ?? []) if (branch.line !== undefined) to.push(branch.line);
  if (line.next !== undefined) to.push(line.next);
  return to;
}

/** The lines a line can go on to when it shows no option: its branches', then its own. */
export function goesOnTo(line: Line): string[] {
  const to = (line.branches ?? []).flatMap((branch) => (branch.line === undefined ? [] : [branch.line]));
  return line.next === undefined ? to : [...to, line.next];
}

/**
 * Each line a start reaches, by id, with the fewest steps to it: a start's own line is 0. A line
 * named twice is reached as the first so named, as the kit shows it.
 */
export function stepsFrom(talk: TalkRecord): Map<string, number> {
  const lines = new Map<string, Line>();
  for (const line of talk.lines) if (!lines.has(line.id)) lines.set(line.id, line);
  const steps = new Map<string, number>();
  let row = talk.starts.map((start) => start.line);
  for (let step = 0; row.length > 0; step++) {
    const next: string[] = [];
    for (const id of row) {
      const line = lines.get(id);
      if (line === undefined || steps.has(id)) continue;
      steps.set(id, step);
      next.push(...leadsFrom(line));
    }
    row = next;
  }
  return steps;
}
