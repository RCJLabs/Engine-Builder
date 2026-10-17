/** What the page asks the OPFS worker (opfs.worker.ts) and what it answers. */
import type { SavedFile } from '../editing/journal.ts';
import type { ProjectFile } from './files.ts';

/** `base` is the folder names from the OPFS root to where the paths start, such as ["projects", "salvage-run"]. */
export type WorkerRequest =
  /** Files written as they are: copies into the library, which their own marker guards (M2.1). */
  | {
      readonly id: number;
      readonly kind: 'write';
      readonly base: readonly string[];
      readonly files: readonly ProjectFile[];
    }
  /** An edit saved through the journal, all or nothing. */
  | {
      readonly id: number;
      readonly kind: 'save';
      readonly base: readonly string[];
      readonly files: readonly SavedFile[];
    }
  /** A save cut short, finished or dropped. */
  | { readonly id: number; readonly kind: 'recover'; readonly base: readonly string[] };

export type WorkerReply =
  | { readonly id: number; readonly ok: true; readonly recovered: number }
  | { readonly id: number; readonly ok: false; readonly error: string };
