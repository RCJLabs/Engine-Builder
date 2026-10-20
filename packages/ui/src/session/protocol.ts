/**
 * What a page and the worker its game plays in say to each other (docs/specs/screens.md#session).
 * The page sends a pack once and then actions; the worker answers with views, plain JSON, so
 * nothing a game's script did can run on the page.
 */
import type { Action, Beat } from '@eb/core';
import type { Said } from '../format/feedback.ts';
import type { Screen } from '../format/screen.ts';
import type { Theme } from '../format/theme.ts';
import type { View } from './types.ts';

export type PlayRequest =
  /** A new game from this pack, parsed JSON as a file holds it. */
  | { readonly id: number; readonly kind: 'start'; readonly pack: unknown; readonly seed: string }
  /** One of the actions the last view offered. */
  | { readonly id: number; readonly kind: 'act'; readonly action: Action };

export type PlayReply =
  | {
      readonly id: number;
      readonly kind: 'started';
      readonly name: string;
      readonly screens: Readonly<Record<string, Screen>>;
      readonly theme: Theme | undefined;
      readonly view: View;
    }
  | {
      readonly id: number;
      readonly kind: 'stepped';
      readonly view: View;
      readonly beats: readonly Beat[];
      /** What the game's feedback says of the beats, in their order (M4.2). */
      readonly said: readonly Said[];
      readonly accepted: boolean;
    }
  | { readonly id: number; readonly kind: 'failed'; readonly message: string };
