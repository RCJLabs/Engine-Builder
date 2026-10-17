/** Commands the palette offers, and how a typed query picks them. */

export interface Command {
  /** Stable, for the palette's list items. */
  readonly id: string;
  readonly title: string;
  /** Other words people might type for it. */
  readonly keywords?: string;
  readonly run: () => void;
}

const words = (text: string) => text.toLowerCase().split(/\s+/).filter(Boolean);

/**
 * The commands whose title or keywords hold every word typed, as the start of a word or anywhere.
 * Titles that start with the query come first, then titles with a word starting with each typed
 * word, then the rest; within each, the order they were given.
 */
export function matchCommands(commands: readonly Command[], query: string): Command[] {
  const typed = words(query);
  if (typed.length === 0) return [...commands];
  const scored: { command: Command; score: number; index: number }[] = [];
  for (const [index, command] of commands.entries()) {
    const title = command.title.toLowerCase();
    const haystack = `${title} ${command.keywords ?? ''}`.toLowerCase();
    if (!typed.every((word) => haystack.includes(word))) continue;
    const titleWords = words(title);
    const score = title.startsWith(typed.join(' '))
      ? 0
      : typed.every((word) => titleWords.some((t) => t.startsWith(word)))
        ? 1
        : 2;
    scored.push({ command, score, index });
  }
  return scored.sort((a, b) => a.score - b.score || a.index - b.index).map((s) => s.command);
}

/** The next option for an arrow key, wrapping at both ends; -1 when there are none. */
export function stepActive(active: number, count: number, step: 1 | -1): number {
  if (count === 0) return -1;
  return (((active + step) % count) + count) % count;
}
