/**
 * A game's play shell as `ui/shell.json` holds it (M4.3, D53, docs/specs/shell.md): the words,
 * slots and Daily of the title, saves and pause the engine draws around a game. Every field may be
 * left out, and so may the file.
 */

export const SLOTS_MIN = 1;
export const SLOTS_MAX = 5;
export const SLOTS_DEFAULT = 3;

export interface ShellFile {
  /** The title screen's heading: the project's name without it. */
  readonly title?: string;
  readonly tagline?: string;
  /** Numbered slots, 1 to 5. */
  readonly slots?: number;
  /** Whether the title offers a Daily. */
  readonly daily?: boolean;
  /** What a slot shows: a template of facts, filled by the worker as each save is made. */
  readonly 'slot-line'?: string;
}

/** The shell as a game plays it, every default filled in. */
export interface ShellSettings {
  readonly title: string;
  readonly tagline: string | undefined;
  readonly slots: number;
  readonly daily: boolean;
  readonly slotLine: string | undefined;
}

/** The file's settings, or the defaults, for a game of this name. The compiler has checked the file. */
export function shellSettings(file: ShellFile | undefined, name: string): ShellSettings {
  return {
    title: file?.title ?? name,
    tagline: file?.tagline,
    slots: file?.slots ?? SLOTS_DEFAULT,
    daily: file?.daily ?? false,
    slotLine: file?.['slot-line'],
  };
}
