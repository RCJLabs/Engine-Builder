import { pointerSegment } from '@eb/core';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { WrongShape } from '../forms/FieldShell.tsx';
import { AddField } from './AddField.tsx';
import { type DefPath, isObject, nodeAt } from './defPaths.ts';
import { useDesign } from './designContext.ts';
import { FieldEditor } from './FieldEditor.tsx';
import { moveFieldChange, setChange } from './fieldEdits.ts';
import { fieldLabel, summary } from './kinds.ts';
import { Problems } from './TypeDesigner.tsx';

const pointer = (path: DefPath) => path.map((key) => `/${pointerSegment(key)}`).join('');

/**
 * The fields of the type, or of a group in it (`group` is the group's def path): each a row that
 * opens to edit it, in the order forms show them, with a way to move each and to add one. The
 * type's own fields have a heading; a group's sit in a fieldset named by the group.
 */
export function FieldList({ group, label }: { group: DefPath; label?: string }) {
  const design = useDesign();
  const headingId = useUniqueId();
  const fields = nodeAt(design.json, [...group, 'fields']);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (name: string) => {
    const next = new Set(open);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setOpen(next);
  };
  const body = !isObject(fields) ? (
    <WrongShape
      value={fields}
      what="list of fields"
      canEdit={design.canEdit}
      replace={() => void design.change('Replace the fields', setChange([...group, 'fields'], {}))}
    />
  ) : (
    <>
      <Problems problems={design.problemsAt(pointer([...group, 'fields']))} />
      {Object.keys(fields).length === 0 ? (
        <p class="muted">No fields yet.</p>
      ) : (
        <ol class="field-rows">
          {Object.entries(fields).map(([name, def], i, all) => (
            <FieldRow
              key={name}
              group={group}
              name={name}
              def={def}
              first={i === 0}
              last={i === all.length - 1}
              open={open.has(name)}
              toggle={() => toggle(name)}
              renamed={(to) => setOpen(new Set([...open].map((n) => (n === name ? to : n))))}
            />
          ))}
        </ol>
      )}
      <AddField group={group} added={(name) => setOpen(new Set([...open, name]))} />
    </>
  );
  if (group.length > 0) {
    return (
      <fieldset class="type-fields">
        <legend class="form-legend">{label ? `Fields of ${label}` : 'Fields'}</legend>
        {body}
      </fieldset>
    );
  }
  return (
    <section class="type-fields" aria-labelledby={headingId}>
      <h4 id={headingId}>Fields</h4>
      {body}
    </section>
  );
}

function FieldRow(props: {
  group: DefPath;
  name: string;
  def: unknown;
  first: boolean;
  last: boolean;
  open: boolean;
  toggle: () => void;
  renamed: (to: string) => void;
}) {
  const { group, name, def, first, last, open, toggle, renamed } = props;
  const design = useDesign();
  const id = useUniqueId();
  const label = fieldLabel(name, def);
  const path = [...group, 'fields', name];
  const at = pointer(path);
  // A shut row says whether anything inside it has problems, so they are never out of sight.
  const troubled = design.troubled.some((p) => p === at || p.startsWith(`${at}/`));
  const move = (by: -1 | 1) =>
    void design.change(`Move ${label} ${by < 0 ? 'up' : 'down'}`, moveFieldChange(group, name, by));
  return (
    <li class="type-field">
      <div class="type-field-head">
        <button type="button" class="field-toggle" aria-expanded={open} aria-controls={id} onClick={toggle}>
          <span class="type-field-name">{label}</span>
          <span class="muted"> {summary(def, design.titleOf)}</span>
        </button>
        {design.canEdit ? (
          <span class="type-field-tools">
            <button
              type="button"
              class="button icon-button"
              aria-label={`Move ${label} up`}
              disabled={first}
              onClick={() => move(-1)}
            >
              ▲
            </button>
            <button
              type="button"
              class="button icon-button"
              aria-label={`Move ${label} down`}
              disabled={last}
              onClick={() => move(1)}
            >
              ▼
            </button>
          </span>
        ) : null}
      </div>
      {troubled && !open ? <p class="field-problem">This field has problems: open it to see them.</p> : null}
      <div id={id} hidden={!open}>
        {open ? <FieldEditor group={group} name={name} def={def} renamed={renamed} /> : null}
      </div>
    </li>
  );
}
