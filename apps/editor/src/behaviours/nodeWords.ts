/**
 * A behaviour's node in a few words (M6.3, D75), for its row in the outline: "8 to 18, if ai.level
 * (actor: @self) is alerted", "Work at forge", "Patrol well, gate, 5 minutes at each". English only,
 * as rowText is, and read off the file as written: a field not yet filled says so.
 */
import { kindOf, type NodeKind } from '@eb/kits';
import { effectText } from '../logic/rowText.ts';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What each kind is called where it is picked. */
export const KIND_WORDS: Readonly<Record<NodeKind, string>> = {
  first: 'The first that holds',
  'in-order': 'In order',
  guard: 'Only when',
  travel: 'Travel',
  sleep: 'Sleep',
  work: 'Work',
  patrol: 'Patrol',
  sandbox: 'Wander',
  follow: 'Follow the player',
  wait: 'Wait',
  face: 'Face the player',
  effects: 'Do effects',
  attack: 'Attack the player',
};

/** The kinds a step can be made: an attack only with the fighting kit on (M6.4), E081's otherwise. */
export const kindsFor = (fighting: boolean): NodeKind[] =>
  (Object.keys(KIND_WORDS) as NodeKind[]).filter((kind) => fighting || kind !== 'attack');

/** "10 minutes", "1 hour and 30 minutes": a length in the calendar's units, a unit of one said as one. */
export function lengthText(length: unknown): string {
  if (!isObject(length)) return 'a length not yet set';
  const parts = Object.entries(length).map(
    ([unit, n]) => `${String(n)} ${n === 1 && unit.endsWith('s') ? unit.slice(0, -1) : unit}`,
  );
  return parts.length === 0 ? 'a length not yet set' : parts.join(' and ');
}

const point = (value: unknown) => (typeof value === 'string' && value !== '' ? value : 'a point not yet chosen');
const points = (value: unknown) =>
  Array.isArray(value) && value.length > 0 ? value.map(point).join(', ') : 'points not yet chosen';
const condition = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));

/** A guard's guards: its hours, days, condition and cooldown. */
function guardText(node: Record<string, unknown>): string {
  const parts: string[] = [];
  const hours = Array.isArray(node.hours) ? node.hours : undefined;
  if (hours) parts.push(`${String(hours[0])} to ${String(hours[1])}`);
  if (Array.isArray(node.days)) parts.push(`on ${node.days.join(', ')}`);
  if (node.if !== undefined && node.if !== '') parts.push(`if ${condition(node.if)}`);
  if (node.cooldown !== undefined) parts.push(`then not for ${lengthText(node.cooldown)}`);
  return parts.length === 0 ? 'Always' : `Only ${parts.join(', ')}`;
}

/** The node's row: its kind and what it holds. */
export function nodeText(node: unknown): string {
  const kind = kindOf(node);
  if (kind === undefined || !isObject(node)) return 'Nothing yet: choose what it does';
  const dwell = node.dwell === undefined ? '' : `, ${lengthText(node.dwell)} at each`;
  switch (kind) {
    case 'first':
    case 'in-order':
      return KIND_WORDS[kind];
    case 'guard':
      return guardText(node);
    case 'travel':
      return `Travel to ${point(node.travel)}`;
    case 'sleep':
      return `Sleep at ${point(node.sleep)}`;
    case 'work':
      return `Work at ${point(node.work)}`;
    case 'patrol':
      return `Patrol ${points(node.patrol)}${dwell}`;
    case 'sandbox':
      return `Wander ${points(node.sandbox)}${dwell}`;
    case 'follow':
      return `Follow the player${typeof node.distance === 'number' ? `, ${node.distance} m behind` : ''}`;
    case 'wait':
      return `Wait ${lengthText(node.wait)}`;
    case 'face':
      return 'Face the player';
    case 'effects': {
      const effects = Array.isArray(node.effects) ? node.effects : [];
      return effects.length === 0 ? 'Do effects not yet added' : `Do: ${effects.map(effectText).join(', then ')}`;
    }
    case 'attack':
      return 'Attack the player';
  }
}
