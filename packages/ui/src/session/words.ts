/**
 * The words a session puts in entries' fields: an action's label, a cost, why a choice is locked,
 * its odds. Each is read from what the sim reports (a choice's preview, a record's name), never
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
