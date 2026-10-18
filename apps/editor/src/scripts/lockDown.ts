/**
 * What the script worker takes away before it first runs a project's scripts (D38): the network,
 * storage and further workers, which sim code never needs. A script that breaks the purity rules
 * on purpose still finds no fetch or IndexedDB on the global. Best effort, on top of the trust
 * question, not a sandbox: the worker shares the editor's origin, and what it hasn't thought to
 * take away stays.
 */

/** The host's ways out, as the worker's global names them. */
export const HOST_NAMES: readonly string[] = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'WebSocketStream',
  'WebTransport',
  'EventSource',
  'RTCPeerConnection',
  'importScripts',
  'indexedDB',
  'caches',
  'cookieStore',
  'navigator',
  'BroadcastChannel',
  'Worker',
  'SharedWorker',
  'Notification',
];

/** Takes each name off `scope`, and returns those it couldn't. */
export function lockDown(scope: object, names: readonly string[] = HOST_NAMES): string[] {
  const global = scope as Record<string, unknown>;
  const kept: string[] = [];
  for (const name of names) {
    if (!(name in scope)) continue;
    attempt(() => delete global[name]);
    // An accessor on a prototype outlives delete on the object: shadow it with nothing.
    if (global[name] !== undefined) attempt(() => Object.defineProperty(scope, name, { value: undefined }));
    if (global[name] !== undefined) attempt(() => (global[name] = undefined));
    if (global[name] !== undefined) kept.push(name);
  }
  return kept;
}

// Strict code throws where a property won't go; the check after each says whether it went.
function attempt(take: () => unknown): void {
  try {
    take();
  } catch {
    // Not configurable, or not writable.
  }
}
