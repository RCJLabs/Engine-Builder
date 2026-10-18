/**
 * A trigger row in words (M3.1), for the Logic panel's cards: "When a flag changes (flag:
 * met-trader)", "If met-trader is on", "Do: set met-trader to on, then roll 70 / 30". English only,
 * as describeCondition is, until string tables arrive.
 */
import {
  type Condition,
  checkCondition,
  describeCondition,
  type EventCatalog,
  type FactCatalog,
  parseCondition,
} from '@eb/core';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
const written = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));

/** "When a flag changes (flag: met-trader)", or the event as written when the editor doesn't know it. */
export function whenText(when: unknown, events: EventCatalog): string {
  if (!isObject(when) || typeof when.event !== 'string' || when.event === '') return 'When an event not yet chosen';
  const label = events[when.event]?.label;
  const args = isObject(when.args) ? Object.entries(when.args) : [];
  const given = args.length > 0 ? ` (${args.map(([name, value]) => `${name}: ${written(value)}`).join(', ')})` : '';
  return `When ${label ? lower(label) : when.event}${given}`;
}

/** "If met-trader is on", or undefined for a row with no condition; text that doesn't parse is shown as written. */
export function ifText(condition: unknown, facts: FactCatalog): string | undefined {
  if (condition === undefined) return undefined;
  const tree = typeof condition === 'string' ? parseCondition(condition, facts) : null;
  if (tree && !tree.ok) return `If ${condition}`;
  const sound = tree ? tree.condition : checkCondition(condition).length === 0 ? (condition as Condition) : null;
  return sound ? `If ${lower(describeCondition(sound, facts))}` : `If ${written(condition)}`;
}

/** One effect in a few words: what a card has room for. */
export function effectText(effect: unknown): string {
  if (!isObject(effect) || typeof effect.effect !== 'string' || effect.effect === '') return 'an effect not yet named';
  const flag = typeof effect.flag === 'string' && effect.flag !== '' ? effect.flag : 'a flag not yet chosen';
  switch (effect.effect) {
    case 'set-flag':
      return `set ${flag} to ${effect.to === true ? 'on' : effect.to === false ? 'off' : written(effect.to)}`;
    case 'add-to-flag':
      return typeof effect.by === 'number' && effect.by < 0
        ? `take ${-effect.by} from ${flag}`
        : `add ${written(effect.by)} to ${flag}`;
    case 'roll': {
      const outcomes = Array.isArray(effect.outcomes) ? effect.outcomes : [];
      const chances = outcomes.map((o) => (isObject(o) ? written(o.chance) : '?'));
      return chances.length > 0 ? `roll ${chances.join(' / ')}` : 'roll';
    }
    default:
      return effect.effect;
  }
}

/** "Do: set met-trader to on, then roll 70 / 30", or "Does nothing yet". */
export function doText(effects: unknown): string {
  const list = Array.isArray(effects) ? effects : [];
  if (list.length === 0) return 'Does nothing yet';
  return `Do: ${list.map(effectText).join(', then ')}`;
}
