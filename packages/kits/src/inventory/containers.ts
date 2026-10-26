/**
 * Containers and bodies opened (M6.8, D80, docs/specs/barter.md#containers): a chest's items, kept by
 * `space/object` once they change and the pack's until then, or a fallen body's bag; taken into the
 * party's bag and put back one line at a time, in the kit's container mode. The actions and the
 * options they offer share their checks, so what is offered is what is accepted.
 */
import {
  type Action,
  type Containers,
  containerKey,
  type DeepReadonly,
  type Effect,
  type ModeFrame,
  type ModuleContext,
  type RecordStore,
} from '@eb/core';
import { bagOf, whose } from './bags.ts';
import { itemRecord, room } from './items.ts';
import { CONTAINER, type InventorySlice, ITEM } from './types.ts';

/** What the mode is open on: a container by its space and object, or a body by its actor. */
export type Opened = { readonly space: string; readonly object: string } | { readonly actor: string };

/** The mode's data, as open-container pushes it. */
export function openedIn(mode: ModeFrame): Opened | undefined {
  if (mode.id !== CONTAINER) return undefined;
  const data = mode.data as { space?: unknown; object?: unknown; actor?: unknown } | undefined;
  if (typeof data?.actor === 'string') return { actor: data.actor };
  if (typeof data?.space === 'string' && typeof data.object === 'string')
    return { space: data.space, object: data.object };
  return undefined;
}

const keyOf = (opened: Opened): string | undefined =>
  'actor' in opened ? undefined : containerKey(opened.space, opened.object);

/** What the opened container or body holds now. */
export function heldBy(
  content: RecordStore,
  containers: Containers,
  state: DeepReadonly<InventorySlice>,
  opened: Opened,
): Readonly<Record<string, number>> {
  if ('actor' in opened) return bagOf(content, state as InventorySlice, opened.actor);
  const key = keyOf(opened) as string;
  return state.held[key] ?? containers[key] ?? {};
}

/** A container's items to change, copied out of the pack the first time anything in it changes. */
function heldToWrite(ctx: ModuleContext<InventorySlice>, containers: Containers, key: string): Record<string, number> {
  const slice = ctx.write() as { held: Record<string, Record<string, number>> };
  const kept = slice.held[key];
  if (kept) return kept;
  const made = { ...(containers[key] ?? {}) };
  slice.held[key] = made;
  return made;
}

/** `open-container { space, object }` or `{ actor }`: the container mode opened on it. */
export function openContainer(ctx: ModuleContext<InventorySlice>, containers: Containers, effect: Effect) {
  if (openedIn(ctx.modes.current) !== undefined) return ctx.refuse('already-open');
  const { space, object, actor } = effect as Effect & { space?: unknown; object?: unknown; actor?: unknown };
  if (actor !== undefined) {
    ctx.modes.push(CONTAINER, { actor: whose(ctx.content, actor) as string });
    return;
  }
  if (
    typeof space !== 'string' ||
    typeof object !== 'string' ||
    !Object.hasOwn(containers, containerKey(space, object))
  )
    throw new Error(`open-container: no container "${String(space)}/${String(object)}"`);
  ctx.modes.push(CONTAINER, { space, object });
  ctx.emit('opened', { space, object });
}

/** How many of the item a move would take: `count`, or the whole line when it gives none. */
function amountOf(action: Action, line: number): number {
  const count = (action as Action & { count?: unknown }).count;
  if (count === undefined) return line;
  if (!Number.isSafeInteger(count) || (count as number) < 1) throw new Error('"count" is a whole number, 1 or more');
  return Math.min(count as number, line);
}

/** How many of the line the party's bag has room for now. */
const fits = (content: RecordStore, state: DeepReadonly<InventorySlice>, item: string, n: number) =>
  room(itemRecord(content, item), state.bag[item] ?? 0, n);

