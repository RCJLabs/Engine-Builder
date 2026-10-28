/**
 * The battle as a stage in code is handed it (M7.5, D87, docs/specs/tactics.md#a-stage-in-code): the controller's
 * moment as plain data, each unit where the playback has it, the chosen unit's reach and targets while nothing
 * plays, and the preview as its kind with the tiles and ids a board needs to draw it.
 */
import type { StageBattle } from '../stagecode/api.ts';
import type { BattleNow } from './controller.ts';
import type { Preview } from './pick.ts';

type Pair = readonly [number, number];

const pair = (t: readonly number[]): Pair => [t[0] as number, t[1] as number];

function previewOf(p: Preview): NonNullable<StageBattle['preview']> {
  switch (p.kind) {
    case 'move':
      return { kind: 'move', unit: p.unit, path: p.step.path.map(pair), to: pair(p.step.to) };
    case 'shoot':
      return { kind: 'shoot', unit: p.unit, target: p.shot.target };
    case 'order':
      return {
        kind: 'order',
        unit: p.unit,
        ...(p.order.target !== undefined ? { target: p.order.target } : {}),
        ...(p.order.side !== undefined ? { side: p.order.side } : {}),
      };
    case 'steady':
      return { kind: 'steady', unit: p.unit, target: p.target };
    case 'open':
      return { kind: 'open', unit: p.unit, side: p.side };
    case 'end':
      return { kind: 'end' };
    default:
      return { kind: p.kind, unit: p.unit };
  }
}

/** The battle now, for Frame.battle; `inset` is the bar's room at the foot of the box. */
export function stageBattleOf(now: BattleNow, inset: number): StageBattle {
  const { view, picking, playing } = now;
  const chosen = playing ? undefined : view.choices.find((c) => c.unit === picking.selected);
  return {
    side: view.side,
    round: view.round,
    units: view.units.map((u) => {
      const shown = now.units.get(u.id);
      return {
        id: u.id,
        actor: u.actor,
        side: u.side,
        at: pair(shown?.at ?? u.at),
        hp: shown?.hp ?? u.hp,
        most: u.most,
        status: shown?.status ?? u.status,
        watch: u.watch,
      };
    }),
    ...(picking.selected !== undefined ? { selected: picking.selected } : {}),
    reach: (chosen?.moves ?? []).map((m) => ({ to: pair(m.to), ap: m.ap })),
    targets: (chosen?.shots ?? []).map((s) => s.target),
    ...(picking.preview ? { preview: previewOf(picking.preview) } : {}),
    ...(picking.cursor ? { cursor: pair(picking.cursor) } : {}),
    ...(now.shot ? { shot: now.shot } : {}),
    playing,
    inset,
  };
}
