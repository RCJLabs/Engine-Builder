/**
 * What a tap, a key or a bar's button does to a battle on a 2D stage (M7.5, D87, docs/specs/tactics.md#the-stage;
 * after space-wrecked's src/ui/fight/fight.js): a tap on a crew member with choices selects them; on a tile the
 * selected can reach it previews the move, on a foe they can shoot the shot; the same again, or Confirm, sends it;
 * anywhere else clears the preview. A bar's button previews its action, and sends it pressed again. Plain functions
 * of the battle's view and the controller's own state; an action sent is exactly one the sim offered.
 */
import type { Action, Side, Tile } from '@eb/core';
import type { BattleView, BattleChoices as ChoicesView, OrderChoice, ShotView, StepView } from '@eb/kits';

export type Preview =
  | { readonly kind: 'move'; readonly unit: string; readonly step: StepView }
  | { readonly kind: 'shoot'; readonly unit: string; readonly shot: ShotView }
  | { readonly kind: 'order'; readonly unit: string; readonly order: OrderChoice }
  | { readonly kind: 'watch' | 'reload'; readonly unit: string }
  | { readonly kind: 'steady'; readonly unit: string; readonly target: string }
  | { readonly kind: 'open'; readonly unit: string; readonly side: Side }
  | { readonly kind: 'end' };

export interface Picking {
  readonly selected?: string;
  readonly preview?: Preview;
  readonly cursor?: Tile;
}

export interface Picked {
  readonly picking: Picking;
  /** The action to send, when this was the second of the same, or Confirm. */
  readonly send?: Action;
}

const same = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1];
const standing = (status: string) => status === 'active' || status === 'down' || status === 'stable';

export const choicesOf = (view: BattleView, unit: string | undefined): ChoicesView | undefined =>
  unit === undefined ? undefined : view.choices.find((c) => c.unit === unit);

/** The action a preview sends: the payload the kit's options give, under its action's type. */
export function actionOf(preview: Preview): Action {
  switch (preview.kind) {
    case 'move':
      return { type: 'tactics/move', unit: preview.unit, to: [preview.step.to[0], preview.step.to[1]] };
    case 'shoot':
      return { type: 'tactics/shoot', unit: preview.unit, target: preview.shot.target };
    case 'order': {
      const { target, side } = preview.order;
      return {
        type: 'tactics/order',
        unit: preview.unit,
        ...(target !== undefined ? { target } : {}),
        ...(side !== undefined ? { side } : {}),
      };
    }
    case 'steady':
      return { type: 'tactics/steady', unit: preview.unit, target: preview.target };
    case 'open':
      return { type: 'tactics/open', unit: preview.unit, side: preview.side };
    case 'end':
      return { type: 'tactics/end' };
    default:
      return { type: `tactics/${preview.kind}`, unit: preview.unit };
  }
}

const sameAction = (a: Preview, b: Preview) => JSON.stringify(actionOf(a)) === JSON.stringify(actionOf(b));

/** The preview a tap on `tile` makes for the selected: a shot at a foe there, else a move there. */
function previewAt(view: BattleView, chosen: ChoicesView, tile: Tile): Preview | undefined {
  const foe = view.units.find((u) => u.side === 'foes' && standing(u.status) && same(u.at, tile));
  const shot = foe ? chosen.shots.find((s) => s.target === foe.id) : undefined;
  if (shot) return { kind: 'shoot', unit: chosen.unit, shot };
  const step = chosen.moves.find((m) => same(m.to, tile));
  return step ? { kind: 'move', unit: chosen.unit, step } : undefined;
}

/** A preview shown, or sent when it is the one already shown. */
export function choose(picking: Picking, preview: Preview): Picked {
  if (picking.preview && sameAction(picking.preview, preview)) {
    const { preview: _, ...rest } = picking;
    return { picking: rest, send: actionOf(preview) };
  }
  return { picking: { ...picking, preview } };
}

/** A tap, a click or Enter on a tile. */
export function tap(view: BattleView, picking: Picking, tile: Tile): Picked {
  const { preview: _, ...cleared } = { ...picking, cursor: tile };
  const unit = view.units.find((u) => standing(u.status) && same(u.at, tile));
  if (unit?.side === 'crew' && unit.id !== picking.selected && choicesOf(view, unit.id))
    return { picking: { ...cleared, selected: unit.id } };
  const chosen = choicesOf(view, picking.selected);
  const preview = chosen ? previewAt(view, chosen, tile) : undefined;
  return preview ? choose({ ...picking, cursor: tile }, preview) : { picking: cleared };
}

/** Confirm: the preview shown sent. */
export const confirm = (picking: Picking): Picked => (picking.preview ? choose(picking, picking.preview) : { picking });

/** Cancel: the preview cleared, or with none, the selection. */
export function cancel(picking: Picking): Picking {
  const { preview, selected, ...rest } = picking;
  if (preview) return selected === undefined ? rest : { ...rest, selected };
  return rest;
}

/**
 * The state kept true to a new view: a preview the view no longer offers goes, and the selection moves to the
 * first of the crew with choices when the one selected has none left, as fight.js picks the next unit.
 */
export function settle(view: BattleView, picking: Picking): Picking {
  const offered = (p: Preview) => {
    if (p.kind === 'end') return view.side === 'crew';
    const chosen = choicesOf(view, p.unit);
    if (!chosen) return false;
    const all = previewsOf(chosen);
    return all.some((q) => sameAction(p, q));
  };
  const selected = choicesOf(view, picking.selected) ? picking.selected : view.choices[0]?.unit;
  const preview = picking.preview && offered(picking.preview) ? picking.preview : undefined;
  return {
    ...(selected !== undefined ? { selected } : {}),
    ...(preview ? { preview } : {}),
    ...(picking.cursor ? { cursor: picking.cursor } : {}),
  };
}

/** Every preview a unit's choices make: what its bar and its taps can send. */
export function previewsOf(c: ChoicesView): Preview[] {
  const unit = c.unit;
  return [
    ...c.moves.map((step) => ({ kind: 'move', unit, step }) as const),
    ...c.shots.map((shot) => ({ kind: 'shoot', unit, shot }) as const),
    ...(c.watch ? [{ kind: 'watch', unit } as const] : []),
    ...(c.reload ? [{ kind: 'reload', unit } as const] : []),
    ...c.steady.map((target) => ({ kind: 'steady', unit, target }) as const),
    ...c.open.map((side) => ({ kind: 'open', unit, side }) as const),
    ...c.orders.map((order) => ({ kind: 'order', unit, order }) as const),
  ];
}

/** The cursor moved a tile by an arrow key, kept on the map; from the selected unit when there is none yet. */
export function stepCursor(view: BattleView, picking: Picking, by: Tile, size: Tile): Picking {
  const from = picking.cursor ?? view.units.find((u) => u.id === picking.selected)?.at ?? [0, 0];
  const keep = (n: number, most: number) => Math.min(most - 1, Math.max(0, n));
  return { ...picking, cursor: [keep(from[0] + by[0], size[0]), keep(from[1] + by[1], size[1])] };
}
