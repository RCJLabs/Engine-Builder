/**
 * When the editor may offer, and check for, a new version. Pure rules, so they are tested
 * without a browser or a clock. The intervals and reasoning come from project-ascent
 * (src/engine/offline.ts), which measured them on installed apps.
 */
export interface UpdateGate {
  /** A new worker is installed and waiting. */
  ready: boolean;
  /** Something a reload would throw away is in progress (Play-in-Editor, an unsaved edit). */
  busy: boolean;
  /** "Later" was chosen, and the deferral has not run out. */
  deferred: boolean;
}

export const updateVisible = (gate: UpdateGate): boolean => gate.ready && !gate.busy && !gate.deferred;

/**
 * How often to ask the server for a new worker while the editor is visible. An installed app
 * is resumed from the task switcher rather than navigated, so the browser's own check rarely
 * runs; six hours keeps it to one small conditional request.
 */
export const UPDATE_CHECK_MS = 6 * 60 * 60 * 1000;

/** A "later" lasts a day; re-asking sooner is nagging, never asking again is silence. */
export const DEFER_MS = 24 * 60 * 60 * 1000;

export function shouldCheckForUpdate(input: { visible: boolean; lastCheckedAt: number | null; now: number }): boolean {
  if (!input.visible) return false;
  return input.lastCheckedAt === null || input.now - input.lastCheckedAt >= UPDATE_CHECK_MS;
}

export const deferralActive = (deferredAt: number | null, now: number): boolean =>
  deferredAt !== null && now - deferredAt < DEFER_MS;

export const DEFERRED_NOTE = 'It installs once you close the editor and open it again.';
