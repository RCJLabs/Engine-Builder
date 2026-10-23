/**
 * The Play panel's debug tools (M4.9, D59, docs/specs/play-in-editor.md#what-the-panel-shows):
 * under the game while one is in play, a section each for the steps and the log, time, quests,
 * running an effect, the state, named states and Replay. One opens at a time, so on a phone the
 * game stays in reach above them.
 */
import { DEFAULT_CALENDAR } from '@eb/kits';
import type { Store } from '@eb/platform';
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { useUniqueId } from '../../app/ids.ts';
import { type OpenProject, revision } from '../../projects/opened.ts';
import { playFiles } from '../../scripts/playFiles.ts';
import { DebugQuests } from './DebugQuests.tsx';
import { DebugState } from './DebugState.tsx';
import { DebugSteps } from './DebugSteps.tsx';
import { NamedStates } from './NamedStates.tsx';
import type { DebugLook } from './protocol.ts';
import { RunEffect } from './RunEffect.tsx';
import { debugBusy, debugLook, debugSaid, refreshLook, replay, replayReport, runEffects } from './tools.ts';
import { replayWords, timeSteps } from './words.ts';
import '../../styles/debug.css';

export function DebugTools({ project, store, game }: { project: OpenProject; store: Store; game: string }) {
  const id = useUniqueId();
  useEffect(() => {
    void refreshLook();
  }, []);
  const look = debugLook.value;
  return (
    <section class="debug" aria-labelledby={id}>
      <h3 id={id}>Debug</h3>
      <p class="debug-said" role="status">
        {debugSaid.value}
      </p>
      {look ? (
        <>
          <Part title="Steps">
            <DebugSteps look={look} />
          </Part>
          {look.time ? (
            <Part title="Time">
              <DebugTime project={project} time={look.time} />
            </Part>
          ) : null}
          {look.quests.length > 0 ? (
            <Part title="Quests">
              <DebugQuests quests={look.quests} />
            </Part>
          ) : null}
          <Part title="Run an effect">
            <RunEffect project={project} />
          </Part>
          <Part title="State">
            <DebugState slices={look.slices} />
          </Part>
          <Part title="Named states">
            <NamedStates store={store} game={game} />
          </Part>
          <Part title="Replay">
            <Replay project={project} />
          </Part>
        </>
      ) : (
        <p class="muted">Reading the game…</p>
      )}
    </section>
  );
}

/** A section that opens on its own, closing the one open before it. */
function Part({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <details class="debug-part" name="debug-part">
      <summary>{title}</summary>
      {children}
    </details>
  );
}

/** The date as the time kit says it, and a +1 of each of the calendar's units, through `wait`. */
function DebugTime({ project, time }: { project: OpenProject; time: NonNullable<DebugLook['time']> }) {
  const steps = timeSteps(project.catalog.calendar ?? DEFAULT_CALENDAR);
  const busy = debugBusy.value;
  return (
    <div class="debug-body">
      <dl class="debug-date">
        {Object.entries(time).map(([fact, value]) => (
          <div key={fact}>
            <dt>{fact}</dt>
            <dd>{String(value)}</dd>
          </div>
        ))}
      </dl>
      <div class="form-actions">
        {steps.map((step) => (
          <button
            key={step.unit}
            type="button"
            class="button"
            disabled={busy}
            onClick={() => void runEffects([{ effect: 'wait', [step.unit]: 1 }], `Waited ${step.label.slice(1)}.`)}
          >
            {step.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Replay on the project as it is now, and what it found. */
function Replay({ project }: { project: OpenProject }) {
  const report = replayReport.value;
  return (
    <div class="debug-body">
      <p class="muted">
        Plays this run again on the project as it is now, and stops at the first step that is refused or plays out
        differently.
      </p>
      <div class="form-actions">
        <button
          type="button"
          class="button"
          disabled={debugBusy.value}
          onClick={async () => replay(await playFiles(project.source), revision.value)}
        >
          Replay on the project now
        </button>
      </div>
      {report ? <p class="debug-report">{replayWords(report)}</p> : null}
    </div>
  );
}
