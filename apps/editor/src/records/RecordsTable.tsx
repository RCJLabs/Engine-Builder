import { COLOUR_PATTERN } from '@eb/schema';
import type { Ref } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { Column, Row } from './table.ts';
import { fieldValue } from './table.ts';
import type { Sort } from './view.ts';

/** How much of the table's rows are picked, for the select-all box: none, some or all. */
export type Picked = 'none' | 'some' | 'all';

/**
 * A type's records as a table (M2.5), in a region that scrolls sideways on its own, so the page
 * never does (Adrian Roselli's "Under-Engineered Responsive Tables"): named by the caption,
 * focusable so a keyboard can scroll it. Each column sorts from a button in its header, with
 * aria-sort on the sorted one only (WAI-ARIA APG, sortable table). A row's header is the record,
 * a button that opens it in the inspector.
 */
export function RecordsTable(props: {
  caption: string;
  columns: readonly Column[];
  rows: readonly Row[];
  sort: Sort;
  sortBy: (column: Column) => void;
  open: (id: string) => void;
  /** The record the inspector shows, as "type:id". */
  current: string | null;
  /** Selection, when this tab may edit. */
  pick: {
    picked: ReadonlySet<string>;
    all: Picked;
    count: number;
    toggle: (id: string) => void;
    toggleAll: () => void;
  } | null;
  region: Ref<HTMLElement>;
  captionId: string;
}) {
  const { caption, columns, rows, sort, sortBy, open, current, pick, region, captionId } = props;
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: it scrolls sideways, so keyboard users must reach it (axe scrollable-region-focusable)
    <section ref={region} class="table-scroll" aria-labelledby={captionId} tabIndex={0} data-scroll-x>
      <table class="records-table">
        <caption id={captionId}>{caption}</caption>
        <thead>
          <tr>
            {pick ? (
              <th scope="col" class="pick-cell">
                <span class="visually-hidden">Select</span>
                <SelectAll all={pick.all} count={pick.count} toggle={pick.toggleAll} />
              </th>
            ) : null}
            {columns.map((column) => (
              <SortHeader key={column.key} column={column} sort={sort} sortBy={sortBy} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <RecordRow
              key={row.record.key}
              row={row}
              columns={columns}
              open={open}
              current={current === row.record.key}
              picked={pick ? pick.picked.has(row.record.id) : null}
              toggle={pick?.toggle}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SortHeader({ column, sort, sortBy }: { column: Column; sort: Sort; sortBy: (column: Column) => void }) {
  const sorted = sort.column === column.key;
  const direction = sort.descending ? 'descending' : 'ascending';
  const numeric = column.kind === 'problems' || column.kind === 'used-by' || isNumber(column);
  return (
    <th
      scope="col"
      class={column.kind === 'record' ? 'record-cell' : numeric ? 'number-cell' : undefined}
      aria-sort={sorted ? direction : undefined}
    >
      <button type="button" class="sort-button" onClick={() => sortBy(column)}>
        {column.label}
        {/* Characters, not pictures, so the mark holds up when high contrast settings invert colours (APG). */}
        <span class="sort-mark" aria-hidden="true">
          {sorted ? (sort.descending ? '▼' : '▲') : '◇'}
        </span>
      </button>
    </th>
  );
}

const isNumber = (column: Column) =>
  column.kind === 'field' && (column.def.kind === 'int' || column.def.kind === 'number');

/** The select-all box: ticked when every row the view leaves is picked, mixed when some are. */
function SelectAll({ all, count, toggle }: { all: Picked; count: number; toggle: () => void }) {
  const box = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    // Mixed is a property, not an attribute.
    if (box.current) box.current.indeterminate = all === 'some';
  }, [all]);
  return (
    <input
      ref={box}
      type="checkbox"
      class="pick-box"
      checked={all === 'all'}
      aria-label={all === 'all' ? `Unselect all ${count}` : `Select all ${count}`}
      onChange={toggle}
    />
  );
}

function RecordRow(props: {
  row: Row;
  columns: readonly Column[];
  open: (id: string) => void;
  current: boolean;
  picked: boolean | null;
  toggle: ((id: string) => void) | undefined;
}) {
  const { row, columns, open, current, picked, toggle } = props;
  const { record, name } = row;
  return (
    <tr class={picked ? 'picked' : undefined}>
      {picked !== null ? (
        <td class="pick-cell">
          <input
            type="checkbox"
            class="pick-box"
            checked={picked}
            aria-label={`Select ${record.id}`}
            onChange={() => toggle?.(record.id)}
          />
        </td>
      ) : null}
      {columns.map((column) => {
        if (column.kind === 'record') {
          return (
            <th key={column.key} scope="row" class="record-cell">
              <button
                type="button"
                class="record-link"
                aria-current={current ? 'true' : undefined}
                onClick={() => open(record.id)}
              >
                {name ? <span class="record-name">{name}</span> : null}
                <span class="mono record-id">{record.id}</span>
              </button>
            </th>
          );
        }
        return <Cell key={column.key} column={column} row={row} />;
      })}
    </tr>
  );
}

function Cell({ column, row }: { column: Column; row: Row }) {
  if (column.kind === 'problems' || column.kind === 'used-by') {
    const count = column.kind === 'problems' ? row.record.problems.length : row.users;
    return (
      <td class={count > 0 && column.kind === 'problems' ? 'number-cell cell-problem' : 'number-cell'}>
        {count > 0 ? count : <Nothing said={column.kind === 'problems' ? 'none' : 'nothing'} />}
      </td>
    );
  }
  if (column.kind !== 'field') return null;
  const text = row.texts.get(column.key) ?? '';
  const value = fieldValue(row.record, column.name);
  return (
    <td class={isNumber(column) ? 'number-cell' : undefined}>
      {text === '' ? (
        <Nothing said={value === undefined ? 'not set' : 'empty'} />
      ) : column.def.kind === 'colour' && typeof value === 'string' && COLOUR_PATTERN.test(value) ? (
        <span class="cell-text">
          {/* Only a #rrggbb colour: a value like url(…) would have the page fetch it. */}
          <span class="swatch" style={{ background: value }} aria-hidden="true" />
          {text}
        </span>
      ) : (
        <span class="cell-text">{text}</span>
      )}
    </td>
  );
}

/** An empty cell: a dash to see, words to hear. */
function Nothing({ said }: { said: string }) {
  return (
    <>
      <span class="muted" aria-hidden="true">
        –
      </span>
      <span class="visually-hidden">{said}</span>
    </>
  );
}
