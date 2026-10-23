/**
 * What the Play panel and its worker say to each other (M4.1): the session's own requests
 * (@eb/ui/session), plus two that start from the project's files: compiled as Run compiles them,
 * then opened for the play shell to start or load a game of (M4.3), or packed for Export game. The
 * debug tools' requests (M4.9) are debug/protocol.ts's. Answers are plain data, as the script worker's are.
 */
import type { LeaveOut } from '@eb/compiler';
import type { Diagnostic } from '@eb/schema';
import type { PlayReply, PlayRequest } from '@eb/ui/session';
import type { SentFile } from '../scripts/protocol.ts';
import type { DebugReply, DebugRequest } from './debug/protocol.ts';

export type PlayPageRequest =
  | PlayRequest
  | DebugRequest
  /** The open project's files: compiled with its game, then the pack opened. */
  | { readonly id: number; readonly kind: 'open-files'; readonly files: readonly SentFile[] }
  /**
   * The open project's files, compiled into the pack Export game writes; with `leaveOut`, an
   * edition's (M4.10), compiled from the files less what it leaves out.
   */
  | { readonly id: number; readonly kind: 'pack'; readonly files: readonly SentFile[]; readonly leaveOut?: LeaveOut };

export type PlayPageReply =
  | PlayReply
  | DebugReply
  /** The project has errors, as eb validate would say, so there is no pack to play or export. */
  | { readonly id: number; readonly kind: 'refused'; readonly errors: readonly Diagnostic[] }
  | { readonly id: number; readonly kind: 'packed'; readonly pack: unknown; readonly name: string };
