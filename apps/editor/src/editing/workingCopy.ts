/**
 * The open project as the editor sees it: its stored files with the edits not yet saved laid
 * over them. Everything that reads the open project reads this, so nothing sees a file older
 * than the last edit, and a save writes exactly what is unsaved.
 */
import { isHiddenName, type ProjectSource } from '@eb/compiler';
import type { FileChange, FileState } from './history.ts';

export interface WorkingCopy extends ProjectSource {
  /** Puts each change's before or after in place. */
  apply(changes: readonly FileChange[], side: 'before' | 'after'): void;
  /** The files changed since they were last saved, as they are now. */
  unsaved(): ReadonlyMap<string, FileState>;
  /** Marks what a save wrote as saved, except files that changed again while it ran. */
  saved(written: ReadonlyMap<string, FileState>): void;
}

export function workingCopy(stored: ProjectSource): WorkingCopy {
  const now = new Map<string, FileState>();
  const unsaved = new Map<string, FileState>();
  return {
    async files(dir) {
      const prefix = dir === '' ? '' : `${dir}/`;
      const found = new Set(await stored.files(dir));
      for (const [path, state] of now) {
        if (!path.startsWith(prefix) || path.split('/').some(isHiddenName)) continue;
        if (state === null) found.delete(path);
        else found.add(path);
      }
      return [...found];
    },
    async read(path) {
      if (!now.has(path)) return stored.read(path);
      return now.get(path) ?? undefined;
    },
    apply(changes, side) {
      for (const change of changes) {
        now.set(change.path, change[side]);
        unsaved.set(change.path, change[side]);
      }
    },
    unsaved: () => new Map(unsaved),
    saved(written) {
      // The same bytes object means no edit has touched the file since the save read it.
      for (const [path, state] of written) if (unsaved.get(path) === state) unsaved.delete(path);
    },
  };
}
