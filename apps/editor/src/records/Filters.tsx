import type { ValueDef } from '@eb/schema';
import { useUniqueId } from '../app/ids.ts';
import type { Catalog } from '../forms/catalog.ts';
import type { NameOf } from './cells.ts';
import { type Filter, filterProblem, type Test, testsFor } from './filters.ts';
import type { Column } from './table.ts';

let made = 0;

/** A new filter: on the first field, or the record when the type lists none, with its first test. */
export function newFilter(columns: readonly Column[]): Filter {
  const column = columns.find((c) => c.kind === 'field') ?? (columns[0] as Column);
  return { key: ++made, column: column.key, test: testsFor(column)[0]?.test ?? 'contains', value: '' };
}

/**
 * The table's filters, one row each: a column, a test and, for most tests, a value. Every
 * filter applies as it changes; one not yet complete tests nothing, and says why.
 */
export function Filters(props: {
  columns: readonly Column[];
  filters: readonly Filter[];
  catalog: Catalog;
  nameOf: NameOf;
  change: (filters: Filter[]) => void;
}) {
  const { filters, change } = props;
  if (filters.length === 0) return null;
  const replace = (at: number, filter: Filter | null) =>
    change(filters.flatMap((each, i) => (i !== at ? [each] : filter ? [filter] : [])));
  return (
    <ul class="table-filters" aria-label="Filters">
      {filters.map((filter, at) => (
        <FilterRow
          key={filter.key ?? `at-${at}`}
          {...props}
          at={at}
          filter={filter}
          set={(next) => replace(at, next)}
          remove={() => replace(at, null)}
        />
      ))}
    </ul>
  );
}

function FilterRow(props: {
  at: number;
  filter: Filter;
  columns: readonly Column[];
  catalog: Catalog;
  nameOf: NameOf;
  set: (filter: Filter) => void;
  remove: () => void;
}) {
  const { at, filter, columns, set, remove } = props;
  const id = useUniqueId();
  const column = columns.find((c) => c.key === filter.column);
  const tests = column ? testsFor(column) : [];
  const test = tests.find((t) => t.test === filter.test);
  const problem = filterProblem(column, filter);
  const name = `Filter ${at + 1}`;
  return (
    <li class="filter-row" aria-label={name} data-filter={at}>
      <select
        id={`${id}-column`}
        class="field"
        aria-label={`${name}: column`}
        value={filter.column}
        onChange={(event) => {
          const next = columns.find((c) => c.key === event.currentTarget.value) as Column;
          set({ ...filter, column: next.key, test: testsFor(next)[0]?.test ?? 'contains', value: '' });
        }}
      >
        {columns.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      <select
        class="field"
        aria-label={`${name}: test`}
        value={filter.test}
        onChange={(event) => set({ ...filter, test: event.currentTarget.value as Test })}
      >
        {tests.map((t) => (
          <option key={t.test} value={t.test}>
            {t.label}
          </option>
        ))}
      </select>
      {test?.needsValue && column ? (
        <FilterValue
          {...props}
          column={column}
          label={`${name}: value`}
          describedBy={problem ? `${id}-said` : undefined}
        />
      ) : null}
      <button type="button" class="icon-button" aria-label={`Remove filter ${at + 1}`} onClick={remove}>
        ✕
      </button>
      {problem ? (
        <p id={`${id}-said`} class="form-help filter-said">
          {problem}
        </p>
      ) : null}
    </li>
  );
}

/** What a filter compares with: a list for a field with choices, a box for the rest. */
function FilterValue(props: {
  filter: Filter;
  column: Column;
  catalog: Catalog;
  nameOf: NameOf;
  label: string;
  describedBy: string | undefined;
  set: (filter: Filter) => void;
}) {
  const { filter, column, catalog, nameOf, label, describedBy, set } = props;
  const choices = column.kind === 'field' ? choicesOf(column.def, catalog, nameOf) : null;
  const write = (value: string) => set({ ...filter, value });
  if (choices) {
    return (
      <select
        class="field"
        aria-label={label}
        aria-describedby={describedBy}
        value={filter.value}
        onChange={(event) => write(event.currentTarget.value)}
      >
        <option value="">Choose…</option>
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    );
  }
  const numeric = column.kind === 'field' && (column.def.kind === 'int' || column.def.kind === 'number');
  return (
    <input
      class="field"
      type="text"
      inputMode={numeric ? 'decimal' : undefined}
      aria-label={label}
      aria-describedby={describedBy}
      autoComplete="off"
      autocapitalize="none"
      spellcheck={false}
      value={filter.value}
      onInput={(event) => write(event.currentTarget.value)}
    />
  );
}

/** The values a field can hold, when they can be listed: choices, yes and no, records of its types. */
function choicesOf(def: ValueDef, catalog: Catalog, nameOf: NameOf): { value: string; label: string }[] | null {
  if (def.kind === 'enum') return def.values.map((value) => ({ value, label: value }));
  if (def.kind === 'bool') {
    return [
      { value: 'true', label: 'Yes' },
      { value: 'false', label: 'No' },
    ];
  }
  if (def.kind !== 'ref') return null;
  const types = typeof def.to === 'string' ? [def.to] : def.to;
  return types.flatMap((type) =>
    (catalog.records.get(type) ?? []).map((id) => {
      const key = `${type}:${id}`;
      const name = nameOf(key);
      const value = typeof def.to === 'string' ? id : key;
      return { value, label: name ? `${name} (${value})` : value };
    }),
  );
}
