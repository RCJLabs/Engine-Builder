/**
 * What a stock screen is written from (M4.4, D54, docs/specs/stock-screens.md): the project as it
 * stands when New screen is pressed. Plain data, so each template is a plain function of it.
 */

/** A record, by its id and the name it shows. */
export interface Named {
  readonly id: string;
  readonly name: string;
}

export interface StockContext {
  /** The game's name, from project.json. */
  readonly game: string;
  readonly kits: readonly string[];
  /** Records by type, each with its name, in id order. */
  readonly records: ReadonlyMap<string, readonly Named[]>;
  /** Who the roster starts with, when the roster kit is on. */
  readonly starting: readonly string[];
  /** The game's start mode, its modes and those that allow no action, once its scripts have run. */
  readonly modes?: { readonly start: string; readonly all: readonly string[]; readonly endings: readonly string[] };
  /** The screens there are, by id. */
  readonly screens: readonly string[];
  /** The modes some screen already shows. */
  readonly shown: ReadonlySet<string>;
}

/** The records of a type, by id and name. */
export const recordsOf = (ctx: StockContext, type: string): readonly Named[] => ctx.records.get(type) ?? [];

/** Whether every kit named is on. */
export const hasKits = (ctx: StockContext, kits: readonly string[]): boolean =>
  kits.every((kit) => ctx.kits.includes(kit));

/** The record's name, or its id when it has none. */
export function nameOf(value: unknown, id: string): string {
  const name = (value as { name?: unknown } | null)?.name;
  return typeof name === 'string' && name !== '' ? name : id;
}

/** The roster's starting members from the roster records' values: the first that lists any. */
export function startingOf(rosters: readonly unknown[]): readonly string[] {
  for (const roster of rosters) {
    const start = (roster as { start?: unknown } | null)?.start;
    if (Array.isArray(start) && start.every((id) => typeof id === 'string') && start.length > 0) return start;
  }
  return [];
}

/** The modes a screen file's JSON shows, none for one that isn't a screen. */
export function showsOf(value: unknown): readonly string[] {
  const shows = (value as { shows?: unknown } | null)?.shows;
  return Array.isArray(shows) ? shows.filter((mode): mode is string => typeof mode === 'string') : [];
}

/** A record as the project holds it. */
export interface Held {
  readonly type: string;
  readonly id: string;
  readonly value: unknown;
}

/** The context from the project's records as they stand, and what it knows of the game and its screens. */
export function contextFrom(base: Omit<StockContext, 'records' | 'starting'>, held: Iterable<Held>): StockContext {
  const byType = new Map<string, Named[]>();
  const rosters: unknown[] = [];
  for (const { type, id, value } of held) {
    byType.set(type, [...(byType.get(type) ?? []), { id, name: nameOf(value, id) }]);
    if (type === 'roster') rosters.push(value);
  }
  for (const list of byType.values()) list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { ...base, records: byType, starting: startingOf(rosters) };
}

/** The modes some screen already shows, read from the screens' files as they stand; one that isn't JSON shows none. */
export async function shownBy(
  files: readonly string[],
  read: (path: string) => Promise<Uint8Array | undefined>,
): Promise<Set<string>> {
  const shown = new Set<string>();
  for (const file of files) {
    const bytes = await read(file);
    if (bytes === undefined) continue;
    try {
      for (const mode of showsOf(JSON.parse(new TextDecoder().decode(bytes)))) shown.add(mode);
    } catch {
      // The checks say why (E007); a screen that isn't JSON shows nothing.
    }
  }
  return shown;
}
