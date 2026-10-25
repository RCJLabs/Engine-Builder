/**
 * An exported game (M4.10, D60): its pack, from the page, played inside the play shell (M4.3) with
 * its saves under its edition, in a worker whose script is inside this one. The page draws only
 * what the worker's views say, as the player page does.
 */
import { openStore, type Store } from '@eb/platform';
import type { OpenedGame } from '@eb/ui/shell';
import { Shell } from '@eb/ui/shell';
import { useEffect, useState } from 'preact/hooks';
import { type GameWorker, gameWorker } from '../player/gameWorker.ts';
import PlayerWorker from '../player/player.worker.ts?worker&inline';
import { freshSeed } from '../player/seed.ts';
import { exportedWalk } from '../walk/hosts.ts';
import type { Boot } from './boot.ts';
import { applyGameUpdate, updateReady } from './pwa.ts';

type Shown =
  | { readonly kind: 'opening' }
  | { readonly kind: 'open'; readonly opened: OpenedGame; readonly worker: GameWorker }
  | { readonly kind: 'failed'; readonly message: string };

export function Game({ boot }: { readonly boot: Boot }) {
  const [shown, setShown] = useState<Shown>({ kind: 'opening' });
  const [store, setStore] = useState<Store | undefined>(undefined);
  useEffect(() => {
    void openStore().then(setStore);
    const worker = gameWorker(new PlayerWorker());
    worker
      .send({ kind: 'open', pack: boot.pack })
      .then((reply) => {
        if (reply.kind === 'opened') setShown({ kind: 'open', opened: reply, worker });
        else setShown({ kind: 'failed', message: reply.kind === 'failed' ? reply.message : 'The game didn’t open.' });
      })
      .catch((error: Error) => setShown({ kind: 'failed', message: error.message }));
    return () => worker.stop();
  }, [boot]);
  if (shown.kind === 'failed') {
    return (
      <p class="game-note" role="alert">
        {shown.message}
      </p>
    );
  }
  if (shown.kind === 'opening' || !store) return <p class="game-note">Opening…</p>;
  return (
    <>
      {/* The page's name for a screen reader's headings, as the player page's bar gives it. */}
      <h1 class="game-name">{shown.opened.name}</h1>
      <Shell
        opened={shown.opened}
        send={shown.worker.send}
        edition={boot.edition}
        store={store}
        seed={freshSeed}
        history
        crashes
        spaces={exportedWalk(shown.opened.world, boot.walk, boot.nav)}
        {...(boot.sw ? { update: { ready: updateReady.value, apply: applyGameUpdate } } : {})}
      />
    </>
  );
}
