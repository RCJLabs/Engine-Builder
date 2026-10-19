/**
 * The Records panel's filters (M2.5): rows of a column, a test and, for most tests, a value. The
 * tests a column offers follow its field's kind. A filter not yet complete (no value, or a number
 * that doesn't read as one) tests nothing, and the panel says so beside it.
 */
import type { FieldDef } from '@eb/schema';
import { parseNumber } from '../forms/values.ts';
import { refKey } from './cells.ts';
import { type Column, fieldValue, fold, type Row } from './table.ts';

export type Test =
  | 'is'
  | 'is-not'
  | 'contains'
  | 'below'
  | 'at-most'
  | 'above'
  | 'at-least'
  | 'set'
  | 'not-set'
  | 'empty'
  | 'not-empty'
  | 'any'
  | 'none';

export interface Filter {
  /** Tells filter rows apart on screen, so removing one never hands its row to the next. */
  readonly key?: number;
  /** A column's key. */
  readonly column: string;
  readonly test: Test;
  /** What `is`, `contains` and the number tests compare with, as typed or chosen. */
  readonly value: string;
}

export interface TestChoice {
  readonly test: Test;
  readonly label: string;
  readonly needsValue: boolean;
}

const choice = (test: Test, label: string, needsValue = true): TestChoice => ({ test, label, needsValue });
const PRESENCE = [choice('set', 'is set', false), choice('not-set', 'is not set', false)];
const SAME = [choice('is', 'is'), choice('is-not', 'is not')];
const NUMBERS = [
  choice('below', 'is less than'),
  choice('at-most', 'is at most'),
  choice('above', 'is more than'),
  choice('at-least', 'is at least'),
];
const ITEMS = [
  choice('contains', 'has an item with'),
  choice('empty', 'is empty', false),
  choice('not-empty', 'is not empty', false),
];

/** The tests a column offers, the first being the one a new filter starts with. */
export function testsFor(column: Column): TestChoice[] {
  switch (column.kind) {
    case 'record':
      return [choice('contains', 'contains'), choice('is', 'is')];
    case 'problems':
      return [choice('any', 'some', false), choice('none', 'none', false)];
    case 'used-by':
      return [choice('any', 'some record', false), choice('none', 'no record', false)];
    case 'field':
      break;
  }
  switch (column.def.kind) {
    case 'int':
    case 'number':
      return [...SAME, ...NUMBERS, ...PRESENCE];
    case 'bool':
    case 'enum':
    case 'ref':
      return [...SAME, ...PRESENCE];
    case 'list':
    case 'map':
    case 'effects':
      return ITEMS;
    case 'group':
      return PRESENCE;
    default:
      return [choice('contains', 'contains'), ...SAME, ...PRESENCE];
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Why a filter tests nothing yet, or null when it is complete. */
export function filterProblem(column: Column | undefined, filter: Filter): string | null {
  if (!column) return 'That column has gone';
  const test = testsFor(column).find((each) => each.test === filter.test);
  if (!test) return 'Choose a test';
  if (!test.needsValue) return null;
  if (filter.value.trim() === '') return 'Give a value to compare with';
  const numeric = column.kind === 'field' && (column.def.kind === 'int' || column.def.kind === 'number');
  return numeric && parseNumber(filter.value) === null ? `“${filter.value}” isn’t a number` : null;
}

/** Whether the row passes the filter; null when the filter is not complete, which passes every row. */
export function matchesFilter(row: Row, columns: readonly Column[], filter: Filter): boolean | null {
  const column = columns.find((each) => each.key === filter.column);
  if (!column || filterProblem(column, filter) !== null) return null;
  const wanted = fold(filter.value.trim());
  switch (column.kind) {
    case 'record': {
      const words = [row.record.id, row.name ?? ''].map(fold);
      return filter.test === 'is' ? words.includes(wanted) : words.some((word) => word.includes(wanted));
    }
    case 'problems':
      return row.record.problems.length > 0 === (filter.test === 'any');
    case 'used-by':
      return row.users > 0 === (filter.test === 'any');
    case 'field': {
      const value = fieldValue(row.record, column.name);
      const shown = { value, text: row.texts.get(column.key) ?? '', wanted, typed: filter.value.trim() };
      return matchesValue(column.def, shown, filter.test);
    }
  }
}

/** A cell's value and text, and what the filter compares them with, folded and as typed. */
interface Compared {
  readonly value: unknown;
  readonly text: string;
  readonly wanted: string;
  readonly typed: string;
}

function matchesValue(def: FieldDef, cell: Compared, test: Test): boolean {
  const { value, text, wanted, typed } = cell;
  if (test === 'set') return value !== undefined;
  if (test === 'not-set') return value === undefined;
  if (test === 'is-not') return !matchesValue(def, cell, 'is');
  if (value === undefined) return test === 'empty';
  switch (test) {
    case 'is':
      if (def.kind === 'int' || def.kind === 'number') return value === parseNumber(typed);
      if (def.kind === 'bool') return String(value) === typed;
      if (def.kind === 'ref') return value === typed || refKey(def, value) === typed;
      return fold(typeof value === 'string' ? value.trim() : text) === wanted;
    case 'contains':
      // What the cell shows, names included, or what the file holds: a list of refs shows names, holds ids.
      return (
        fold(text).includes(wanted) ||
        ((def.kind === 'list' || def.kind === 'map' || def.kind === 'effects') &&
          fold(JSON.stringify(value)).includes(wanted))
      );
    case 'empty':
    case 'not-empty': {
      const count = Array.isArray(value) ? value.length : isObject(value) ? Object.keys(value).length : -1;
      return count >= 0 && (count === 0) === (test === 'empty');
    }
    default:
      return typeof value === 'number' && compares(test, value, parseNumber(typed) as number);
  }
}

function compares(test: Test, value: number, bound: number): boolean {
  if (test === 'below') return value < bound;
  if (test === 'at-most') return value <= bound;
  if (test === 'above') return value > bound;
  return test === 'at-least' && value >= bound;
}