/** Moves `n` of the item out of the opened container or body, or into it (`n` below 0). */
function move(ctx: ModuleContext<InventorySlice>, containers: Containers, opened: Opened, item: string, n: number) {
  if ('actor' in opened) {
    const [from, to] = n > 0 ? [opened.actor, undefined] : [undefined, opened.actor];
    ctx.apply({ effect: 'take-item', item, count: Math.abs(n), ...(from === undefined ? {} : { actor: from }) });
    ctx.apply({ effect: 'give-item', item, count: Math.abs(n), ...(to === undefined ? {} : { actor: to }) });
    return;
  }
  const key = keyOf(opened) as string;
  if (n > 0) ctx.apply({ effect: 'give-item', item, count: n });
  else ctx.apply({ effect: 'take-item', item, count: -n });
  const held = heldToWrite(ctx, containers, key);
  const left = (held[item] ?? 0) - n;
  if (left > 0) held[item] = left;
  else delete held[item];
  ctx.emit(n > 0 ? 'took' : 'put', { space: opened.space, object: opened.object, item, count: Math.abs(n) });
}

/** `inventory/take { item, count? }`: the line, or as much of it as the party's bag has room for. */
export function takeOut(ctx: ModuleContext<InventorySlice>, containers: Containers, action: Action) {
  const opened = openedIn(ctx.modes.current);
  if (opened === undefined) return ctx.refuse('not-open');
  const { item } = action as Action & { item?: unknown };
  const line = typeof item === 'string' ? (heldBy(ctx.content, containers, ctx.read(), opened)[item] ?? 0) : 0;
  if (line < 1) return ctx.refuse('none', { item: String(item) });
  const n = fits(ctx.content, ctx.read(), item as string, amountOf(action, line));
  if (n < 1) return ctx.refuse('full', { item });
  move(ctx, containers, opened, item as string, n);
}

/** `inventory/put { item, count? }`: the party's line, or `count` of it, into the container. */
export function putIn(ctx: ModuleContext<InventorySlice>, containers: Containers, action: Action) {
  const opened = openedIn(ctx.modes.current);
  if (opened === undefined) return ctx.refuse('not-open');
  const { item } = action as Action & { item?: unknown };
  const line = typeof item === 'string' ? (ctx.read().bag[item] ?? 0) : 0;
  if (line < 1) return ctx.refuse('none', { item: String(item) });
  move(ctx, containers, opened, item as string, -amountOf(action, line));
}

/** `inventory/take-all`: every line in item id order, as much of each as fits; `none` when empty, `full` when none fits. */
export function takeAll(ctx: ModuleContext<InventorySlice>, containers: Containers) {
  const opened = openedIn(ctx.modes.current);
  if (opened === undefined) return ctx.refuse('not-open');
  const lines = heldBy(ctx.content, containers, ctx.read(), opened);
  const items = Object.keys(lines).sort();
  if (items.length === 0) return ctx.refuse('none');
  let moved = false;
  for (const item of items) {
    if (!ctx.content.has(ITEM, item)) continue;
    const n = fits(ctx.content, ctx.read(), item, lines[item] as number);
    if (n < 1) continue;
    move(ctx, containers, opened, item, n);
    moved = true;
  }
  if (!moved) return ctx.refuse('full');
}

/** `inventory/close`: back to the mode it was opened from. */
export function close(ctx: ModuleContext<InventorySlice>) {
  const opened = openedIn(ctx.modes.current);
  if (opened === undefined) return ctx.refuse('not-open');
  ctx.modes.pop();
  if (!('actor' in opened)) ctx.emit('closed', { space: opened.space, object: opened.object });
}

/** The lines Take offers now: each item held that the party's bag has room for some of. */
export function takeOptions(
  content: RecordStore,
  containers: Containers,
  state: DeepReadonly<InventorySlice>,
  opened: Opened,
): string[] {
  const lines = heldBy(content, containers, state, opened);
  return Object.keys(lines)
    .sort()
    .filter((item) => content.has(ITEM, item) && fits(content, state, item, lines[item] as number) > 0);
}
