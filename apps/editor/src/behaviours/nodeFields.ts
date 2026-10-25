/**
 * Each kind of node's fields (M6.3, D75), as a type file's, so the record form's own fields draw
 * them: lengths in the calendar's units, weekdays from its days of the week, points from the spaces
 * the behaviour's actors stand in. A guard's hours are a pair, which HoursField draws apart.
 */
import type { NodeKind } from '@eb/kits';
import type { FieldDef, Fields } from '@eb/schema';
import { pointerOf } from '../forms/formContext.ts';
import { fieldPointers } from '../forms/problems.ts';
import { type OutlineRow, rowsOf } from './outline.ts';

/** What the fields offer: the calendar's units and weekdays, and the points of the actors' spaces. */
export interface NodeSettings {
  readonly units: readonly string[];
  readonly weekdays?: readonly string[];
  /** Objects of the spaces where the behaviour's actors stand; none known, a point is typed. */
  readonly points: readonly string[];
}

const label = (unit: string) => `${unit.charAt(0).toUpperCase()}${unit.slice(1)}`;

/** A length as one whole number a unit, each left empty or filled. */
const length = (s: NodeSettings, info: { label: string; description?: string; optional?: true }): FieldDef => ({
  kind: 'group',
  ...info,
  fields: Object.fromEntries(
    s.units.map((unit) => [unit, { kind: 'int', min: 0, optional: true, label: label(unit) }]),
  ),
});

const POINT_WORDS = 'An object of the space the actor stands in: its id, or ids joined by /';
const point = (s: NodeSettings, name: string): FieldDef =>
  s.points.length > 0
    ? { kind: 'enum', values: s.points, label: name, description: POINT_WORDS }
    : { kind: 'text', min: 1, label: name, description: POINT_WORDS };
const pointList = (s: NodeSettings, name: string): FieldDef => {
  const of = point(s, name);
  return { kind: 'list', of, min: 1, label: name, description: 'In order, each an object of the actor’s space' };
};

/** The fields of a node of this kind, a guard's hours aside. */
export function nodeFields(kind: NodeKind, s: NodeSettings): Fields {
  switch (kind) {
    case 'guard':
      return {
        if: {
          kind: 'condition',
          optional: true,
          label: 'If',
          description: 'Holds while this is true; @self is the NPC',
        },
        days: {
          kind: 'list',
          of: s.weekdays ? { kind: 'enum', values: s.weekdays } : { kind: 'text' },
          optional: true,
          label: 'On days',
          description: s.weekdays ? 'Days of the week it holds on' : 'Give the calendar days of the week first',
        },
        cooldown: length(s, {
          label: 'Cooldown',
          optional: true,
          description: 'Once left, it doesn’t hold again until this long has passed',
        }),
      };
    case 'travel':
      return { travel: point(s, 'To') };
    case 'sleep':
      return { sleep: point(s, 'Bed') };
    case 'work':
      return { work: point(s, 'At') };
    case 'patrol':
      return { patrol: pointList(s, 'Points'), dwell: length(s, { label: 'Waits at each', optional: true }) };
    case 'sandbox':
      return { sandbox: pointList(s, 'Points'), dwell: length(s, { label: 'Waits at each' }) };
    case 'follow':
      return {
        distance: {
          kind: 'number',
          min: 0.5,
          max: 50,
          optional: true,
          label: 'Distance',
          description: 'Metres it keeps from the player. Left empty, 2.',
        },
      };
    case 'wait':
      return { wait: length(s, { label: 'For' }) };
    case 'effects':
      return { effects: { kind: 'effects', label: 'Effects' } };
    default:
      return {};
  }
}

/** Where a row's own problems can sit: the node, its list, its hours and its fields, not its children's. */
export function rowPointers(row: OutlineRow, s: NodeSettings): string[] {
  const at = pointerOf(row.at);
  if (row.kind === undefined) return [at];
  const found = [at];
  if (row.kind === 'first' || row.kind === 'in-order') found.push(`${at}/${row.kind}`);
  if (row.kind === 'guard') found.push(`${at}/hours`, `${at}/hours/0`, `${at}/hours/1`);
  for (const pointer of fieldPointers({ title: '', fields: nodeFields(row.kind, s) }, row.node))
    if (pointer !== '') found.push(`${at}${pointer}`);
  return found;
}

/**
 * Every place in the tree a problem can be shown at, as JSON Pointers from the record, so a problem
 * deep in the tree reaches its own box rather than the whole of Do.
 */
export function behaviourPointers(root: unknown, s: NodeSettings): Set<string> {
  return new Set(['/do', ...rowsOf(root).flatMap((row) => rowPointers(row, s))]);
}
