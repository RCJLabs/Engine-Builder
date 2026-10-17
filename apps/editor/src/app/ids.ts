import { useState } from 'preact/hooks';

let next = 0;

/**
 * An id no other element on the page has, for labels, descriptions and lists to point at. Preact's
 * useId counts within one render root, and the desktop dock renders each panel as a root of its
 * own, so two panels' ids clashed: a form's "Name" label pointed at the Records panel's search box
 * (seen in M2.5's e2e tests).
 */
export function useUniqueId(): string {
  const [id] = useState(() => `eb-${++next}`);
  return id;
}
