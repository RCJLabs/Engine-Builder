/**
 * What the Play panel and its worker say to each other (M4.1): the session's own requests
 * (@eb/ui/session), plus two that start from the project's files: compiled as Run compiles them,
 * then opened for the play shell to start or load a game of (M4.3), or packed for Export game. Answers are plain data, as the script worker's are.
 */
import type { Diagnostic } from '@eb/schema';
import type { PlayReply, PlayRequest } from '@eb/ui/session';
import type { SentFile } from '../scripts/protocol.ts';

export type PlayPageRequest =
  | PlayRequest
  /** The open project's files: compiled with its game, then the pack opened. */
  | { readonly id: number; readonly kind: 'open-files'; readonly files: readonly SentFile[] }
  /** The open project's files, compiled into the pack Export game writes. */
  | { readonly id: number; readonly kind: 'pack'; readonly files: readonly SentFile[] };

export type PlayPageReply =
  | PlayReply
  /** The project has errors, as eb validate would say, so there is no pack to play or export. */
  | { readonly id: number; readonly kind: 'refused'; readonly errors: readonly Diagnostic[] }
  | { readonly id: number; readonly kind: 'packed'; readonly pack: unknown; readonly name: string };
