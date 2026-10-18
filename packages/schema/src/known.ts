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
  effects: options.effects ? effectCatalog(options.effects, true) : ENGINE_EFFECTS,
});
