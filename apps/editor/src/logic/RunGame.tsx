/**
 * Run (M3.2, D38): the game played 20 times by a bot in the script worker, and eb sim's report of
 * the runs, word for word: `eb sim <project> --seeds 20 --policy <bot>` on the exported project
 * prints the same lines. Nothing plays while the project has errors, as eb sim plays nothing.
 */
import type { GameCatalog } from '@eb/script';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { problemCount } from '../problems/count.ts';
import { type OpenProject, revision } from '../projects/opened.ts';
import { policyNames } from '../scripts/jobs.ts';
import { playFiles } from '../scripts/playFiles.ts';
import type { PlayResult } from '../scripts/protocol.ts';
import { PLAY_MS, ScriptTimeout, scriptWorker } from '../scripts/scriptWorker.ts';

/** How many games Run plays: enough to see a spread, few enough for a phone (D38). */
export const RUN_SEEDS = 20;

// Its own worker, so a long Run never holds up checking the scripts.
const player = scriptWorker();

type Shown =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running' }
  | {
      readonly kind: 'done';
      readonly result: PlayResult;
      readonly bot: string;
      readonly ms: number;
      readonly at: number;
    }
  | { readonly kind: 'failed'; readonly message: string };

export function RunGame({ project, catalog }: { project: OpenProject; catalog: GameCatalog }) {
  const bots = policyNames(catalog);
  const [bot, setBot] = useState(catalog.policies[0] ?? bots[0] ?? 'random');
  const [shown, setShown] = useState<Shown>({ kind: 'idle' });
  const select = useUniqueId();
  const errors = problemCount.value?.errors ?? 0;
  const chosen = bots.includes(bot) ? bot : (bots[0] ?? 'random');
  const run = async () => {
    setShown({ kind: 'running' });
    const at = revision.value;
    const started = performance.now();
    try {
      const result = await player.play(await playFiles(project.source), RUN_SEEDS, chosen);
      setShown({ kind: 'done', result, bot: chosen, ms: Math.round(performance.now() - started), at });
    } catch (error) {
      const message =
        error instanceof ScriptTimeout
          ? `The games didn’t finish within ${PLAY_MS / 1000} seconds: does a turn never end?`
          : error instanceof Error
            ? error.message
            : String(error);
      setShown({ kind: 'failed', message });
    }
  };
  return (
    <div class="logic-run">
      <div class="form-actions">
        <label for={select}>Bot</label>
        <select id={select} class="field form-select" value={chosen} onChange={(e) => setBot(e.currentTarget.value)}>
          {bots.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="button"
          class="button primary"
          disabled={shown.kind === 'running' || errors > 0}
          onClick={() => void run()}
        >
          {`Run ${RUN_SEEDS} games`}
        </button>
      </div>
      {errors > 0 ? (
        <p class="muted">{`Run plays what eb sim would, so it waits until the project’s ${errors === 1 ? 'error is' : `${errors} errors are`} fixed.`}</p>
      ) : null}
      <div aria-live="polite">
        {shown.kind === 'running' ? <p class="muted">Playing…</p> : null}
        {shown.kind === 'failed' ? <p class="logic-problem">{shown.message}</p> : null}
        {shown.kind === 'done' ? <Report shown={shown} changed={shown.at !== revision.value} /> : null}
      </div>
    </div>
  );
}

function Report({ shown, changed }: { shown: Extract<Shown, { kind: 'done' }>; changed: boolean }) {
  const { result, bot, ms } = shown;
  if (result.kind === 'refused') {
    return (
      <p class="logic-problem">{`Nothing was played: the project has ${result.errors.length === 1 ? 'an error' : `${result.errors.length} errors`}. See Problems.`}</p>
    );
  }
  return (
    <>
      <p class="muted">
        {`Played in ${ms} ms, as eb sim --seeds ${RUN_SEEDS} --policy ${bot} plays it.`}
        {changed ? ' The project has changed since: run again to see it now.' : ''}
      </p>
      <pre class="logic-report">{result.lines.join('\n')}</pre>
    </>
  );
}
