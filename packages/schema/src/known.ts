/**
 * What validation checks content against (D36): a game's facts, events and effects when `--types`
 * gives them, each then all there is; otherwise the engine's own, with any other name taken as
 * written, since a data-only project's game isn't known.
 */
import { type EventCatalog, engineModules, eventCatalog, type FactCatalog, factCatalog } from '@eb/core';
import type { z } from 'zod';
import { type EffectCatalog, ENGINE_EFFECTS, effectCatalog } from './effect.ts';

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
}

export interface Known {
  readonly facts: FactCatalog;
  /** No game's facts were given: one the engine doesn't have is taken as written. */
  readonly openFacts: boolean;
  readonly events: EventCatalog;
  readonly openEvents: boolean;
  readonly effects: EffectCatalog;
}

export const knownFrom = (options: KnownOptions): Known => ({
  facts: options.facts ?? ENGINE_FACTS,
  openFacts: options.facts === undefined,
  events: options.events ?? ENGINE_EVENTS,
  openEvents: options.events === undefined,
  effects: options.effects
    ? effectCatalog(options.effects, true)
    : options.effectNames
      ? namedEffects(options.effectNames)
      : ENGINE_EFFECTS,
});

/** A game's effects by name: the engine's schemas for its own among them, the rest kept as written. */
function namedEffects(names: readonly string[]): EffectCatalog {
  const schemas = new Map([...ENGINE_EFFECTS.schemas].filter(([name]) => names.includes(name)));
  return Object.freeze({ schemas, closed: true, names: new Set(names.filter((name) => !schemas.has(name))) });
}
