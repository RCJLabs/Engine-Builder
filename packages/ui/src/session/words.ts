/**
 * The words a session puts in entries' fields: an action's label, a cost, a time (M4.6), why a
 * choice is locked, its odds, a fight's (M4.7). Each is read from what the sim reports (a choice's preview, a record's name), never
 * worked out again here, so what a screen says is what the game does.
 */
import { type Action, type Condition, describeCondition, type FactCatalog, type RecordStore } from '@eb/core';

/** A record's name, when the store has one of this type and id that gives one. */
export function nameOf(content: RecordStore, type: string, id: unknown): string | undefined {
  if (typeof id !== 'string' || !content.has(type, id)) return undefined;
  const { name } = content.get(type, id) as { name?: unknown };
  return typeof name === 'string' && name !== '' ? name : undefined;
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * An action as a button says it, when no screen gives it words: the verb, then what it names,
 * a record's name where its field names a type the pack has. `economy/buy` of rope: "Buy Rope".
 */
export function actionLabel(action: Action, content: RecordStore): string {
  const verb = (action.type.split('/')[1] ?? action.type).replaceAll('-', ' ');
  const named = Object.entries(action)
    .filter(([key]) => key !== 'type')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => nameOf(content, key, value) ?? String(value));
  return capital([verb, ...named].join(' '));
}

/** A cost as "3 Coins, 1 Rope", each resource by its name, in id order. */
export function costText(cost: unknown, content: RecordStore): string | null {
  if (typeof cost !== 'object' || cost === null) return null;
  const parts = Object.keys(cost)
    .sort()
    .map((id) => `${(cost as Record<string, unknown>)[id]} ${nameOf(content, 'resource', id) ?? id}`);
  return parts.length === 0 ? null : parts.join(', ');
}

/** A time as "3 hours" or "1 day, 2 hours", in the calendar's units by id; null when it takes none. */
export function takesText(takes: unknown): string | null {
  if (typeof takes !== 'object' || takes === null) return null;
  const counts = takes as Record<string, unknown>;
  const parts = Object.keys(counts)
    .sort()
    .filter((unit) => typeof counts[unit] === 'number' && (counts[unit] as number) > 0)
    .map((unit) => `${counts[unit]} ${counts[unit] === 1 ? unit.replace(/s$/, '') : unit}`);
  return parts.length === 0 ? null : parts.join(', ');
}

/**
 * What effects do, as their previews give them: "heat 0 → 2", a flag or a resource by its name,
 * from and to. An effect that changes nothing, or that the preview doesn't number, says nothing.
 */
export function changesText(
  previews: readonly Readonly<Record<string, unknown>>[],
  content: RecordStore,
): string | null {
  const parts = previews.flatMap((preview) => {
    const { from, to } = preview;
    if (typeof from !== 'number' || typeof to !== 'number' || from === to) return [];
    const [type, id] = typeof preview.flag === 'string' ? ['flag', preview.flag] : ['resource', preview.resource];
    if (typeof id !== 'string') return [];
    return [`${nameOf(content, type, id) ?? id} ${from} → ${to}`];
  });
  return parts.length === 0 ? null : parts.join(', ');
}

interface Locked {
  readonly needs?: Condition;
  readonly short?: { readonly resource: string; readonly have: number; readonly need: number };
}

/** Why a choice can't be taken: the condition it needs, in words, or the resource it is short of. */
export function whyText(choice: Locked, catalog: FactCatalog, content: RecordStore): string | null {
  if (choice.needs !== undefined) {
    const words = describeCondition(choice.needs, catalog);
    return `Needs ${words.charAt(0).toLowerCase()}${words.slice(1)}`;
  }
  if (choice.short !== undefined) {
    const { resource, have, need } = choice.short;
    return `Costs ${need} ${nameOf(content, 'resource', resource) ?? resource}; you have ${have}`;
  }
  return null;
}

/** A choice's odds as its preview gives them, "70% · 30%"; null when the choice shows none. */
export function oddsText(outcomes: unknown): string | null {
  if (!Array.isArray(outcomes) || outcomes.length === 0) return null;
  return outcomes.map((outcome) => `${(outcome as { chance: number }).chance}%`).join(' · ');
}

interface FightOutcome {
  readonly result: 'win' | 'draw' | 'lose';
  readonly chance: number;
  readonly hurt: readonly [number, number];
  readonly falls: readonly [number, number];
  readonly effects?: readonly Readonly<Record<string, unknown>>[];
}

const RESULT_WORDS = { win: 'Win', draw: 'Draw', lose: 'Lose' } as const;
const span = ([least, most]: readonly [number, number]) => (least === most ? `${least}` : `${least}–${most}`);

/**
 * A fight's odds as its preview gives them, each result in turn, with what it costs and does:
 * "Win 64%, 2–6 Hull lost, Credits 30 → 42 · Lose 36%, 12 Hull lost, 1 falls". Null when the
 * previews hold no fight, as when the event hides its odds.
 */
export function fightText(previews: unknown, content: RecordStore): string | null {
  if (!Array.isArray(previews)) return null;
  const fight = previews.find((p) => p?.effect === 'fight' && Array.isArray(p.outcomes)) as
    | { readonly health: string; readonly outcomes: readonly FightOutcome[] }
    | undefined;
  if (!fight) return null;
  const health = nameOf(content, 'stat', fight.health) ?? fight.health;
  return fight.outcomes
    .map((outcome) => {
      const parts = [`${RESULT_WORDS[outcome.result]} ${outcome.chance}%`];
      if (outcome.hurt[1] > 0) parts.push(`${span(outcome.hurt)} ${health} lost`);
      if (outcome.falls[1] > 0)
        parts.push(`${span(outcome.falls)} ${outcome.falls[0] === 1 && outcome.falls[1] === 1 ? 'falls' : 'fall'}`);
      const changes = changesText(outcome.effects ?? [], content);
      if (changes) parts.push(changes);
      return parts.join(', ');
    })
    .join(' · ');
}
