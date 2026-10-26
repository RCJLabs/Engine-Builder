/**
 * Tags in the inspector (M6.7, D79): each a chip with a remove button, and a box that adds one, offering
 * the project's tags. What a space or an object is, for the quests that look for it.
 */
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { tagProblem, tidyTag } from './tags.ts';

interface TagsProps {
  /** What the tags are of, for the legend and the buttons' names: "the barrow", "Crate". */
  readonly of: string;
  readonly tags: readonly string[];
  /** The project's tags, offered as the box is typed in. */
  readonly known: readonly string[];
  readonly canEdit: boolean;
  readonly write: (tags: readonly string[]) => void;
}

export function TagsField({ of, tags, known, canEdit, write }: TagsProps) {
  const [typed, setTyped] = useState('');
  const boxId = useUniqueId();
  const listId = useUniqueId();
  const problemId = useUniqueId();
  const tag = tidyTag(typed);
  const problem = tagProblem(tag, tags);
  const add = () => {
    if (tag === '' || problem !== undefined) return;
    write([...tags, tag]);
    setTyped('');
  };
  return (
    <fieldset class="tags-field">
      <legend>Tags</legend>
      {tags.length === 0 ? <p class="muted">None: a quest can’t find {of} by what it is.</p> : null}
      <ul class="tag-list" aria-label={`Tags of ${of}`}>
        {tags.map((each) => (
          <li key={each} class="tag-chip">
            <span>{each}</span>
            {canEdit ? (
              <button
                type="button"
                class="button tag-remove"
                aria-label={`Remove the tag ${each}`}
                onClick={() => write(tags.filter((t) => t !== each))}
              >
                ×
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <div class="tag-add">
          <label for={boxId}>New tag</label>
          <input
            id={boxId}
            class="field"
            list={listId}
            value={typed}
            autocomplete="off"
            aria-invalid={problem !== undefined}
            aria-describedby={problem !== undefined ? problemId : undefined}
            onInput={(event) => setTyped(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              add();
            }}
          />
          <datalist id={listId}>
            {known
              .filter((each) => !tags.includes(each))
              .map((each) => (
                <option key={each} value={each} />
              ))}
          </datalist>
          <button type="button" class="button" disabled={tag === '' || problem !== undefined} onClick={add}>
            Add tag
          </button>
          {problem !== undefined ? (
            <p id={problemId} class="field-problem">
              {problem}
            </p>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
