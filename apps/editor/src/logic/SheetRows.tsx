/**
 * A sheet's rows in its form (M3.1, D36), each When, If, Do and Once, in the order they run. Rows
 * can be added, moved and taken out; each is a group that says where it is (`data-at`), so the
 * Problems panel and the Logic panel's cards open the form at a row or a field inside it.
 */
import { WrongShape } from '../forms/FieldShell.tsx';
import { FieldView } from '../forms/FieldView.tsx';
import { pointerOf, useForm } from '../forms/formContext.ts';
import { EffectsField } from './EffectsField.tsx';
import { moved, newRow, without } from './sheetEdits.ts';
import { WhenField } from './WhenField.tsx';
import '../styles/sheets.css';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ID_HELP = {
  description: 'How the save remembers a once row has run: renaming it lets the row run again in older saves.',
};

export function SheetRows({ value }: { value: unknown }) {
  const form = useForm();
  const path = ['rows'];
  if (value !== undefined && !Array.isArray(value)) {
    return (
      <WrongShape value={value} what="list of rows" canEdit={form.canEdit} replace={() => form.set(path, [], 'Rows')} />
    );
  }
  const rows = value ?? [];
  const change = (said: string, next: (list: unknown[]) => unknown[]) =>
    form.update(path, (now) => next(Array.isArray(now) ? now : []), said);
  return (
    <div class="logic-rows-form" data-at={pointerOf(path)}>
      <h4 class="form-legend">Rows, in the order they run</h4>
      {rows.length === 0 ? <p class="muted">No rows yet: each says what happens when an event is raised.</p> : null}
      {rows.map((row, i) => {
        const at = [...path, i];
        const id = isObject(row) && typeof row.id === 'string' ? row.id : '';
        const field = (name: string) => (isObject(row) ? row[name] : undefined);
        return (
          // Keyed by place: two rows can share an id until E024 is fixed.
          <fieldset key={i} class="form-group logic-row-form" data-at={pointerOf(at)}>
            <legend class="form-legend">{`Row ${i + 1}${id ? `: ${id}` : ''}`}</legend>
            <WhenField path={[...at, 'when']} value={field('when')} />
            <FieldView
              label="If"
              def={{ kind: 'condition' }}
              info={{ optional: true }}
              path={[...at, 'if']}
              value={field('if')}
            />
            <EffectsField label="Do" path={[...at, 'do']} value={field('do')} />
            <FieldView
              label="Once"
              def={{ kind: 'bool' }}
              info={{ optional: true, description: 'Runs the first time only' }}
              path={[...at, 'once']}
              value={field('once')}
            />
            <FieldView
              label="Note"
              def={{ kind: 'text', multiline: true }}
              info={{ optional: true }}
              path={[...at, 'note']}
              value={field('note')}
            />
            <FieldView label="Row id" def={{ kind: 'text' }} info={ID_HELP} path={[...at, 'id']} value={field('id')} />
            {form.canEdit ? (
              <div class="form-actions">
                <button
                  type="button"
                  class="button"
                  disabled={i === 0}
                  onClick={() => change(`Move row ${i + 1} up`, (l) => moved(l, i, i - 1))}
                >
                  Move row {i + 1} up
                </button>
                <button
                  type="button"
                  class="button"
                  disabled={i === rows.length - 1}
                  onClick={() => change(`Move row ${i + 1} down`, (l) => moved(l, i, i + 1))}
                >
                  Move row {i + 1} down
                </button>
                <button
                  type="button"
                  class="button danger"
                  onClick={() => change(`Remove row ${i + 1}`, (l) => without(l, i))}
                >
                  Remove row {i + 1}
                </button>
              </div>
            ) : null}
          </fieldset>
        );
      })}
      {form.canEdit ? (
        <div class="form-actions">
          <button type="button" class="button" onClick={() => change('Add a row', (l) => [...l, newRow(l)])}>
            Add a row
          </button>
        </div>
      ) : null}
    </div>
  );
}
