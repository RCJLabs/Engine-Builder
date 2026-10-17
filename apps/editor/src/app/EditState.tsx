import { editing } from '../editing/current.ts';

/**
 * Whether the open project saved, and whether this tab may edit it: the save line, and when
 * another tab edits it or a folder isn't yet writable, why and what to do.
 */
export function EditState() {
  return (
    <>
      <AccessLine />
      <SaveLine />
    </>
  );
}

function SaveLine() {
  const state = editing.session.value?.saveState.value;
  if (!state) return null;
  if (state.kind === 'failed') {
    return (
      <div class="save-line trouble" role="alert">
        <p>Not saved: {state.reason}</p>
        <button type="button" class="button" onClick={() => void editing.flush()}>
          Try again
        </button>
      </div>
    );
  }
  // Not announced: while typing it changes every second. A failure is.
  const said = { saved: 'All changes saved.', unsaved: 'Not saved yet.', saving: 'Saving…' }[state.kind];
  return <p class="save-line muted">{said}</p>;
}

function AccessLine() {
  const access = editing.access.value;
  if (access.kind === 'elsewhere') {
    return (
      <div class="access-line" role="status">
        <p>{access.note ?? 'This project is open for editing in another tab. You can look here, but not edit.'}</p>
        <button type="button" class="button" onClick={() => void editing.editHere()}>
          Edit here
        </button>
      </div>
    );
  }
  if (access.kind === 'asking') {
    return (
      <div class="access-line" role="status">
        <p>
          {access.slow
            ? 'The other tab hasn’t answered; it may be asleep in the background. Taking over loses any edits it hasn’t saved.'
            : 'Asking the other tab to save and hand over…'}
        </p>
        {access.slow ? (
          <button type="button" class="button" onClick={() => void editing.takeOver()}>
            Take over
          </button>
        ) : null}
      </div>
    );
  }
  if (access.kind === 'ask-to-write') {
    return (
      <div class="access-line" role="status">
        <p>This folder is open read only. To save edits into it, the browser must let the editor change it.</p>
        <button type="button" class="button" onClick={() => void editing.allowWriting()}>
          Allow changes
        </button>
      </div>
    );
  }
  return null;
}
