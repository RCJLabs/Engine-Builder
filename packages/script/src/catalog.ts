/**
 * What content is checked against once a project's game has run (D38): its facts, events and
 * effects, as plain data. The editor's script worker sends it across to the page, so nothing in it
 * may be a function: a fact's describe stays behind, and its default wording is used instead.
 */
import { type Domain, type EventCatalog, eventCatalog, factCatalog } from '@eb/core';
import type { ProjectGame } from './game.ts';

export interface CatalogFact {
  readonly args?: Readonly<Record<string, Domain>>;
  readonly domain?: Domain;
  readonly label?: string;
}

export interface GameCatalog {
  /** Module ids, in the game's order, the engine's among them. */
  readonly modules: readonly string[];
  readonly start: string;
  readonly facts: Readonly<Record<string, CatalogFact>>;
  readonly events: EventCatalog;
  /** Every effect the game's modules handle, sorted. Content may name no other. */
  readonly effects: readonly string[];
  /** Every action, as "module/verb", sorted. */
  readonly actions: readonly string[];
  /** Every mode, sorted: what screens show (M4.1). */
  readonly modes: readonly string[];
  /** The game's bots by name, in its order: Run plays the first, or picks at random without one. */
  readonly policies: readonly string[];
}

// UTF-16 order, the same in every locale.
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function gameCatalog(game: ProjectGame): GameCatalog {
  const facts: Record<string, CatalogFact> = {};
  for (const [id, info] of Object.entries(factCatalog(game.modules))) {
    facts[id] = {
      ...(info.args !== undefined ? { args: info.args } : {}),
      ...(info.domain !== undefined ? { domain: info.domain } : {}),
      ...(info.label !== undefined ? { label: info.label } : {}),
    };
  }
  const effects = game.modules.flatMap((m) => Object.keys(m.effects ?? {}));
  const actions = game.modules.flatMap((m) => Object.keys(m.actions ?? {}).map((verb) => `${m.id}/${verb}`));
  return {
    modules: game.modules.map((m) => m.id),
    start: game.start,
    facts,
    events: { ...eventCatalog(game.modules) },
    effects: [...new Set(effects)].sort(byText),
    actions: actions.sort(byText),
    modes: game.modules.flatMap((m) => Object.keys(m.modes ?? {})).sort(byText),
    policies: game.policies.map((p) => p.name),
  };
}
