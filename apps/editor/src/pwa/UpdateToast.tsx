import { deferredAt, deferUpdate, reloadIntoUpdate, updateReady } from './register.ts';
import { DEFERRED_NOTE, deferralActive, updateVisible } from './updateGate.ts';

export function UpdateToast() {
  const visible = updateVisible({
    ready: updateReady.value,
    busy: false, // nothing in Phase 0 can be lost by a reload
    deferred: deferralActive(deferredAt.value, Date.now()),
  });
  if (!visible) return null;
  return (
    <div class="toast" role="status">
      <p>
        <strong>A new version of the editor is ready.</strong>
        <span class="muted"> {DEFERRED_NOTE}</span>
      </p>
      <div class="toast-actions">
        <button type="button" class="button" onClick={deferUpdate}>
          Later
        </button>
        <button type="button" class="button primary" onClick={reloadIntoUpdate}>
          Reload
        </button>
      </div>
    </div>
  );
}
