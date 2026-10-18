import { pointerSegment } from '@eb/core';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { type DefPath, isKeysPath, nodeAt, valuesAt } from './defPaths.ts';
import { useDesign } from './designContext.ts';
import { addChoiceChange, moveChoiceChange, removeChoiceChange, renameChoiceChange } from './fieldEdits.ts';
import { holdersOf } from './kinds.ts';
import { RenameForm } from './RenameForm.tsx';
import { Problems } from './TypeDesigner.tsx';

const pointer = (path: DefPath) => path.map((key) => `/${pointerSegment(key)}`).join('');

/** How many of the type's records hold `choice` at `at`: a field's value, a list's items, or a map's keys. */
function holding(records: readonly { value: unknown }[], json: unknown, at: DefPath, choice: string): number {
  const keys = isKeysPath(at);
  return records.filter(({ value }) =>
    keys
      ? valuesAt(json, at.slice(0, -1), value).some(
          (map) => typeof map === 'object' && map !== null && Object.hasOwn(map, choice),
        )
      : valuesAt(json, at, value).includes(choice),
  ).length;
}

/**
 * A choice field's choices, in the order forms offer them. Renaming one renames it in every record
 * that holds it (D33); removing one leaves the records that hold it, which then don't fit.
 */
export function ChoiceList({ at, label }: { at: DefPath; label: string }) {
  const design = useDesign();
  const legend = useUniqueId();
  const values = nodeAt(design.json, [...at, 'values']);
  const list = Array.isArray(values) ? values : [];
  const [renaming, setRenaming] = useState<number | null>(null);
  const where = pointer([...at, 'values']);
  return (
    <fieldset class="choice-list" aria-labelledby={legend}>
      <legend id={legend} class="form-legend">
        Choices
      </legend>
      <Problems problems={design.problemsAt(where)} />
      {list.length === 0 ? <p class="muted">No choices yet: add one below.</p> : null}
      <ol class="choice-rows">
        {list.map((choice, i) => {
          const words = typeof choice === 'string' ? choice : JSON.stringify(choice);
          return (
            <li key={`${i}:${words}`}>
              <div class="choice-row">
                <span class="mono">{words}</span>
                {design.canEdit ? (
                  <span class="choice-tools">
                    {typeof choice === 'string' ? (
                      <button
                        type="button"
                        class="button"
                        aria-label={`Rename the choice ${words}`}
                        onClick={() => setRenaming(i)}
                      >
                        Rename
                      </button>
                    ) : null}
                    <button
                      type="button"
                      class="button icon-button"
                      aria-label={`Move ${words} up`}
                      disabled={i === 0}
                      onClick={() => void design.change(`Move the choice ${words} up`, moveChoiceChange(at, i, -1))}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      class="button icon-button"
                      aria-label={`Move ${words} down`}
                      disabled={i === list.length - 1}
                      onClick={() => void design.change(`Move the choice ${words} down`, moveChoiceChange(at, i, 1))}
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      class="button"
                      aria-label={`Remove the choice ${words}`}
                      onClick={() =>
                        void design.change(`Remove the choice ${words} from ${label}`, removeChoiceChange(at, i))
                      }
                    >
                      Remove
                    </button>
                  </span>
                ) : null}
              </div>
              <Problems problems={design.problemsAt(`${where}/${i}`)} />
              {renaming === i && typeof choice === 'string' ? (
                <RenameForm
                  label={`New name for the choice ${choice}`}
                  initial={choice}
                  check={(name) =>
                    name === ''
                      ? 'A choice can’t be empty'
                      : list.includes(name)
                        ? `“${name}” is a choice already`
                        : null
                  }
                  said={() => {
                    const count = holding(design.records, design.json, at, choice);
                    return count === 0 ? 'No record holds it yet.' : `Renamed in ${holdersOf(count)} too.`;
                  }}
                  done={(name) => {
                    setRenaming(null);
                    void design.change(`Rename the choice ${choice} to ${name}`, renameChoiceChange(at, i, name));
                  }}
                  cancel={() => setRenaming(null)}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {design.canEdit ? <AddChoice at={at} list={list} label={label} /> : null}
    </fieldset>
  );
}

function AddChoice({ at, list, label }: { at: DefPath; list: readonly unknown[]; label: string }) {
  const design = useDesign();
  const id = useUniqueId();
  const [typed, setTyped] = useState('');
  const choice = typed.trim();
  const problem = choice === '' ? null : list.includes(choice) ? `“${choice}” is a choice already` : null;
  return (
    <form
      class="add-choice"
      onSubmit={(event) => {
        event.preventDefault();
        if (choice === '' || problem) return;
        void design.change(`Add the choice ${choice} to ${label}`, addChoiceChange(at, choice)).then((made) => {
          if (made) setTyped('');
        });
      }}
    >
      <label for={id}>New choice</label>
      <div class="form-pick-row">
        <input
          id={id}
          class="field"
          value={typed}
          autoComplete="off"
          aria-invalid={problem ? 'true' : undefined}
          aria-describedby={problem ? `${id}-problem` : undefined}
          onInput={(event) => setTyped(event.currentTarget.value)}
        />
        <button type="submit" class="button" disabled={choice === '' || problem !== null}>
          Add choice
        </button>
      </div>
      {problem ? (
        <p id={`${id}-problem`} class="field-problem">
          {problem}
        </p>
      ) : null}
    </form>
  );
}
