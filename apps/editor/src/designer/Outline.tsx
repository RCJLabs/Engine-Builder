/**
 * The outline (M4.5, D55, docs/specs/designer.md#the-outline): the screen's rows, each a button
 * that selects, marked with its problems, an override at the frame's size, and whether it shows
 * now. A widget among others drags by its handle alone, as 2060td's rows do, so a finger scrolling
 * the outline never moves one; the bar's buttons make every move by keys and single taps.
 */
import type { Breakpoint } from '@eb/ui/format';
import type { View } from '@eb/ui/session';
import { useRef, useState } from 'preact/hooks';
import { type Row, rowName } from './tree.ts';

interface Props {
  readonly rows: readonly Row[];
  readonly selected: string;
  readonly select: (at: string) => void;
  /** Problems by the row they fall to. */
  readonly problems: ReadonlyMap<string, number>;
  /** Each widget's shows-when and the breakpoints it changes at, by pointer. */
  readonly marks: ReadonlyMap<string, { readonly when?: string; readonly at: readonly Breakpoint[] }>;
  readonly view: View;
  readonly breakpoint: Breakpoint;
  readonly drop: (row: Row, to: number) => void;
  readonly canEdit: boolean;
}

/** Marks beside a row's name: its problems, whether it shows now, and its override here. */
function marksOf(props: Props, row: Row): string[] {
  const marks: string[] = [];
  const problems = props.problems.get(row.at) ?? 0;
  if (problems > 0) marks.push(`${problems} ${problems === 1 ? 'problem' : 'problems'}`);
  const mark = props.marks.get(row.at);
  if (mark?.when !== undefined && props.view.conditions[mark.when] === false) marks.push('hidden now');
  if (mark?.at.includes(props.breakpoint)) marks.push(`changed at ${props.breakpoint}`);
  return marks;
}

export function Outline(props: Props) {
  const { rows, selected, select } = props;
  const list = useRef<HTMLUListElement>(null);
  const [dragging, setDragging] = useState<{ readonly row: Row; readonly to: number } | null>(null);

  /** The sibling slot under the pointer's height, among the dragged row's siblings. */
  const targetOf = (row: Row, y: number): number => {
    const among = row.among;
    if (!among || !list.current) return row.among?.index ?? 0;
    const siblings = rows.filter((r) => r.among?.list === among.list);
    let to = 0;
    for (const sibling of siblings) {
      const element = list.current.querySelector<HTMLElement>(`[data-row="${CSS.escape(sibling.at)}"]`);
      const box = element?.getBoundingClientRect();
      if (box && y > box.top + box.height / 2) to = (sibling.among?.index ?? 0) + (sibling.at === row.at ? 0 : 1);
    }
    return Math.min(Math.max(0, to > among.index ? to - 1 : to), among.count - 1);
  };

  const handle = (row: Row) => ({
    onPointerDown: (event: PointerEvent) => {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      setDragging({ row, to: row.among?.index ?? 0 });
    },
    onPointerMove: (event: PointerEvent) => {
      if (dragging?.row.at === row.at) setDragging({ row, to: targetOf(row, event.clientY) });
    },
    onPointerUp: () => {
      if (dragging?.row.at === row.at && dragging.to !== row.among?.index) props.drop(row, dragging.to);
      setDragging(null);
    },
    onPointerCancel: () => setDragging(null),
  });

  return (
    <ul class="designer-outline" ref={list} aria-label="Outline">
      {rows.map((row) => {
        const marks = marksOf(props, row);
        const landing = dragging && dragging.row.among?.list === row.among?.list && dragging.to === row.among?.index;
        return (
          <li
            key={row.at}
            data-row={row.at}
            class={`designer-row${landing && dragging?.row.at !== row.at ? ' designer-landing' : ''}`}
            style={{ paddingInlineStart: `${row.depth * 0.9}rem` }}
          >
            <button
              type="button"
              class={`designer-pick${row.role === 'empty' ? ' muted' : ''}`}
              aria-current={row.at === selected ? 'true' : undefined}
              onClick={() => select(row.at)}
            >
              <span class="designer-name">{rowName(row)}</span>
              {row.summary && row.role !== 'empty' ? <span class="muted">{row.summary}</span> : null}
              {marks.length > 0 ? <span class="designer-marks">{marks.join(' · ')}</span> : null}
            </button>
            {row.among && props.canEdit ? (
              <span
                class="designer-handle"
                role="img"
                aria-label={`Drag to move ${rowName(row)}; or use Up and Down`}
                {...handle(row)}
              >
                ⋮⋮
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
