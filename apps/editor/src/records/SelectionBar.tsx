import type { Ref } from 'preact';

const records = (count: number) => (count === 1 ? '1 record' : `${count} records`);

/**
 * What can be done with the records selected in the table (M2.5): a field set on them all, a copy
 * of one, or all of them deleted, each one step undo takes back. Shown only while some are.
 */
export function SelectionBar(props: {
  ids: readonly string[];
  /** How many records not selected refer to those selected: deleting them leaves those references broken. */
  usedElsewhere: number;
  editField: () => void;
  duplicate: (() => void) | null;
  remove: () => void;
  clear: () => void;
  editButton: Ref<HTMLButtonElement>;
}) {
  const { ids, usedElsewhere, editField, duplicate, remove, clear, editButton } = props;
  const count = ids.length;
  return (
    <section class="selection-bar" aria-label="Selected records">
      <p class="selection-count">{count} selected</p>
      <div class="form-actions">
        <button ref={editButton} type="button" class="button" onClick={editField}>
          Edit a field
        </button>
        {duplicate ? (
          <button type="button" class="button" onClick={duplicate}>
            Duplicate
          </button>
        ) : null}
        <button type="button" class="button danger" onClick={remove}>
          {count === 1 ? `Delete ${ids[0]}` : `Delete ${count} records`}
        </button>
        <button type="button" class="button" onClick={clear}>
          Clear selection
        </button>
      </div>
      {usedElsewhere > 0 ? (
        <p class="form-help">
          {records(usedElsewhere)} not selected {usedElsewhere === 1 ? 'refers' : 'refer'} to{' '}
          {count === 1 ? 'it' : 'these'}: deleting leaves those references broken. Undo brings{' '}
          {count === 1 ? 'it' : 'them'} back.
        </p>
      ) : null}
    </section>
  );
}
