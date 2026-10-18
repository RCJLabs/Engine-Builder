/**
 * The flag module: what content remembers (M3.1, D36, docs/specs/triggers.md). Each flag is a
 * record, records/flag/<id>.json, on or off, or with `number`, a whole number with a start and
 * bounds. The slice holds only the flags whose value differs from their start, so a content
 * update to a start reaches the games that never changed that flag.
 */
import { OP_WORDS } from '../logic/describe.ts';
import type { Domain } from '../logic/types.ts';
import type { RecordStore } from '../records.ts';
import { defineModule, type FactView, type ModuleContext, type PreviewContext } from '../sim/module.ts';
import type { DeepReadonly, Effect } from '../sim/types.ts';

/** The record type of flags, and the flag module's id. */
export const FLAG = 'flag';

export interface FlagNumber {
  /** 0 when left out. It must lie within the bounds. */
  readonly start?: number;
  readonly min?: number;
  readonly max?: number;
}

/** A flag record as the pack holds it. Without `number`, the flag is on or off, and starts off. */
export interface FlagRecord {
  readonly name?: string;
  readonly description?: string;
  readonly number?: FlagNumber;
}

export interface FlagSlice {
  /** By flag id: the flags whose value is not their start. */
  readonly values: Readonly<Record<string, boolean | number>>;
}

/** `{ "effect": "set-flag", "flag": "met-trader", "to": true }`; `to` is a whole number for a number flag. */
export interface SetFlagEffect extends Effect {
  readonly effect: 'set-flag';
  readonly flag: string;
  readonly to: boolean | number;
}

/** `{ "effect": "add-to-flag", "flag": "raids", "by": 1 }`, for number flags: kept within the flag's bounds. */
export interface AddToFlagEffect extends Effect {
  readonly effect: 'add-to-flag';
  readonly flag: string;
  readonly by: number;
}

const FLAG_ARG: Readonly<Record<string, Domain>> = { flag: { type: 'ref', to: FLAG } };

/** The flag's record, or undefined when content has none of that id. */
export const flagRecord = (content: RecordStore, id: unknown): FlagRecord | undefined =>
  typeof id === 'string' && content.has(FLAG, id) ? (content.get(FLAG, id) as FlagRecord) : undefined;

/** A number flag's value kept within its bounds; a bound left out doesn't limit. */
export function withinBounds(flag: FlagNumber, value: number): number {
  const low = flag.min ?? Number.NEGATIVE_INFINITY;
  const high = flag.max ?? Number.POSITIVE_INFINITY;
  return Math.min(Math.max(value, low), high);
}

/** What a flag holds now: its saved value if it changed, else its start. Undefined for no such flag. */
export function flagValue(
  slice: DeepReadonly<FlagSlice>,
  content: RecordStore,
  id: unknown,
): boolean | number | undefined {
  const record = flagRecord(content, id);
  if (!record) return undefined;
  const saved = slice.values[id as string];
  if (record.number === undefined) return typeof saved === 'boolean' ? saved : false;
  // A save outlives a change to the bounds: the value read is always within the bounds of now.
  return withinBounds(record.number, typeof saved === 'number' ? saved : (record.number.start ?? 0));
}

const read = (view: FactView<FlagSlice>, id: unknown) => flagValue(view.state, view.content, id);

/** The flag's id and record, or a thrown error: validation stops a missing flag, or one of the wrong kind. */
function target(content: RecordStore, effect: Effect, kind: 'on-off' | 'number' | 'either'): [string, FlagRecord] {
  const record = flagRecord(content, effect.flag);
  if (!record) throw new Error(`${effect.effect}: no flag "${String(effect.flag)}"`);
  const isNumber = record.number !== undefined;
  if ((kind === 'number' && !isNumber) || (kind === 'on-off' && isNumber)) {
    throw new Error(`${effect.effect}: flag "${String(effect.flag)}" is ${isNumber ? 'a number' : 'on or off'}`);
  }
  return [effect.flag as string, record];
}

/** The value set-flag or add-to-flag leaves the flag with. Throws on a `to` or `by` of the wrong kind. */
function nextValue(content: RecordStore, now: boolean | number, effect: Effect): [string, boolean | number] {
  if (effect.effect === 'add-to-flag') {
    const [id, record] = target(content, effect, 'number');
    if (!Number.isSafeInteger(effect.by)) throw new Error(`add-to-flag: "by" is a whole number`);
    return [id, withinBounds(record.number as FlagNumber, (now as number) + (effect.by as number))];
  }
  const [id, record] = target(content, effect, 'either');
  const { to } = effect;
  if (record.number === undefined) {
    if (typeof to !== 'boolean') throw new Error(`set-flag: "${id}" is on or off, so "to" is true or false`);
    return [id, to];
  }
  if (!Number.isSafeInteger(to)) throw new Error(`set-flag: "${id}" is a number, so "to" is a whole number`);
  return [id, withinBounds(record.number, to as number)];
}

function change(ctx: ModuleContext<FlagSlice>, effect: Effect): void {
  const now = flagValue(ctx.read(), ctx.content, effect.flag) as boolean | number;
  const [id, next] = nextValue(ctx.content, now, effect);
  if (next === now) return;
  const record = flagRecord(ctx.content, id) as FlagRecord;
  const start = record.number === undefined ? false : (record.number.start ?? 0);
  const values = ctx.write().values as Record<string, boolean | number>;
  if (next === start) delete values[id];
  else values[id] = next;
  ctx.emit('changed', { flag: id });
}

function preview(ctx: PreviewContext<FlagSlice>, effect: Effect) {
  const from = flagValue(ctx.read(), ctx.content, effect.flag) as boolean | number;
  const [flag, to] = nextValue(ctx.content, from, effect);
  return { flag, from, to };
}

export const flagModule = defineModule<FlagSlice>({
  id: FLAG,
  init: () => ({ values: {} }),
  facts: {
    on: {
      args: FLAG_ARG,
      domain: { type: 'bool' },
      describe: (test) => (test.op === undefined ? `${String(test.args?.flag)} is on` : undefined),
      // A number flag has no on or off: validation stops a condition that asks (E026).
      read: (view, { flag }) => {
        const value = read(view, flag);
        return typeof value === 'boolean' ? value : undefined;
      },
    },
    number: {
      args: FLAG_ARG,
      domain: { type: 'int' },
      label: 'flag',
      describe: (test) =>
        test.op === undefined ? undefined : `${String(test.args?.flag)} ${OP_WORDS[test.op]} ${String(test.value)}`,
      read: (view, { flag }) => {
        const value = read(view, flag);
        return typeof value === 'number' ? value : undefined;
      },
    },
  },
  effects: {
    'set-flag': { run: change, preview },
    'add-to-flag': { run: change, preview },
  },
  events: {
    changed: { args: FLAG_ARG, label: 'A flag changes' },
  },
});
