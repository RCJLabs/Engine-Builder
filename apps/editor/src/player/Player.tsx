/**
 * The player: open a game file, play it inside the play shell (M4.3), which keeps its saves in
 * this browser under edition "play". Each step goes to the worker and its view and save come back;
 * the page draws only what the view says.
 */
import { openStore, type Store } from '@eb/platform';
import type { OpenedGame } from '@eb/ui/shell';
import { Shell } from '@eb/ui/shell';
import { useEffect, useRef, useState } from 'preact/hooks';
import { editorWalk } from '../walk/editorWalk.ts';
import type { GameWorker } from './gameWorker.ts';
import { playerWorker } from './playerWorker.ts';
import { applyPlayerUpdate, updateReady } from './pwa.ts';
import { freshSeed } from './seed.ts';

type Shown =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly file: string }
  | { readonly kind: 'open'; readonly opened: OpenedGame; readonly worker: GameWorker; readonly n: number }
  | { readonly kind: 'failed'; readonly message: string };

/** The device's file picker, for one JSON file: an input made when asked, so none sits in the page. */
function pickFile(then: (file: File) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) then(file);
  });
  input.click();
}

let opens = 0;

export function Player() {
  const [shown, setShown] = useState<Shown>({ kind: 'idle' });
  const [store, setStore] = useState<Store | undefined>(undefined);
  const worker = useRef<GameWorker | null>(null);
  useEffect(() => {
    void openStore().then(setStore);
  }, []);
  const open = async (file: File) => {
    setShown({ kind: 'loading', file: file.name });
    let pack: unknown;
    try {
      pack = JSON.parse(await file.text());
    } catch {
      setShown({ kind: 'failed', message: `${file.name} isn’t a game file: it isn’t JSON.` });
      return;
    }
    worker.current?.stop();
    const next = playerWorker();
    worker.current = next;
    const reply = await next
      .send({ kind: 'open', pack })
      .catch((error: Error) => ({ kind: 'failed', message: error.message }) as const);
    if (reply.kind === 'opened') {
      setShown({ kind: 'open', opened: reply, worker: next, n: ++opens });
      document.title = `${reply.name} · Engine-Builder`;
    } else setShown({ kind: 'failed', message: reply.kind === 'failed' ? reply.message : 'The game didn’t open.' });
  };
  return (
    <div class="player">
      <header class="player-bar">
        <h1>{shown.kind === 'open' ? shown.opened.name : 'Play a game'}</h1>
        <button type="button" class="player-button" onClick={() => pickFile((file) => void open(file))}>
          {shown.kind === 'open' ? 'Open another game' : 'Open a game file'}
        </button>
      </header>
      <main class="player-main">
        {shown.kind === 'idle' ? (
          <p class="player-note">
            Open a game file that Engine-Builder’s Export game wrote: a .game.json file. It plays here, in this browser,
            with nothing sent anywhere, and offline once this page has been opened. Its saves stay in this browser.
          </p>
        ) : null}
        {shown.kind === 'loading' ? <p class="player-note">Opening {shown.file}…</p> : null}
        {shown.kind === 'failed' ? (
          <p class="player-note player-problem" role="alert">
            {shown.message}
          </p>
        ) : null}
        {shown.kind === 'open' && store ? (
          <div class="player-game">
            <Shell
              key={shown.n}
              opened={shown.opened}
              send={shown.worker.send}
              edition="play"
              store={store}
              seed={freshSeed}
              history
              crashes
              update={{ ready: updateReady.value, apply: applyPlayerUpdate }}
              spaces={editorWalk(shown.opened.world)}
            />
          </div>
        ) : null}
      </main>
    </div>
  );
}
