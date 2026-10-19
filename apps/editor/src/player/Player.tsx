/**
 * The player: open a game file, play it through its screens. Each step goes to the worker and
 * its view comes back; the page draws only what the view says.
 */
import type { Action } from '@eb/core';
import { GameScreens } from '@eb/ui';
import type { Screen, Theme } from '@eb/ui/format';
import type { PlayReply, PlayRequest, View } from '@eb/ui/session';
import { useRef, useState } from 'preact/hooks';

type Shown =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly file: string }
  | {
      readonly kind: 'playing';
      readonly name: string;
      readonly screens: Readonly<Record<string, Screen>>;
      readonly theme: Theme | undefined;
      readonly view: View;
    }
  | { readonly kind: 'failed'; readonly message: string };

type Request = PlayRequest extends infer R ? (R extends { id: number } ? Omit<R, 'id'> : never) : never;

/** One worker per game: a new file ends the last game's worker, and whatever it was doing. */
function gameWorker() {
  const worker = new Worker(new URL('./player.worker.ts', import.meta.url), { type: 'module' });
  let next = 0;
  const waiting = new Map<number, (reply: PlayReply) => void>();
  worker.onmessage = ({ data }: MessageEvent<PlayReply>) => {
    waiting.get(data.id)?.(data);
    waiting.delete(data.id);
  };
  return {
    send(request: Request): Promise<PlayReply> {
      const id = next++;
      return new Promise((resolve) => {
        waiting.set(id, resolve);
        worker.postMessage({ ...request, id } as PlayRequest);
      });
    },
    stop: () => worker.terminate(),
  };
}

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

/** A seed for a new game: each game played differs, as a game's own start would. */
function freshSeed(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(2));
  return Array.from(bytes, (n) => n.toString(36)).join('');
}

export function Player() {
  const [shown, setShown] = useState<Shown>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const worker = useRef<ReturnType<typeof gameWorker> | null>(null);
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
    worker.current = gameWorker();
    const reply = await worker.current.send({ kind: 'start', pack, seed: freshSeed() });
    if (reply.kind === 'started') {
      const { name, screens, theme, view } = reply;
      setShown({ kind: 'playing', name, screens, theme, view });
      document.title = `${name} · Engine-Builder`;
    } else setShown({ kind: 'failed', message: reply.kind === 'failed' ? reply.message : 'The game didn’t start.' });
  };
  const act = async (action: Action) => {
    if (shown.kind !== 'playing' || busy || !worker.current) return;
    setBusy(true);
    const reply = await worker.current.send({ kind: 'act', action });
    setBusy(false);
    if (reply.kind === 'stepped') setShown({ ...shown, view: reply.view });
    else if (reply.kind === 'failed') setShown({ kind: 'failed', message: reply.message });
  };
  return (
    <div class="player">
      <header class="player-bar">
        <h1>{shown.kind === 'playing' ? shown.name : 'Play a game'}</h1>
        <button type="button" class="player-button" onClick={() => pickFile((file) => void open(file))}>
          {shown.kind === 'playing' ? 'Open another game' : 'Open a game file'}
        </button>
      </header>
      <main class="player-main">
        {shown.kind === 'idle' ? (
          <p class="player-note">
            Open a game file that Engine-Builder’s Export game wrote: a .game.json file. It plays here, in this browser,
            with nothing sent anywhere, and offline once this page has been opened.
          </p>
        ) : null}
        {shown.kind === 'loading' ? <p class="player-note">Opening {shown.file}…</p> : null}
        {shown.kind === 'failed' ? (
          <p class="player-note player-problem" role="alert">
            {shown.message}
          </p>
        ) : null}
        {shown.kind === 'playing' ? (
          <div class="player-game">
            <GameScreens
              screens={shown.screens}
              theme={shown.theme}
              view={shown.view}
              busy={busy}
              act={(a) => void act(a)}
            />
          </div>
        ) : null}
      </main>
    </div>
  );
}
