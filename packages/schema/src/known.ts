/**
 * What validation checks content against (D36): a game's facts, events and effects when `--types`
 * gives them, each then all there is; otherwise the engine's own, with any other name taken as
 * written, since a data-only project's game isn't known. The kits a project lists join either
 * (M3.3, D41).
 */
import {
  type CalendarDef,
  canonicalJson,
  type EventCatalog,
  engineModules,
  eventCatalog,
  type FactCatalog,
  factCatalog,
} from '@eb/core';
import { kitModules } from '@eb/kits';
import type { z } from 'zod';
import { type EffectCatalog, ENGINE_EFFECTS, effectCatalog } from './effect.ts';
import { kitEffectSchemas } from './kitEffects.ts';

export const ENGINE_FACTS: FactCatalog = factCatalog(engineModules);
export const ENGINE_EVENTS: EventCatalog = eventCatalog(engineModules);

export interface KnownOptions {
  readonly facts?: FactCatalog;
  readonly events?: EventCatalog;
  readonly effects?: readonly z.core.$ZodType[];
  /**
   * Every effect a project's game handles, by name, from its modules (M3.2, D38): content may name
   * no other. The engine's own among them are checked by their schemas; the game's are kept as
   * written, since a module says what it handles, not what its arguments are.
   */
  readonly effectNames?: readonly string[];
  /**
   * The kits on (M3.3, D41). Their facts, events and effects join whatever the rest are, the
   * engine's or a game's, since a kit's module joins every game of a project that lists it.
   */
  readonly kits?: readonly string[];
  /** project.json's calendar, for the time kit's facts, events and effects (M3.5, D43). */
  readonly calendar?: CalendarDef;
}

export interface Known {
  readonly facts: FactCatalog;
  /** No game's facts were given: one the engine doesn't have is taken as written. */
  readonly openFacts: boolean;
  readonly events: EventCatalog;
  readonly openEvents: boolean;
  readonly effects: EffectCatalog;
}

export function knownFrom(options: KnownOptions): Known {
  const on = options.kits ?? [];
  const kits = kitCatalogs(on, options.calendar);
  return {
    facts: on.length === 0 ? (options.facts ?? ENGINE_FACTS) : { ...(options.facts ?? ENGINE_FACTS), ...kits.facts },
    openFacts: options.facts === undefined,
    events:
      on.length === 0 ? (options.events ?? ENGINE_EVENTS) : { ...(options.events ?? ENGINE_EVENTS), ...kits.events },
    openEvents: options.events === undefined,
    effects: options.effects
      ? effectCatalog(withKitSchemas(options.effects, kits.effects), true)
      : options.effectNames
        ? namedEffects([...options.effectNames, ...kits.effects.map(effectName)], kits.effects)
        : on.length === 0
          ? ENGINE_EFFECTS
          : effectCatalog([...ENGINE_EFFECTS.schemas.values(), ...kits.effects], false),
  };
}

interface KitCatalogs {
  readonly facts: FactCatalog;
  readonly events: EventCatalog;
  readonly effects: readonly z.core.$ZodType[];
}

// Made once for each list of kits and calendar: a project's checks run after every edit in the editor.
const catalogs = new Map<string, KitCatalogs>();

function kitCatalogs(on: readonly string[], calendar: CalendarDef | undefined): KitCatalogs {
  const key = `${on.join(',')} ${calendar === undefined ? '' : canonicalJson(calendar)}`;
  let found = catalogs.get(key);
  if (!found) {
    const modules = kitModules(on, calendar);
    found = {
      facts: factCatalog(modules),
      events: eventCatalog(modules),
      effects: kitEffectSchemas(on, calendar),
    };
    catalogs.set(key, found);
  }
  return found;
}

const effectName = (schema: z.core.$ZodType): string =>
  effectCatalog([schema], false).schemas.keys().next().value as string;

/** A game's own schemas, with the kits' joined unless the game gives one of the same name. */
function withKitSchemas(own: readonly z.core.$ZodType[], kits: readonly z.core.$ZodType[]): z.core.$ZodType[] {
  const named = new Set(effectCatalog(own, true).schemas.keys());
  return [...own, ...kits.filter((schema) => !named.has(effectName(schema)))];
}

/** A game's effects by name: the engine's and the kits' schemas for theirs among them, the rest kept as written. */
function namedEffects(names: readonly string[], kits: readonly z.core.$ZodType[]): EffectCatalog {
  const known = [...ENGINE_EFFECTS.schemas, ...effectCatalog(kits, false).schemas];
  const schemas = new Map(known.filter(([name]) => names.includes(name)));
  return Object.freeze({ schemas, closed: true, names: new Set(names.filter((name) => !schemas.has(name))) });
}
