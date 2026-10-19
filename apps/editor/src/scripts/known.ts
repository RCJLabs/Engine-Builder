/**
 * The facts, events and effects the editor's forms offer (M3.2, D38): the game's once its scripts
 * have run, else the engine's own and the kits' the project lists (M3.3, D41), as validation reads
 * them (D36). A fact the engine or a kit declares keeps its wording (describe), which the game's
 * catalogue, plain data, leaves behind.
 */
import type { CalendarDef, EventCatalog, FactCatalog } from '@eb/core';
import { ENGINE_EFFECTS, ENGINE_EVENTS, ENGINE_FACTS, knownFrom } from '@eb/schema';
import { current } from '../projects/opened.ts';
import type { ProjectNames } from './completions.ts';
import type { GameState } from './gameState.ts';

/** The kits the open project lists. */
export const openKits = (): readonly string[] => current.value?.catalog.kits ?? [];

/** The open project's calendar, for the time kit's facts, events and effects (M3.5). */
export const openCalendar = (): CalendarDef | undefined => current.value?.catalog.calendar;

/** The engine's facts, events and effects with the kits', before any game has run. */
const withKits = (kits: readonly string[], calendar = openCalendar()) =>
  kits.length === 0 ? null : knownFrom({ kits, ...(calendar ? { calendar } : {}) });

export function factsOf(game: GameState | undefined, kits: readonly string[] = openKits()): FactCatalog {
  const own = withKits(kits)?.facts ?? ENGINE_FACTS;
  const facts = game?.catalog?.facts;
  if (!facts) return own;
  return Object.fromEntries(Object.entries(facts).map(([id, fact]) => [id, own[id] ?? fact]));
}

export const eventsOf = (game: GameState | undefined, kits: readonly string[] = openKits()): EventCatalog =>
  game?.catalog?.events ?? withKits(kits)?.events ?? ENGINE_EVENTS;

/**
 * The game's own effects, beyond the engine's and the kits' on, by name: what a row may do besides
 * those. A kit's effect without a form of its own, the time kit's schedule, is added as Other.
 */
export function ownEffectsOf(game: GameState | undefined, kits: readonly string[] = openKits()): readonly string[] {
  const known = withKits(kits)?.effects ?? ENGINE_EFFECTS;
  return (game?.catalog?.effects ?? []).filter((name) => !known.schemas.has(name));
}

/** The open project's game, for a field reading it as it renders. */
export const openGame = (): GameState | undefined => current.value?.game;

/** The names a script may write in a string (completions.ts): the game's, or the engine's and the kits' until it has run. */
export function projectNames(): ProjectNames {
  const open = current.value;
  const game = open?.game.catalog;
  const kits = withKits(open?.catalog.kits ?? [], open?.catalog.calendar);
  return {
    facts: Object.keys(game?.facts ?? kits?.facts ?? ENGINE_FACTS),
    events: Object.keys(game?.events ?? kits?.events ?? ENGINE_EVENTS),
    effects: game?.effects ?? [...(kits?.effects ?? ENGINE_EFFECTS).schemas.keys()],
    records: open?.catalog.records ?? new Map(),
  };
}
