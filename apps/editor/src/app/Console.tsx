import { useUniqueId } from './ids.ts';
import { CONSOLE_STRIP_ID } from './panelControl.ts';
import { type LogLine, log, note, noteError } from './state.ts';

/** A line as copied into a bug report: its time, an error said as one, how many times. */
const lineText = (line: LogLine) =>
  `${line.at} ${line.level === 'error' ? 'Error: ' : ''}${line.text}${line.count > 1 ? ` (×${line.count})` : ''}`;

async function copyLog(): Promise<void> {
  try {
    await navigator.clipboard.writeText(log.value.map(lineText).join('\n'));
    note('Copied the console.');
  } catch (error) {
    noteError(`The console couldn’t be copied: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * The editor's log (M2.8): what it did and what went wrong, errors said as errors, a line said
 * again counted rather than repeated. Copy all is for bug reports: the editor sends nothing
 * itself. Docked or in a zone it is a plain block: the dock's group or the zone's tabpanel is
 * already a region named Console; the tablet's strip is a section of its own.
 */
export function Console({ docked = false }: { docked?: boolean }) {
  const head = useUniqueId();
  const lines = (
    <>
      <div class="console-head">
        <h2 id={head} class="console-title">
          Console
        </h2>
        <button
          type="button"
          class="button console-action"
          disabled={log.value.length === 0}
          onClick={() => void copyLog()}
        >
          Copy all
        </button>
        <button
          type="button"
          class="button console-action"
          disabled={log.value.length === 0}
          onClick={() => {
            log.value = [];
          }}
        >
          Clear
        </button>
      </div>
      <ol
        id={docked ? undefined : CONSOLE_STRIP_ID}
        class="console-lines"
        aria-live="polite"
        aria-label="Console messages"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the log scrolls, so keyboard users must reach it (axe scrollable-region-focusable)
        tabIndex={0}
      >
        {log.value.map((line) => (
          <li key={line.id} class={line.level === 'error' ? 'console-error' : undefined}>
            <time>{line.at}</time> {line.level === 'error' ? <strong>Error: </strong> : null}
            {line.text}
            {line.count > 1 ? <span class="console-count"> ×{line.count}</span> : null}
          </li>
        ))}
      </ol>
    </>
  );
  return docked ? (
    <div class="console" data-panel="console">
      {lines}
    </div>
  ) : (
    <section class="console" aria-labelledby={head}>
      {lines}
    </section>
  );
}
