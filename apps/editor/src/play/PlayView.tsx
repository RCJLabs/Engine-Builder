/**
 * The open project played through its screens (M4.1, D51): compiled into the pack Export game
 * writes, then played in the Play worker, each step's view drawn by the same renderer the player
 * page uses. Nothing plays while the project has errors, as nothing exports. Loaded when a project
 * is first open, with the renderer.
 */
import type { Action } from '@eb/core';
import { GameScreens } from '@eb/ui';
import type { Said, Screen, Theme } from '@eb/ui/format';
import type { View } from '@eb/ui/session';
import { useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { showPanel } from '../app/panelControl.ts';
import { problemCount } from '../problems/count.ts';
import { type OpenProject, revision, runScripts } from '../projects/opened.ts';
import { playFiles } from '../scripts/playFiles.ts';
import { playClient } from './playClient.ts';
import type { PlayPageReply } from './protocol.ts';
import { ScreensList } from './ScreensList.tsx';
import '../styles/logic.css';
import '../styles/play.css';

const client = playClient();

type Shown =
  | { readonly kind: 'idle' }
  | { readonly kind: 'starting' }
  | {
      readonly kind: 'playing';
      readonly screens: Readonly<Record<string, Screen>>;
      readonly theme: Theme | undefined;
      readonly view: View;
      /** What the last step said (M4.2). */
      readonly said: readonly Said[];
      readonly at: number;
      /** Which game this is, so a new one starts with nothing in its log. */
      readonly game: number;
    }
  | { readonly kind: 'refused'; readonly errors: number }
  | { readonly kind: 'failed'; readonly message: string };

const failed = (error: unknown): Shown => ({
  kind: 'failed',
  message: error instanceof Error ? error.message : String(error),
});

export function PlayView({ project }: { project: OpenProject }) {
  const [shown, setShown] = useState<Shown>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [seed, setSeed] = useState('1');
  const seedId = useUniqueId();
  const errors = problemCount.value?.errors ?? 0;
  const ready = project.game.status === 'loaded';
  const start = async () => {
    setShown({ kind: 'starting' });
    const at = revision.value;
    try {
      const reply = await client.send({ kind: 'start-files', files: await playFiles(project.source), seed });
      setShown(started(reply, at));
    } catch (error) {
      setShown(failed(error));
    }
  };
  const act = async (action: Action) => {
    if (shown.kind !== 'playing' || busy) return;
    setBusy(true);
    try {
      const reply = await client.send({ kind: 'act', action });
      if (reply.kind === 'stepped') setShown({ ...shown, view: reply.view, said: reply.said });
      else if (reply.kind === 'failed') setShown({ kind: 'failed', message: reply.message });
    } catch (error) {
      setShown(failed(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="play">
      <Readiness project={project} />
      <div class="form-actions">
        <label for={seedId}>Seed</label>
        <input
          id={seedId}
          class="field play-seed"
          value={seed}
          onInput={(event) => setSeed(event.currentTarget.value)}
        />
        <button
          type="button"
          class="button primary"
          disabled={!ready || errors > 0 || shown.kind === 'starting' || seed.trim() === ''}
          onClick={() => void start()}
        >
          {shown.kind === 'playing' ? 'Start again' : 'Play'}
        </button>
      </div>
      {ready && errors > 0 ? (
        <p class="muted">{`Play plays what Export game would write, so it waits until the project’s ${errors === 1 ? 'error is' : `${errors} errors are`} fixed.`}</p>
      ) : null}
      <div aria-live="polite">
        {shown.kind === 'starting' ? <p class="muted">Starting…</p> : null}
        {shown.kind === 'failed' ? <p class="logic-problem">{shown.message}</p> : null}
        {shown.kind === 'refused' ? (
          <p class="logic-problem">{`Nothing was played: the project has ${shown.errors === 1 ? 'an error' : `${shown.errors} errors`}. See Problems.`}</p>
        ) : null}
        {shown.kind === 'playing' && shown.at !== revision.value ? (
          <p class="muted">The project has changed since this game started: start again to play it as it is now.</p>
        ) : null}
      </div>
      {shown.kind === 'playing' ? (
        <div class="play-game">
          <GameScreens
            key={shown.game}
            screens={shown.screens}
            theme={shown.theme}
            view={shown.view}
            said={shown.said}
            busy={busy}
            act={(a) => void act(a)}
          />
        </div>
      ) : null}
      <ScreensList project={project} />
    </div>
  );
}

let games = 0;

function started(reply: PlayPageReply, at: number): Shown {
  if (reply.kind === 'started') {
    const { screens, theme, view } = reply;
    return { kind: 'playing', screens, theme, view, said: [], at, game: ++games };
  }
  if (reply.kind === 'refused') return { kind: 'refused', errors: reply.errors.length };
  if (reply.kind === 'failed') return { kind: 'failed', message: reply.message };
  return { kind: 'failed', message: 'The game answered with something else' };
}

/** What stands between the project and a game: scripts not trusted yet, no game, or a game that didn’t load. */
function Readiness({ project }: { project: OpenProject }) {
  const { status } = project.game;
  if (status === 'loaded') return null;
  if (status === 'untrusted') {
    return (
      <div class="logic-trust">
        <p>
          This project came from a zip or a folder, so its scripts haven’t run in this browser. A game is its scripts:
          run them only if you trust where the project came from.
        </p>
        <button type="button" class="button primary" onClick={runScripts}>
          Run its scripts
        </button>
      </div>
    );
  }
  const why =
    status === 'none' || status === 'no-game'
      ? 'A game to play needs scripts/game.ts, which says what it is made of and the mode it starts in. Write it in the Logic panel.'
      : 'The game’s scripts have problems, so it can’t start.';
  return (
    <div>
      <p class="muted">{why}</p>
      <button
        type="button"
        class="button"
        onClick={() => showPanel(status === 'none' || status === 'no-game' ? 'logic' : 'problems')}
      >
        {status === 'none' || status === 'no-game' ? 'Open Logic' : 'Open Problems'}
      </button>
    </div>
  );
}
