/**
 * Saves cut short by a crash, finished before the library is listed (journal.ts). A save torn in
 * the middle of project.json would otherwise list the project as broken, with only Delete to
 * offer, though opening it would put it right. A project another tab is editing is left to that
 * tab, whose own save it is.
 */
import { isHiddenName } from '@eb/compiler';
import { note } from '../app/state.ts';
import { JOURNAL } from '../editing/journal.ts';
import { browserLocks, projectLockName, takeLock } from '../editing/projectLock.ts';
import { type DirectoryLike, isNotFound } from './files.ts';
import { PROJECTS_DIR } from './library.ts';
import type { OpfsWorker } from './opfsClient.ts';

async function hasJournal(project: DirectoryLike): Promise<boolean> {
  try {
    await project.getFileHandle(JOURNAL);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

export async function recoverAll(root: DirectoryLike, worker: OpfsWorker): Promise<void> {
  const locks = browserLocks();
  for await (const [folder, entry] of root.entries()) {
    if (entry.kind !== 'directory' || isHiddenName(folder)) continue;
    if (!(await hasJournal(await root.getDirectoryHandle(folder)))) continue;
    const held = locks ? await takeLock(locks, projectLockName(folder), { ifAvailable: true }) : null;
    if (locks && !held) continue;
    try {
      if ((await worker.recover([PROJECTS_DIR, folder])) > 0) note(`Finished a save of ${folder} that was cut short.`);
    } finally {
      held?.release();
    }
  }
}
