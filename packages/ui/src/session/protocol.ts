/**
 * What a page and the worker its game plays in say to each other (docs/specs/screens.md#session,
 * docs/specs/shell.md#saving). The page opens a pack once, then starts or loads games of it and
 * sends actions; the worker answers with views and saves, plain JSON, so nothing a game's script
 * did can run on the page. Saves are made here and kept by the page: the worker has no storage.
 */
import type { Action, Beat, LoadReport, SaveFile, SaveProblem } from '@eb/core';
import type { Said } from '../format/feedback.ts';
import type { Screen } from '../format/screen.ts';
import type { ShellFile } from '../format/shell.ts';
import type { Theme } from '../format/theme.ts';
import type { Saving } from './saving.ts';
import type { View, Wants } from './types.ts';

export type PlayRequest =
  /** A pack, parsed JSON as a file holds it: read and its game loaded, nothing played yet. */
  | { readonly id: number; readonly kind: 'open'; readonly pack: unknown }
  /** A new game of the open pack. `at` is the page's clock, for the save. */
  | { readonly id: number; readonly kind: 'start'; readonly seed: string; readonly saving: Saving; readonly at: number }
  /** A game of the open pack from a save's text, as the slot holds it. */
  | { readonly id: number; readonly kind: 'load'; readonly raw: string; readonly saving: Saving; readonly at: number }
  /** One of the actions the last view offered. */
  | { readonly id: number; readonly kind: 'act'; readonly action: Action; readonly at: number }
  /** The game in play seen with other wants, no step taken: a screen being designed (M4.5, D55). */
  | { readonly id: number; readonly kind: 'look'; readonly wants: Wants };

export type PlayReply =
  | {
      readonly id: number;
      readonly kind: 'opened';
      readonly name: string;
      /** The project's id, which its saves are kept under. */
      readonly game: string;
      /** The pack's hash: a save from another build loads under this one's rules. */
      readonly build: string;
      readonly screens: Readonly<Record<string, Screen>>;
      readonly theme: Theme | undefined;
      readonly shell: ShellFile | undefined;
    }
  | { readonly id: number; readonly kind: 'started'; readonly view: View; readonly save: SaveFile }
  | {
      readonly id: number;
      readonly kind: 'loaded';
      readonly ok: true;
      readonly view: View;
      /** The save as it was read. */
      readonly file: SaveFile;
      readonly report: LoadReport;
    }
  | {
      readonly id: number;
      readonly kind: 'loaded';
      readonly ok: false;
      readonly problem: SaveProblem | 'crashed';
      readonly message: string;
    }
  | {
      readonly id: number;
      readonly kind: 'stepped';
      readonly view: View;
      readonly beats: readonly Beat[];
      /** What the game's feedback says of the beats, in their order (M4.2). */
      readonly said: readonly Said[];
      readonly accepted: boolean;
      /** The save after the step, when it was taken (M4.3). */
      readonly save?: SaveFile;
    }
  | { readonly id: number; readonly kind: 'looked'; readonly view: View }
  | { readonly id: number; readonly kind: 'failed'; readonly message: string };
