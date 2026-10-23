/**
 * What the page's audio is doing, kept on `window.__ebAudio` (M4.8, docs/specs/audio.md#the-player):
 * the context's state, the mix, the volumes and the last 50 sounds and buzzes. Chooser's e2e reads a
 * hook like it, and Wasteland Protocol keeps such a log; nothing in the engine reads it back.
 */

export interface Played {
  readonly kind: 'sound' | 'buzz';
  readonly id: string;
  /** The page's clock, in ms. */
  readonly at: number;
}

export interface AudioState {
  readonly context: 'none' | 'running' | 'suspended';
  readonly ambience?: string;
  readonly music?: string;
  readonly levels: Readonly<Record<string, number>>;
  /** Each bus's gain as set: master, music, ambience, effects and interface. */
  readonly buses: Readonly<Record<string, number>>;
  readonly played: readonly Played[];
}

export const PLAYED_KEPT = 50;

const EMPTY: AudioState = { context: 'none', levels: {}, buses: {}, played: [] };

type Hooked = { __ebAudio?: AudioState };

/** The state as it is now. */
export const audioState = (): AudioState => (globalThis as Hooked).__ebAudio ?? EMPTY;

/** Merges a change into the state the page shows. */
export function noteAudio(change: Partial<Omit<AudioState, 'played'>>): void {
  (globalThis as Hooked).__ebAudio = { ...audioState(), ...change };
}

/** Adds a sound or a buzz to the log, the oldest falling out past 50. */
export function notePlayed(kind: Played['kind'], id: string): void {
  const state = audioState();
  const at = typeof performance === 'undefined' ? 0 : performance.now();
  (globalThis as Hooked).__ebAudio = { ...state, played: [...state.played, { kind, id, at }].slice(-PLAYED_KEPT) };
}
