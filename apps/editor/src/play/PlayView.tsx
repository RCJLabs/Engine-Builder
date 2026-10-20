/**
 * The open project played through its screens (M4.1, D51): compiled into the pack Export game
 * writes, then opened in the Play worker inside the play shell (M4.3), whose saves are kept under
 * edition "playtest", apart from the player page's. New starts with the seed typed here. Nothing
 * plays while the project has errors, as nothing exports. Loaded when a project is first open,
 * with the renderer.
 */
import { openStore, type Store } from '@eb/platform';
import type { PlayReply } from '@eb/ui/session';
import type { OpenedGame, ShellRequest } from '@eb/ui/shell';
import { Shell } from '@eb/ui/shell';
import { useEffect, useState } from 'preact/hooks';
import { useUniqueId } from '../app/ids.ts';
import { showPanel } from '../app/panelControl.ts';
import { problemCount } from '../problems/count.ts';
import { type OpenProject, revision, runScripts } from '../projects/opened.ts';
import { playFiles } from '../scripts/playFiles.ts';
import { noteMoment } from './moment.ts';
import { playClient } from './playClient.ts';
import type { PlayPageReply } from './protocol.ts';
import { ScreensList } from './ScreensList.tsx';
import '../styles/logic.css';
import '../styles/play.css';

const client = playClient();
// The shell's requests are the session's own; the Play worker answers them as the player's does.
// Each save is kept as the moment the designer draws (M4.5).
const send = (request: ShellRequest) =>
  client.send(request).then((reply) => {
    noteMoment(reply);
    return reply as PlayReply;
  });

type Shown =
  | { readonly kind: 'idle' }
  | { readonly kind: 'starting' }
  | { readonly kind: 'open'; readonly opened: OpenedGame; readonly at: number; readonly n: number }
  | { readonly kind: 'refused'; readonly errors: number }
  | { readonly kind: 'failed'; readonly message: string };

const failed = (error: unknown): Shown => ({
  kind: 'failed',
  message: error instanceof Error ? error.message : String(error),
});

let opens = 0;

export function PlayView({ project }: { project: OpenProject }) {
  const [shown, setShown] = useState<Shown>({ kind: 'idle' });
  const [seed, setSeed] = useState('1');
  const [store, setStore] = useState<Store | undefined>(undefined);
  const seedId = useUniqueId();
  const errors = problemCount.value?.errors ?? 0;
  const ready = project.game.status === 'loaded';
  useEffect(() => {
    void openStore().then(setStore);
  }, []);
  const start = async () => {
    setShown({ kind: 'starting' });
    const at = revision.value;
    try {
      const reply = await client.send({ kind: 'open-files', files: await playFiles(project.source) });
      setShown(opened(reply, at));
    } catch (error) {
      setShown(failed(error));
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
          {shown.kind === 'open' ? 'Start again' : 'Play'}
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
        {shown.kind === 'open' && shown.at !== revision.value ? (
          <p class="muted">The project has changed since this game started: start again to play it as it is now.</p>
        ) : null}
      </div>
      {shown.kind === 'open' && store ? (
        <div class="play-game">
          <Shell key={shown.n} opened={shown.opened} send={send} edition="playtest" store={store} seed={() => seed} />
        </div>
      ) : null}
      <ScreensList project={project} />
    </div>
  );
}

function opened(reply: PlayPageReply, at: number): Shown {
  if (reply.kind === 'opened') return { kind: 'open', opened: reply, at, n: ++opens };
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
