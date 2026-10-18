/**
 * The facts, events and effects the editor's forms offer (M3.2, D38): the game's once its scripts
 * have run, else the engine's own, as validation reads them (D36). A fact the engine declares
 * keeps its wording (describe), which the game's catalogue, plain data, leaves behind.
 */
import type { EventCatalog, FactCatalog } from '@eb/core';
import { ENGINE_EFFECTS, ENGINE_EVENTS, ENGINE_FACTS } from '@eb/schema';
import { current } from '../projects/opened.ts';
import type { ProjectNames } from './completions.ts';
import type { GameState } from './gameState.ts';

export function factsOf(game: GameState | undefined): FactCatalog {
  const facts = game?.catalog?.facts;
  if (!facts) return ENGINE_FACTS;
  return Object.fromEntries(Object.entries(facts).map(([id, fact]) => [id, ENGINE_FACTS[id] ?? fact]));
}

export const eventsOf = (game: GameState | undefined): EventCatalog => game?.catalog?.events ?? ENGINE_EVENTS;

/** The game's own effects, beyond the engine's, by name: what a row may do besides set a flag or roll. */
export const ownEffectsOf = (game: GameState | undefined): readonly string[] =>
  (game?.catalog?.effects ?? []).filter((name) => !ENGINE_EFFECTS.schemas.has(name));

/** The open project's game, for a field reading it as it renders. */
export const openGame = (): GameState | undefined => current.value?.game;

/** The names a script may write in a string (completions.ts): the game's, or the engine's until it has run. */
export function projectNames(): ProjectNames {
  const open = current.value;
  const game = open?.game.catalog;
  return {
    facts: Object.keys(game?.facts ?? ENGINE_FACTS),
    events: Object.keys(game?.events ?? ENGINE_EVENTS),
    effects: game?.effects ?? [...ENGINE_EFFECTS.schemas.keys()],
    records: open?.catalog.records ?? new Map(),
  };
}
