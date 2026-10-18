/**
 * The facts, events and effects the editor's forms offer (M3.2, D38): the game's once its scripts
 * have run, else the engine's own and the kits' the project lists (M3.3, D41), as validation reads
 * them (D36). A fact the engine or a kit declares keeps its wording (describe), which the game's
 * catalogue, plain data, leaves behind.
 */
import type { EventCatalog, FactCatalog } from '@eb/core';
import { ENGINE_EFFECTS, ENGINE_EVENTS, ENGINE_FACTS, KIT_EFFECT_FILES, knownFrom } from '@eb/schema';
import { current } from '../projects/opened.ts';
import type { ProjectNames } from './completions.ts';
import type { GameState } from './gameState.ts';

/** The kits the open project lists. */
export const openKits = (): readonly string[] => current.value?.catalog.kits ?? [];

/** The engine's facts, events and effects with the kits', before any game has run. */
const withKits = (kits: readonly string[]) => (kits.length === 0 ? null : knownFrom({ kits }));

export function factsOf(game: GameState | undefined, kits: readonly string[] = openKits()): FactCatalog {
  const own = withKits(kits)?.facts ?? ENGINE_FACTS;
  const facts = game?.catalog?.facts;
  if (!facts) return own;
  return Object.fromEntries(Object.entries(facts).map(([id, fact]) => [id, own[id] ?? fact]));
}

export const eventsOf = (game: GameState | undefined, kits: readonly string[] = openKits()): EventCatalog =>
  game?.catalog?.events ?? withKits(kits)?.events ?? ENGINE_EVENTS;

const KIT_EFFECTS = new Set(KIT_EFFECT_FILES.map((file) => file.effect));

/** The game's own effects, beyond the engine's and the kits', by name: what a row may do besides those. */
export const ownEffectsOf = (game: GameState | undefined): readonly string[] =>
  (game?.catalog?.effects ?? []).filter((name) => !ENGINE_EFFECTS.schemas.has(name) && !KIT_EFFECTS.has(name));

/** The open project's game, for a field reading it as it renders. */
export const openGame = (): GameState | undefined => current.value?.game;

/** The names a script may write in a string (completions.ts): the game's, or the engine's and the kits' until it has run. */
export function projectNames(): ProjectNames {
  const open = current.value;
  const game = open?.game.catalog;
  const kits = withKits(open?.catalog.kits ?? []);
  return {
    facts: Object.keys(game?.facts ?? kits?.facts ?? ENGINE_FACTS),
    events: Object.keys(game?.events ?? kits?.events ?? ENGINE_EVENTS),
    effects: game?.effects ?? [...(kits?.effects ?? ENGINE_EFFECTS).schemas.keys()],
    records: open?.catalog.records ?? new Map(),
  };
}
