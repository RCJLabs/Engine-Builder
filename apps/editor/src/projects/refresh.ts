/** Asks for the project to be read again: `paths` changed, or anything may have (null). */
export type Refresh = (paths: readonly string[] | null) => void;

/**
 * Runs `read` after changes, one read at a time. The paths of changes made during a read gather
 * for the next, so a burst of edits costs one more read, not one each; null (anything may have
 * changed) outweighs any paths. `read` gives false when what it reads for has gone, which stops it.
 */
export function coalesce(read: (paths: readonly string[] | null) => Promise<boolean>, fail: (error: unknown) => void) {
  let running = false;
  let again = false;
  let pending: Set<string> | null = new Set();
  const run = async () => {
    try {
      while (again) {
        again = false;
        const paths = pending && [...pending];
        pending = new Set();
        if (!(await read(paths))) return;
      }
    } catch (error) {
      // Whatever went unread is read on the next change, with everything else.
      pending = null;
      fail(error);
    } finally {
      // Here, not once the promise settles: a change in between would find it running, and be lost.
      running = false;
    }
  };
  const refresh: Refresh = (paths) => {
    if (paths === null) pending = null;
    else if (pending) for (const path of paths) pending.add(path);
    again = true;
    if (running) return;
    running = true;
    void run();
  };
  return refresh;
}
