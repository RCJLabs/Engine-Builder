/**
 * The recording walked and read (M4.9): Step back and Step forward, where the game stands, and the
 * log of steps, each with its beats, debug steps and refusals marked, those taken back dimmed.
 */
import type { DebugLook, LogLine } from './protocol.ts';
import { debugBusy, stepBack, stepForward } from './tools.ts';

export function DebugSteps({ look }: { look: DebugLook }) {
  const busy = debugBusy.value;
  return (
    <div class="debug-body">
      <div class="form-actions">
        <button type="button" class="button" disabled={busy || look.cursor === 0} onClick={() => void stepBack()}>
          Step back
        </button>
        <button
          type="button"
          class="button"
          disabled={busy || look.cursor >= look.recorded}
          onClick={() => void stepForward()}
        >
          Step forward
        </button>
      </div>
      <p class="debug-where">{`Step ${look.cursor} of ${look.recorded}`}</p>
      {look.full ? <p class="muted">The recording is full: steps after 10,000 are played but not kept.</p> : null}
      {look.debugSteps > 0 ? (
        <p class="muted">{`${look.debugSteps === 1 ? 'A debug step' : `${look.debugSteps} debug steps`} changed this game, so it stays in the editor.`}</p>
      ) : null}
      {look.earlier > 0 ? <p class="muted">{`${look.earlier} earlier lines aren’t shown.`}</p> : null}
      {look.log.length === 0 ? <p class="muted">No steps yet.</p> : null}
      <ol class="debug-log" aria-label="The log">
        {look.log.map((line, i) => (
          <LogItem key={`${line.n}:${line.refused === undefined ? 's' : 'r'}:${i}`} line={line} />
        ))}
      </ol>
    </div>
  );
}

function LogItem({ line }: { line: LogLine }) {
  return (
    <li class="debug-line" data-ahead={line.ahead ? '' : undefined} data-refused={line.refused ? '' : undefined}>
      <span class="debug-line-head">
        <span class="debug-n">{line.n}</span>
        <span>{line.label}</span>
        {line.debug ? <span class="debug-tag">debug</span> : null}
        {line.refused !== undefined ? <span class="debug-tag">{`refused: ${line.refused}`}</span> : null}
        {line.ahead ? <span class="debug-tag">taken back</span> : null}
      </span>
      {line.beats.length > 0 ? (
        <ul class="debug-beats">
          {line.beats.map((beat, k) => (
            // Beats have no id; their place in the step is theirs.
            <li key={k}>{beat}</li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
