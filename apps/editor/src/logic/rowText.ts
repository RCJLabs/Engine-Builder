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
    case 'walk-to':
      return `walk ${named(effect.actor, 'an actor')} to ${named(effect.to, 'a place')}`;
    case 'follow':
      return `have ${named(effect.actor, 'an actor')} follow the player${typeof effect.distance === 'number' ? `, ${effect.distance} m behind` : ''}`;
    case 'stand':
      return `stop ${named(effect.actor, 'an actor')}${effect.facing === 'player' ? ', facing the player' : ''}`;
    default:
      return kitEffectText(effect) ?? effect.effect;
  }
}

// `what` with its article: "an item", "a shop".
const named = (value: unknown, what: string) =>
  typeof value === 'string' && value !== '' ? value : `${what} not yet chosen`;
const times = (count: unknown) => (typeof count === 'number' && count !== 1 ? `${count} × ` : '');

/** The kits' effects in a few words (M3.3): "give 2 × medkit", "pay 10 credits", "open dutch-yard". */
function kitEffectText(effect: Record<string, unknown>): string | undefined {
  switch (effect.effect) {
    case 'give-item':
      return `give ${times(effect.count)}${named(effect.item, 'an item')}`;
    case 'take-item':
      return `take ${times(effect.count)}${named(effect.item, 'an item')}`;
    case 'roll-loot':
      return `roll ${named(effect.table, 'a loot table')}`;
    case 'add-resource':
      return typeof effect.by === 'number' && effect.by < 0
        ? `take ${-effect.by} ${named(effect.resource, 'a resource')}`
        : `add ${written(effect.by)} ${named(effect.resource, 'a resource')}`;
    case 'pay-cost': {
      const cost = isObject(effect.cost) ? Object.entries(effect.cost) : [];
      return cost.length === 0
        ? 'pay a cost not yet set'
        : `pay ${cost.map(([id, n]) => `${written(n)} ${id}`).join(' and ')}`;
    }
    case 'open-shop':
      return `open ${named(effect.shop, 'a shop')}`;
    default:
      return statEffectText(effect);
  }
}

// "ana’s health", or "health of an actor not yet chosen".
const whose = (actor: unknown, of: unknown, what: string) =>
  typeof actor === 'string' && actor !== '' && typeof of === 'string' && of !== ''
    ? `${actor}’s ${of}`
    : `${named(of, what)} of ${named(actor, 'an actor')}`;

/** The stats and gear kits' effects (M3.4): "damage ana’s health by 3", "add 2 × bleeding to bo". */
function statEffectText(effect: Record<string, unknown>): string | undefined {
  const stat = whose(effect.actor, effect.stat, 'a stat');
  const actor = named(effect.actor, 'an actor');
  switch (effect.effect) {
    case 'add-to-stat':
      return typeof effect.by === 'number' && effect.by < 0
        ? `take ${-effect.by} from ${stat}`
        : `add ${written(effect.by)} to ${stat}`;
    case 'damage-stat':
      return `damage ${stat} by ${written(effect.by)}`;
    case 'heal-stat':
      return effect.by === undefined ? `heal all of ${stat}` : `heal ${stat} by ${written(effect.by)}`;
    case 'add-status':
      return `add ${times(effect.stacks)}${named(effect.status, 'a status')} to ${actor}`;
    case 'remove-status':
      return `remove ${times(effect.stacks)}${named(effect.status, 'a status')} from ${actor}`;
    case 'equip':
      return `equip ${actor} with ${named(effect.item, 'an item')}${effect.slot === undefined ? '' : ` in ${named(effect.slot, 'a slot')}`}`;
    case 'unequip':
      return `unequip ${whose(effect.actor, effect.slot, 'a slot')}`;
    default:
      return laterEffectText(effect);
  }
}

// "3 days", "1 day and 6 hours": a duration's units, each said once, in the order written.
function lengthOf(duration: unknown): string {
  const parts = isObject(duration) ? Object.entries(duration).filter(([, n]) => typeof n === 'number' && n > 0) : [];
  if (parts.length === 0) return 'a length not yet set';
  return parts.map(([unit, n]) => `${n} ${n === 1 ? unit.replace(/s$/, '') : unit}`).join(' and ');
}

/**
 * The factions and time kits' effects (M3.5): "take 45 from grimsgarth’s standing", "wait 3 days",
 * "do 2 effects in 1 day and every 7 days after".
 */
function laterEffectText(effect: Record<string, unknown>): string | undefined {
  const { effect: name, ...rest } = effect;
  switch (name) {
    case 'change-standing': {
      const { faction } = effect;
      const standing =
        typeof faction === 'string' && faction !== ''
          ? `${faction}’s standing`
          : 'the standing of a faction not yet chosen';
      return typeof effect.by === 'number' && effect.by < 0
        ? `take ${-effect.by} from ${standing}`
        : `add ${written(effect.by)} to ${standing}`;
    }
    case 'wait':
      return `wait ${lengthOf(rest)}`;
    case 'cancel-timer':
      return `cancel the timer ${named(effect.timer, 'a timer')}`;
    case 'schedule': {
      const count = Array.isArray(effect.effects) ? effect.effects.length : 0;
      const every = effect.every === undefined ? '' : ` and every ${lengthOf(effect.every)} after`;
      return `do ${count === 1 ? '1 effect' : `${count} effects`} in ${lengthOf(effect.after)}${every}`;
    }
    default:
      return rosterEffectText(effect);
  }
}

