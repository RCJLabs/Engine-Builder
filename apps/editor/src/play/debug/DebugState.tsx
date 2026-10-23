/**
 * The state in play, slice by slice (M4.9): each module's, and the kernel's, with its facet hash
 * and size (M1.2), opened to its JSON. Two hashes that match are two slices that do.
 */
import type { SliceShown } from './protocol.ts';

export function DebugState({ slices }: { slices: readonly SliceShown[] }) {
  return (
    <ul class="debug-body debug-slices">
      {slices.map((slice) => (
        <li key={slice.key}>
          <details class="debug-slice">
            <summary>
              <span class="debug-slice-key">{slice.key}</span>
              <span class="debug-hash">{`${slice.hash} · ${slice.size} bytes`}</span>
            </summary>
            <pre class="debug-json">{slice.json}</pre>
          </details>
        </li>
      ))}
    </ul>
  );
}
