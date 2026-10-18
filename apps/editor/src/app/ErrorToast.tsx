import { useEffect } from 'preact/hooks';
import { showPanel } from './panelControl.ts';
import { expireError, lastError } from './state.ts';

/**
 * The last error the editor logged, over every layout (M2.8): on a phone the console is a tab
 * away, and a step refused there said nothing before. It goes by itself; the console keeps it.
 */
export function ErrorToast() {
  const line = lastError.value;
  useEffect(() => (line ? expireError(line) : undefined), [line]);
  if (!line) return null;
  return (
    <div class="toast error-toast" role="alert">
      <p>
        <strong>Error: </strong>
        {line.text}
      </p>
      <div class="toast-actions">
        <button
          type="button"
          class="button"
          onClick={() => {
            lastError.value = null;
            showPanel('console');
          }}
        >
          Console
        </button>
        <button
          type="button"
          class="button"
          onClick={() => {
            lastError.value = null;
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