// "add 2 to", "take 2 from": a whole number's change in words.
const changeBy = (by: unknown, what: string) =>
  typeof by === 'number' && by < 0 ? `take ${-by} from ${what}` : `add ${written(by)} to ${what}`;

/**
 * The roster kit's effects (M3.6): "recruit deckhand", "take ana off the roster: dead", "add 1 to
 * every bond on the roster", "start dock’s next round".
 */
function rosterEffectText(effect: Record<string, unknown>): string | undefined {
  const actor = named(effect.actor, 'an actor');
  const { hall } = effect;
  switch (effect.effect) {
    case 'recruit':
      return typeof effect.recruit === 'string' && effect.recruit !== ''
        ? `recruit ${effect.recruit}`
        : 'recruit from a template not yet chosen';
    case 'join':
      return `put ${actor} on the roster`;
    case 'leave':
      return typeof effect.why === 'string' && effect.why !== ''
        ? `take ${actor} off the roster: ${effect.why}`
        : `take ${actor} off the roster`;
    case 'change-bond':
      return changeBy(effect.by, `the bond of ${actor} and ${named(effect.with, 'an actor')}`);
    case 'change-bonds':
      return changeBy(effect.by, 'every bond on the roster');
    case 'open-hall':
      return `open ${named(hall, 'a hall')}`;
    case 'refresh-hall':
      return typeof hall === 'string' && hall !== ''
        ? `start ${hall}’s next round`
        : 'start the next round of a hall not yet chosen';
    default:
      return eventEffectText(effect);
  }
}

// "after 3 days", "after 2 choices", "once nodes has risen by 3": when a consequence comes due.
function dueText(after: unknown): string {
  const given = isObject(after) ? after : {};
  const kinds = ['days', 'choices', 'flag'].filter((kind) => given[kind] !== undefined);
  if (kinds.length !== 1) return 'later, when is not yet set';
  if (given.days !== undefined) return `after ${lengthOf({ days: given.days })}`;
  if (given.choices !== undefined)
    return given.choices === 1 ? 'after 1 choice' : `after ${written(given.choices)} choices`;
  return `once ${written(given.flag)} has risen by ${written(given.by ?? 1)}`;
}

/** The events kit's effects (M3.7): "open the event raiders", "do 1 effect after 3 days", "cancel the consequence debt". */
function eventEffectText(effect: Record<string, unknown>): string | undefined {
  switch (effect.effect) {
    case 'open-event':
      return `open the event ${named(effect.event, 'an event')}`;
    case 'draw-event':
      return `draw an event from ${named(effect.deck, 'a deck')}`;
    case 'later': {
      const count = Array.isArray(effect.do) ? effect.do.length : 0;
      const id = typeof effect.id === 'string' && effect.id !== '' ? `${effect.id}: ` : '';
      return `${id}do ${count === 1 ? '1 effect' : `${count} effects`} ${dueText(effect.after)}`;
    }
    case 'cancel-later':
      return `cancel the consequence ${named(effect.id, 'a consequence')}`;
    // The dialogue kit's one effect (M3.8): "open the talk marge".
    case 'open-talk':
      return `open the talk ${named(effect.talk, 'a talk')}`;
    default:
      return questEffectText(effect);
  }
}

/** The quests kit's effects (M3.9): "start the quest debt", "move debt to its stage square", "fail the quest debt". */
function questEffectText(effect: Record<string, unknown>): string | undefined {
  const quest = named(effect.quest, 'a quest');
  const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined);
  switch (effect.effect) {
    case 'start-quest':
      return `start the quest ${quest}`;
    case 'set-stage': {
      const stage = text(effect.stage);
      return stage ? `move ${quest} to its stage ${stage}` : `move ${quest} to a stage not yet chosen`;
    }
    case 'fail-quest': {
      const why = text(effect.why);
      return why ? `fail the quest ${quest}: ${why}` : `fail the quest ${quest}`;
    }
    default:
      return fightText(effect);
  }
}

// "+15", "−1": a stance's change, signed.
const signed = (by: number) => (by < 0 ? `−${-by}` : `+${by}`);

/** The encounters kit's effect (M4.7): "fight raiders", "fight bandits with crixus: hit +15, dodge −15". */
function fightText(effect: Record<string, unknown>): string | undefined {
  if (effect.effect !== 'fight') return undefined;
  const fighters =
    Array.isArray(effect.fighters) && effect.fighters.length > 0 ? ` with ${effect.fighters.join(' and ')}` : '';
  const stance = ['hit', 'dodge', 'damage', 'armour'].flatMap((key) => {
    const by = effect[key];
    return typeof by === 'number' && by !== 0 ? [`${key} ${signed(by)}`] : [];
  });
  return `fight ${named(effect.encounter, 'an encounter')}${fighters}${stance.length > 0 ? `: ${stance.join(', ')}` : ''}`;
}

/** "Do: set met-trader to on, then roll 70 / 30", or "Does nothing yet". */
export function doText(effects: unknown): string {
  const list = Array.isArray(effects) ? effects : [];
  if (list.length === 0) return 'Does nothing yet';
  return `Do: ${list.map(effectText).join(', then ')}`;
}
