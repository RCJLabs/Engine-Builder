/**
 * A battle in words on a 2D stage (M7.5, D87, docs/specs/tactics.md#the-stage): each unit's name, the line that
 * says what is previewed, a target's odds, and what each beat played back did, in the kit's own wording (lineOf).
 * The odds are the view's, which are shotOdds', which the roll reads.
 */
import type { Beat, Tile } from '@eb/core';
import { type BattleView, battleLine, type OrderChoice, type ShotView, type Told } from '@eb/kits';
import type { Preview } from './pick.ts';

const SIDE_NAME: Readonly<Record<string, string>> = { n: 'north', e: 'east', s: 'south', w: 'west' };
const ORDER_VERB: Readonly<Record<string, string>> = {
  suppress: 'suppresses',
  weld: 'welds the door',
  patch: 'patches',
  hustle: 'hustles',
  mark: 'marks',
  sedate: 'darts',
  kit: 'kits out',
};

/**
 * Each unit's name: its actor's, up to a comma ("Ines, the marine" is Ines), numbered when two share one
 * ("Pirate 1", "Pirate 2").
 */
export function namesOf(view: BattleView, actorName: (actor: string) => string | undefined): (id: string) => string {
  const short = (actor: string) => (actorName(actor) ?? actor).split(',')[0]?.trim() || actor;
  const names = new Map<string, string>();
  for (const unit of view.units) {
    const twins = view.units.filter((u) => u.actor === unit.actor);
    const n = twins.indexOf(unit) + 1;
    names.set(unit.id, twins.length > 1 ? `${short(unit.actor)} ${n}` : short(unit.actor));
  }
  return (id) => names.get(id) ?? id;
}

const points = (n: number) => `${n} action point${n === 1 ? '' : 's'}`;

/** A shot's odds as the targets list and the line say them. */
export const oddsText = (odds: Pick<ShotView, 'hit' | 'crit'>) => `${odds.hit}% to hit, ${odds.crit}% to crit`;

function orderText(order: OrderChoice, name: (id: string) => string): string {
  if (order.side !== undefined) return ` on the ${SIDE_NAME[order.side]} side`;
  if (order.target === undefined) return '';
  return ` ${name(order.target)}${order.odds ? `: ${oddsText(order.odds)}` : ''}`;
}

/** What a preview does, as the live line says it; the kind of order from the unit's view. */
export function previewLine(preview: Preview, view: BattleView, name: (id: string) => string): string {
  if (preview.kind === 'end') return 'End the crew’s turn.';
  const who = name(preview.unit);
  switch (preview.kind) {
    case 'move': {
      const [c, r] = preview.step.to;
      return `${who} moves to ${c}, ${r}: ${points(preview.step.ap)}.`;
    }
    case 'shoot':
      return `${who} shoots ${name(preview.shot.target)}: ${oddsText(preview.shot)}.`;
    case 'watch':
      return `${who} goes on overwatch.`;
    case 'reload':
      return `${who} reloads.`;
    case 'steady':
      return `${who} steadies ${name(preview.target)}.`;
    case 'open':
      return `${who} opens the door on the ${SIDE_NAME[preview.side]} side.`;
    case 'order': {
      const kind = view.units.find((u) => u.id === preview.unit)?.order?.kind ?? 'order';
      return `${who} ${ORDER_VERB[kind] ?? 'gives an order'}${orderText(preview.order, name)}.`;
    }
  }
}

/** A beat's line, the kit's wording, its tiles as "c, r"; none for one the kit has no words for. */
export function beatLine(beat: Beat, name: (id: string) => string): string {
  const told = { ...beat, type: beat.type.replace(/^tactics\//, '') } as Told;
  if (told.type === 'started' || told.type === 'won' || told.type === 'lost') return endsLine(told.type);
  return battleLine(told, { name, place: ([c, r]: Tile) => `${c}, ${r}` });
}

const endsLine = (type: string) =>
  type === 'started' ? 'The battle starts.' : type === 'won' ? 'The battle is won.' : 'The battle is lost.';
