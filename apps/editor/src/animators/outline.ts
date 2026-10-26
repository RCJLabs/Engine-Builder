/**
 * An animator's layer as an outline (M6.5, D77, docs/specs/animation.md#the-editor), as plain
 * functions: a row a state, the transitions it leaves by under it, numbered in the order they are
 * read, and the transitions from any state last; and the edits the outline's bar makes, each giving
 * the layer after it and the row to choose. The fields a row's form shows are the type file's.
 */
import { ANY } from '@eb/schema';

export type LayerName = 'base' | 'upper';

export interface AnimRow {
  readonly kind: 'state' | 'transition';
  /** The state's or the transition's place in its list. */
  readonly index: number;
  /** Where its value is in the record. */
  readonly path: readonly (string | number)[];
  readonly depth: 0 | 1;
  readonly text: string;
}

type Item = Readonly<Record<string, unknown>>;
interface Layer {
  readonly start?: unknown;
  readonly states?: readonly Item[];
  readonly transitions?: readonly Item[];
}

const layerOf = (value: unknown): Layer => (typeof value === 'object' && value !== null ? (value as Layer) : {});
const listOf = (items: unknown): Item[] =>
  Array.isArray(items) ? items.filter((i): i is Item => typeof i === 'object' && i !== null) : [];
const word = (value: unknown, fallback: string) => (typeof value === 'string' && value !== '' ? value : fallback);

function stateText(state: Item, start: unknown): string {
  const parts = [word(state.id, 'unnamed'), state.clip === undefined ? 'no clip' : `plays ${word(state.clip, '?')}`];
  if (state.loop === true) parts.push('loops');
  if (state.rate === 'pace' || state.rate === 'fit') parts.push(`by ${state.rate}`);
  if (state.id === start) parts.push('starts');
  return parts.join(' · ');
}

const transitionText = (t: Item, order: number) =>
  `${order}. to ${word(t.to, '?')} ${t.when === undefined ? 'as its clip ends' : `when ${word(t.when, '?')}`}`;

/** The layer's rows: each state with the transitions from it, then the transitions from any state. */
export function rowsOf(value: unknown, layer: LayerName): AnimRow[] {
  const { start, states, transitions } = layerOf(value);
  const all = listOf(states);
  const ids = new Set(all.map((s) => s.id));
  const moves = listOf(transitions);
  const rows: AnimRow[] = [];
  const under = (from: (t: Item) => boolean) => {
    moves.forEach((t, j) => {
      if (from(t))
        rows.push({
          kind: 'transition',
          index: j,
          path: [layer, 'transitions', j],
          depth: 1,
          text: transitionText(t, j + 1),
        });
    });
  };
  all.forEach((state, i) => {
    rows.push({ kind: 'state', index: i, path: [layer, 'states', i], depth: 0, text: stateText(state, start) });
    under((t) => t.from === state.id);
  });
  // From any state, or from one that isn't there (E084): read all the same, in their turn.
  under((t) => t.from === ANY || !ids.has(t.from));
  return rows;
}

/** An id like `base` not among `taken`: "state", then "state-2" and on. */
const freeId = (base: string, taken: ReadonlySet<unknown>) => {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
};

export interface Edited {
  readonly layer: Layer;
  readonly path: readonly (string | number)[];
}

/**
 * A state added after the chosen state, its clip the first the model has; the layer starts in it
 * when it starts in no state it has, as a new animator's doesn't.
 */
export function addState(value: unknown, layer: LayerName, after: number, clip: string | undefined): Edited {
  const at = layerOf(value);
  const states = listOf(at.states);
  const ids = new Set(states.map((s) => s.id));
  const id = freeId('state', ids);
  const index = Math.min(states.length, after + 1);
  const made: Item = clip === undefined ? { id } : { id, clip };
  return {
    layer: {
      ...at,
      start: ids.has(at.start) ? at.start : id,
      states: [...states.slice(0, index), made, ...states.slice(index)],
    },
    path: [layer, 'states', index],
  };
}

/** A transition from `from` to the next state along, read last, its condition to be written. */
export function addTransition(value: unknown, layer: LayerName, from: string): Edited {
  const at = layerOf(value);
  const states = listOf(at.states);
  const ids = states.map((s) => s.id).filter((id): id is string => typeof id === 'string');
  const to = ids[(ids.indexOf(from) + 1) % Math.max(1, ids.length)] ?? from;
  const transitions = [...listOf(at.transitions), { from, to, when: 'anim.speed > 0.2' }];
  return { layer: { ...at, transitions }, path: [layer, 'transitions', transitions.length - 1] };
}

/** Whether the row can move up (-1) or down (1) its list. */
export function canMove(value: unknown, row: AnimRow, by: -1 | 1): boolean {
  const list = row.kind === 'state' ? listOf(layerOf(value).states) : listOf(layerOf(value).transitions);
  const to = row.index + by;
  return to >= 0 && to < list.length;
}

/** The row moved up or down its list: a transition's place is the order transitions are read in. */
export function moveRow(value: unknown, layer: LayerName, row: AnimRow, by: -1 | 1): Edited {
  const at = layerOf(value);
  const key = row.kind === 'state' ? 'states' : 'transitions';
  const list = listOf(at[key]);
  const to = row.index + by;
  const moved = [...list];
  [moved[row.index], moved[to]] = [moved[to] as Item, moved[row.index] as Item];
  return { layer: { ...at, [key]: moved }, path: [layer, key, to] };
}

/** A layer keeps one state at least. */
export const canRemove = (value: unknown, row: AnimRow): boolean =>
  row.kind === 'transition' || listOf(layerOf(value).states).length > 1;

/**
 * The row removed. A state takes its transitions, both ways, with it; if it started the layer, the
 * first state left starts it.
 */
export function removeRow(value: unknown, layer: LayerName, row: AnimRow): Edited {
  const at = layerOf(value);
  const transitions = listOf(at.transitions);
  if (row.kind === 'transition') {
    const left = transitions.filter((_, j) => j !== row.index);
    return { layer: { ...at, transitions: left }, path: [layer, 'states', 0] };
  }
  const states = listOf(at.states);
  const gone = states[row.index]?.id;
  const left = states.filter((_, i) => i !== row.index);
  const moves = transitions.filter((t) => t.from !== gone && t.to !== gone);
  const start = at.start === gone ? left[0]?.id : at.start;
  return {
    layer: { ...at, start, states: left, ...(at.transitions ? { transitions: moves } : {}) },
    path: [layer, 'states', Math.max(0, row.index - 1)],
  };
}

/** A state renamed, and the start and the transitions that named it with it. */
export function renameState(value: unknown, index: number, to: string): Layer {
  const at = layerOf(value);
  const states = listOf(at.states);
  const was = states[index]?.id;
  const named = (id: unknown) => (id === was ? to : id);
  return {
    ...at,
    start: named(at.start),
    states: states.map((s, i) => (i === index ? { ...s, id: to } : s)),
    ...(at.transitions
      ? { transitions: listOf(at.transitions).map((t) => ({ ...t, from: named(t.from), to: named(t.to) })) }
      : {}),
  };
}

/** The ids of the layer's states, as written. */
export const stateIds = (value: unknown): string[] =>
  listOf(layerOf(value).states).flatMap((s) => (typeof s.id === 'string' ? [s.id] : []));

/** The upper layer an animator starts with: one state with no clip, which gives way to the base. */
export const UPPER_START: Layer = { start: 'none', states: [{ id: 'none' }] };
