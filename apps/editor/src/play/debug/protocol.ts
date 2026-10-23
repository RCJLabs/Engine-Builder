/**
 * What the Play panel's debug tools and the Play worker say to each other (M4.9, D59,
 * docs/specs/play-in-editor.md#the-workers-requests). Every answer that moves the game carries
 * the new view and the save the shell keeps in its slot, and each carries the panel's look.
 */
import type { Effect, EffectPreview, Place, SaveFile } from '@eb/core';
import type { Shown, View } from '@eb/ui/session';
import type { OpenedGame } from '@eb/ui/shell';
import type { SentFile } from '../../scripts/protocol.ts';
import type { QuestWhy } from './quests.ts';

export type DebugRequest =
  | { readonly id: number; readonly kind: 'debug-look' }
  | { readonly id: number; readonly kind: 'debug-run'; readonly effects: readonly Effect[]; readonly at: number }
  | { readonly id: number; readonly kind: 'debug-preview'; readonly effects: readonly Effect[] }
  | { readonly id: number; readonly kind: 'debug-back'; readonly at: number }
  | { readonly id: number; readonly kind: 'debug-forward'; readonly at: number }
  /** A save of the game in play, under edition "states", for the page to keep by name. */
  | { readonly id: number; readonly kind: 'debug-keep'; readonly at: number }
  | { readonly id: number; readonly kind: 'debug-restore'; readonly raw: string; readonly at: number }
  /** The project's files now: compiled, and the recording replayed on them. */
  | { readonly id: number; readonly kind: 'debug-replay'; readonly files: readonly SentFile[]; readonly at: number };

/** One line of the log: a step recorded, or one refused where it was tried. */
export interface LogLine {
  /** The step's number from 1; a refusal's is the step it would have been. */
  readonly n: number;
  readonly label: string;
  readonly beats: readonly string[];
  readonly debug: boolean;
  /** Why the game refused it; such a step was never taken. */
  readonly refused?: string;
  /** Past the cursor: taken back, and taken again by Step forward. */
  readonly ahead: boolean;
}

export interface SliceShown {
  readonly key: string;
  readonly hash: string;
  readonly size: number;
  /** The slice as JSON, two spaces deep. */
  readonly json: string;
}

/** What the panel shows of the game in play. */
export interface DebugLook {
  readonly cursor: number;
  readonly recorded: number;
  readonly full: boolean;
  /** The last lines of the log, oldest first; `earlier` lines before them aren't sent. */
  readonly log: readonly LogLine[];
  readonly earlier: number;
  readonly slices: readonly SliceShown[];
  readonly quests: readonly QuestWhy[];
  /** The time kit's date facts, by id; none when the game has no time module. */
  readonly time: Readonly<Record<string, Shown>> | undefined;
  /** The debug steps in the state's history. */
  readonly debugSteps: number;
}

/** What Replay found, in the recording's numbers. */
export type ReplayReport =
  | { readonly kind: 'same'; readonly steps: number }
  | { readonly kind: 'refused'; readonly at: number; readonly label: string; readonly reason: string }
  | { readonly kind: 'differs'; readonly at: number; readonly label: string; readonly place: Place };

export type DebugReply =
  | { readonly id: number; readonly kind: 'debug-looked'; readonly look: DebugLook }
  | {
      readonly id: number;
      readonly kind: 'debug-moved';
      readonly look: DebugLook;
      readonly view: View;
      readonly save: SaveFile;
    }
  | { readonly id: number; readonly kind: 'debug-refused'; readonly look: DebugLook; readonly reason: string }
  | { readonly id: number; readonly kind: 'debug-previewed'; readonly previews: readonly EffectPreview[] }
  | { readonly id: number; readonly kind: 'debug-kept'; readonly save: SaveFile }
  | {
      readonly id: number;
      readonly kind: 'debug-replayed';
      readonly look: DebugLook;
      readonly view: View;
      readonly save: SaveFile;
      readonly report: ReplayReport;
      /** The edited project's game, whose screens the shell draws from now. */
      readonly opened: OpenedGame;
    };

/** The edition a named state is saved under, apart from the shell's slots (D59). */
export const STATES_EDITION = 'states';

export const isDebugRequest = (request: { readonly kind: string }): request is DebugRequest =>
  request.kind.startsWith('debug-');
