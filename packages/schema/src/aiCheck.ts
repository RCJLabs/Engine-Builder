/**
 * The ai kit's checks beyond its schema (M6.3, D75, docs/specs/ai.md#checks): E081 for a behaviour
 * that can't run for an actor using it, or with this calendar; W148 for one no actor uses. Run once
 * every record has been read, as the points are each actor's space's.
 */
import { type CalendarDef, calendarOf, pointerSegment } from '@eb/core';
import { ACTOR, BEHAVIOUR, type BehaviourNode, childrenOf, kindOf } from '@eb/kits';
import type { DiagnosticCode } from './diagnostics.ts';
import type { Walkers } from './worldCheck.ts';

type Report = (code: DiagnosticCode, path: string, message: string) => void;

/** What the checks read of a record, and where they report on it. */
export interface Checked {
  readonly type: string;
  readonly id: string;
  readonly value: unknown;
  readonly report: Report;
}

const WALKING = new Set(['travel', 'sleep', 'work', 'patrol', 'sandbox', 'follow']);
const LENGTHS = ['dwell', 'wait', 'cooldown'] as const;

interface Node {
  readonly node: BehaviourNode;
  readonly path: string;
}

/** Every node of a tree with its JSON Pointer from the record. */
function nodesOf(root: BehaviourNode): Node[] {
  const found: Node[] = [];
  const walk = (node: BehaviourNode, path: string) => {
    found.push({ node, path });
    const kind = kindOf(node);
    const key = kind === 'guard' ? 'do' : kind;
    for (const [i, child] of childrenOf(node).entries())
      walk(child, kind === 'guard' ? `${path}/do` : `${path}/${key}/${i}`);
  };
  walk(root, '/do');
  return found;
}

/** The node's points: a leaf's, by its pointer. */
function pointsOf({ node, path }: Node): [string, string][] {
  const kind = kindOf(node) as string;
  const value = (node as Record<string, unknown>)[kind];
  if (typeof value === 'string' && kind !== 'follow' && kind !== 'face') return [[value, `${path}/${kind}`]];
  if (Array.isArray(value) && (kind === 'patrol' || kind === 'sandbox'))
    return value.map((point, i) => [point as string, `${path}/${kind}/${i}`]);
  return [];
}

/** What the calendar can't read in one node: units it lacks, hours without an hours unit or past its day, weekdays it lacks. */
function checkCalendar({ node, path }: Node, calendar: CalendarDef, report: Report): void {
  const { units, ticksPerDay } = calendarOf(calendar);
  const n = node as Record<string, unknown>;
  for (const field of LENGTHS) {
    const length = n[field];
    if (typeof length !== 'object' || length === null) continue;
    for (const unit of Object.keys(length)) {
      if (!Object.hasOwn(units, unit))
        report(
          'E081',
          `${path}/${field}/${pointerSegment(unit)}`,
          `The calendar has no unit "${unit}": its units are ${Object.keys(units).join(', ')}`,
        );
    }
  }
  const hours = n.hours as readonly [number, number] | undefined;
  if (hours) {
    const unit = units.hours;
    if (unit === undefined)
      report(
        'E081',
        `${path}/hours`,
        'The calendar has no "hours" unit: give project.json\'s calendar "units": { "hours": … }',
      );
    else if (hours[0] === hours[1])
      report('E081', `${path}/hours`, 'From and To are the same hour: it would never hold');
    else {
      const most = Math.floor(ticksPerDay / unit);
      hours.forEach((hour, i) => {
        if (hour >= most)
          report('E081', `${path}/hours/${i}`, `A day of this calendar has ${most} hours: 0 to ${most - 1}`);
      });
    }
  }
  const days = n.days as readonly string[] | undefined;
  days?.forEach((day, i) => {
    if (!calendar.weekdays?.includes(day))
      report(
        'E081',
        `${path}/days/${i}`,
        calendar.weekdays
          ? `The calendar has no weekday "${day}": its weekdays are ${calendar.weekdays.join(', ')}`
          : 'The calendar has no weekdays',
      );
  });
}

/** E081 and W148 over every behaviour and the actors using them. */
export function checkBehaviours(
  records: readonly Checked[],
  calendar: CalendarDef | undefined,
  walkers?: Walkers,
): void {
  const behaviours = records.filter((r) => r.type === BEHAVIOUR);
  const users = new Map<string, string[]>();
  for (const record of records) {
    if (record.type !== ACTOR) continue;
    const id = (record.value as { behaviour?: unknown } | null)?.behaviour;
    if (typeof id !== 'string') continue;
    users.set(id, [...(users.get(id) ?? []), record.id]);
    if (walkers && !walkers.has(record.id))
      record.report(
        'E081',
        '/behaviour',
        `"${record.id}" stands in no space: place it in one for its behaviour to run`,
      );
  }
  for (const behaviour of behaviours) {
    const tree = (behaviour.value as { do?: BehaviourNode } | null)?.do;
    if (tree === undefined) continue;
    const nodes = nodesOf(tree);
    for (const node of nodes) checkCalendar(node, calendar ?? { ticksPerDay: 1 }, behaviour.report);
    const using = users.get(behaviour.id) ?? [];
    if (using.length === 0)
      behaviour.report('W148', '', 'No actor has this behaviour: give it to one as its Behaviour');
    const said = new Set<string>();
    const once = (path: string, message: string) => {
      if (said.has(`${path} ${message}`)) return;
      said.add(`${path} ${message}`);
      behaviour.report('E081', path, message);
    };
    for (const actor of using) {
      const walker = walkers?.get(actor);
      if (!walker) continue;
      for (const node of nodes) {
        for (const [point, path] of pointsOf(node))
          if (!walker.objects.has(point))
            once(path, `The space "${walker.space}", where "${actor}" stands, has no object "${point}"`);
        const kind = kindOf(node.node) as string;
        if (WALKING.has(kind) && !walker.navmesh)
          once(
            node.path,
            `The space "${walker.space}", where "${actor}" stands, has no navmesh: open it and press Bake navigation`,
          );
      }
    }
  }
}
