/**
 * The events: all 29, their choices and outcomes as the events kit's, the run's decks, and the
 * drop tables. A choice's need of credits or supplies, paid by every outcome, becomes its cost;
 * berths and parts become conditions. Effects with no kit to do them are the scripts' (`wound`,
 * `sell-part`).
 */
import { defined, type RecordSet, type Value } from './records.ts';
import type { Choice, Event, Source } from './source.ts';

/** The run's decks, by the kind of node that draws from them. */
const DECKS: Readonly<Record<string, string>> = {
  derelict: 'Derelicts',
  distress: 'Distress calls',
  trader: 'Traders',
  hazard: 'Hazards',
};

const RESOURCES = ['credits', 'supplies', 'materials'];

/** An outcome's effects, in the order the original lists them. */
export function effectsOf(source: Source, effects: Readonly<Record<string, unknown>>): Value[] {
  const out: Value[] = [];
  for (const [key, value] of Object.entries(effects)) {
    if (RESOURCES.includes(key)) out.push({ effect: 'add-resource', resource: key, by: value });
    else if (key === 'heat') out.push({ effect: 'add-to-flag', flag: 'heat', by: value });
    else if (key === 'standing') {
      for (const [faction, by] of Object.entries(value as Record<string, number>))
        out.push({ effect: 'change-standing', faction, by });
    } else if (key === 'wound') {
      const { hp, all } = value as { hp: number; all?: boolean };
      out.push(defined({ effect: 'wound', hp, all }));
    } else if (key === 'drop') out.push({ effect: 'roll-loot', table: value });
    else if (key === 'sell') out.push({ effect: 'sell-part', count: value });
    else if (key === 'joins') {
      const companion = source.companions.companions.find((c) => c.id === value);
      if (!companion) throw new Error(`No companion ${String(value)}`);
      out.push({ effect: 'join', actor: companion.id }, { effect: 'start-quest', quest: companion.loyalty });
    } else throw new Error(`An effect the import doesn't know: ${key}`);
  }
  return out;
}

/** What a need pays: the resource's amount when every outcome takes exactly that off. */
function paid(choice: Choice, resource: string, need: number): boolean {
  return choice.outcomes.every((o) => o.effects[resource] === -need);
}

function needsOf(choice: Choice): { cost?: Record<string, number>; needs?: string } {
  const cost: Record<string, number> = {};
  const conditions: string[] = [];
  for (const [need, n] of Object.entries(choice.needs ?? {})) {
    if (RESOURCES.includes(need) && paid(choice, need, n)) cost[need] = n;
    else if (RESOURCES.includes(need)) conditions.push(`economy.amount(resource: ${need}) >= ${n}`);
    else if (need === 'berth') conditions.push(`roster.room >= ${n}`);
    else if (need === 'parts') conditions.push(`inventory.tagged(tag: part) >= ${n}`);
    else throw new Error(`A need the import doesn't know: ${need}`);
  }
  return {
    ...(Object.keys(cost).length > 0 ? { cost } : {}),
    ...(conditions.length > 0 ? { needs: conditions.join(' and ') } : {}),
  };
}

function choiceOf(source: Source, event: Event, choice: Choice): Value {
  const { cost, needs } = needsOf(choice);
  const strip = (effects: Readonly<Record<string, unknown>>) =>
    Object.fromEntries(Object.entries(effects).filter(([key]) => !(cost && key in cost)));
  // A quest that starts on this choice (quests.json's start) starts first.
  const starts = source.quests.quests.filter((q) => q.start?.event === event.id && q.start.choice === choice.id);
  const before = starts.map((q) => ({ effect: 'start-quest', quest: q.id }));
  const [only] = choice.outcomes;
  if (choice.outcomes.length === 1 && only) {
    const effects = [...before, ...effectsOf(source, strip(only.effects))];
    return defined({
      id: choice.id,
      label: choice.label,
      needs,
      cost,
      result: only.text,
      effects: effects.length > 0 ? effects : undefined,
    });
  }
  return defined({
    id: choice.id,
    label: choice.label,
    needs,
    cost,
    effects: before.length > 0 ? before : undefined,
    outcomes: choice.outcomes.map((o) => ({
      chance: o.chance,
      result: o.text,
      effects: effectsOf(source, strip(o.effects)),
    })),
  });
}

export function importEvents(source: Source, set: RecordSet): void {
  for (const event of source.events.events) {
    set.add('event', event.id, {
      name: event.title,
      text: event.text,
      choices: event.choices.map((choice) => choiceOf(source, event, choice)),
    });
  }
  // Each deck goes through its events before any comes again: the last n−1 drawn are passed over.
  for (const [kind, name] of Object.entries(DECKS)) {
    const events = source.events.events.filter((e) => e.kind === kind && e.quest === undefined).map((e) => e.id);
    set.add('deck', kind, { name, events: events.map((event) => ({ event })), recent: events.length - 1 });
  }
  for (const [table, parts] of Object.entries(source.events.drops)) {
    set.add('loot-table', table, {
      name: table === 'salvage' ? 'Salvage' : 'The colony’s finds',
      entries: Object.entries(parts).map(([item, weight]) => ({ item, weight })),
    });
  }
}
