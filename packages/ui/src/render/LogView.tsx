/**
 * The log widget (M4.2, docs/specs/input.md#the-log): the last lines said to the log, newest first.
 * A `role="log"` that doesn't announce, since the announcer has spoken each line once already, so a
 * screen reader can read it back without hearing it twice.
 */
import { LOG_LINES, type Widget } from '../format/screen.ts';
import type { Entry } from '../session/types.ts';
import type { Drawing } from './context.ts';
import { fill } from './fill.ts';

interface Props {
  readonly widget: Extract<Widget, { widget: 'log' }>;
  readonly drawing: Drawing;
  readonly entry: Entry | undefined;
}

export function LogView({ widget, drawing, entry }: Props) {
  const lines = drawing.log.slice(-(widget.lines ?? LOG_LINES)).reverse();
  const label = widget.label === undefined ? 'Log' : fill(widget.label, drawing.view, entry);
  return (
    <div class="eb-log" role="log" aria-live="off" aria-label={label}>
      {lines.length === 0 ? (
        widget.empty === undefined ? null : (
          <p class="eb-text eb-empty">{fill(widget.empty, drawing.view, entry)}</p>
        )
      ) : (
        <ol class="eb-log-lines">
          {lines.map((line) => (
            <li key={line.n} class="eb-text">
              {line.text}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
