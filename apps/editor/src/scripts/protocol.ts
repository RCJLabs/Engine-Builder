/**
 * What the page and the script worker say to each other (M3.2, D38). The page sends files, the
 * worker answers with plain data: nothing in an answer runs on the page, whatever a script did.
 */
import type { Diagnostic } from '@eb/schema';
import type { GameCatalog } from '@eb/script';

/** A project file, by its path in the project: what the worker reads its scripts and content from. */
export type SentFile = readonly [path: string, bytes: Uint8Array];

export type ScriptJob =
  /** The files under scripts/: checked, and game.ts run when `run` (the project is trusted). */
  | { readonly kind: 'check'; readonly files: readonly SentFile[]; readonly run: boolean }
  /** The whole project but its assets' bytes: compiled as eb sim compiles it, then played. */
  | { readonly kind: 'play'; readonly files: readonly SentFile[]; readonly seeds: number; readonly policy: string };

export type ScriptRequest = ScriptJob & { readonly id: number };

export interface CheckResult {
  /** Every script by id, sorted. */
  readonly ids: readonly string[];
  readonly hasGame: boolean;
  /** E028 to E032, W111 and W112, sorted as the compiler sorts. */
  readonly diagnostics: readonly Diagnostic[];
  /** Whether game.ts ran: asked to, there, and every script it reaches sound. */
  readonly ran: boolean;
  /** What the game declares, when it ran and loaded. */
  readonly game: GameCatalog | null;
  /** Every stage file by its path under stages/ without `.ts`, sorted (M7.4); their problems are among the diagnostics. */
  readonly stages: readonly string[];
}

export type PlayResult =
  /** eb sim's report, line by line; `ok` when the game refused none of its own offers. */
  | { readonly kind: 'played'; readonly lines: readonly string[]; readonly ok: boolean }
  /** The project has errors, as eb sim would say, so nothing was played. */
  | { readonly kind: 'refused'; readonly errors: readonly Diagnostic[] };

export type ScriptReply =
  | { readonly id: number; readonly ok: true; readonly check: CheckResult }
  | { readonly id: number; readonly ok: true; readonly play: PlayResult }
  | { readonly id: number; readonly ok: false; readonly error: string };
