/**
 * The shell's state and what it does (M4.3, D53, docs/specs/shell.md): which of its screens shows,
 * the slots, and the game in play. The worker makes a save after each step and this keeps it in the
 * slot in play before the next step can go, so a reload never rolls a step again.
 */
import type { Action, LoadReport, SaveFile } from '@eb/core';
import { createSaves, requestPersistence } from '@eb/platform';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Said } from '../format/feedback.ts';
import type { View } from '../session/types.ts';
import { continueSlot, DAILY_SLOT, dailyNumber, dailySeed, type SlotInfo, slotInfo, slotName } from './slots.ts';
import type { ShellProps } from './types.ts';

export type ShellScreenName = 'title' | 'new' | 'saves' | 'settings' | 'pause' | 'stopped';

export interface InPlay {
  readonly slot: string;
  readonly daily: number | undefined;
  readonly view: View;
  readonly said: readonly Said[];
}

type Read =
  | { readonly ok: true; readonly file: SaveFile; readonly report: LoadReport; readonly view: View }
  | { readonly ok: false; readonly problem: 'crashed'; readonly message: string };

/** What a load changed, in words, when an update or a backup was involved. */
function loadNotice(result: { fromBackup?: true; quarantined?: string; report: LoadReport }): string | undefined {
  if (result.fromBackup) return 'The save wouldn’t load, so its backup did. The broken save is set aside in Saves.';
  const { report } = result;
  if (!report.differs && report.skipped === 0) return undefined;
  const skipped = report.skipped > 0 ? `, and ${report.skipped} of its steps no longer apply` : '';
  return `This save is from another version of the game${skipped}. The save as it was is set aside in Saves.`;
}

export function useShell(props: ShellProps) {
  const { opened, send, edition, store } = props;
  const now = props.now ?? (() => new Date());
  const [screen, setScreen] = useState<ShellScreenName | undefined>('title');
  const [slots, setSlots] = useState<readonly SlotInfo[] | undefined>(undefined);
  const [play, setPlay] = useState<InPlay | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [stopped, setStopped] = useState<string | undefined>(undefined);
  const persisted = useRef(false);
  const saves = useMemo(() => createSaves({ store, game: opened.game, edition }), [store, opened.game, edition]);
  const refresh = async () => setSlots((await saves.list()).map(slotInfo));
  useEffect(() => {
    void refresh();
  }, [saves]);

  // Kept before the next step can go; a write that fails says so and play goes on.
  const keep = async (slot: string, save: SaveFile) => {
    const written = await saves.write(slot, save);
    if (!written.ok) return setNotice(`Not saved: ${written.message}`);
    setNotice((was) => (was?.startsWith('Not saved') ? undefined : was));
    if (!persisted.current) {
      persisted.current = true;
      void requestPersistence();
    }
  };
  const stop = (message: string) => {
    setStopped(message);
    setScreen('stopped');
  };
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      stop(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const begin = (slot: string, daily?: number) =>
    run(async () => {
      const seed = daily === undefined ? props.seed() : dailySeed(daily);
      const reply = await send({ kind: 'start', seed, saving: { edition, daily }, at: now().getTime() });
      if (reply.kind !== 'started') return stop(reply.kind === 'failed' ? reply.message : 'The game didn’t start');
      await keep(slot, reply.save);
      setPlay({ slot, daily, view: reply.view, said: [] });
      setScreen(undefined);
    });

  const resume = (slot: string, daily?: number) =>
    run(async () => {
      const read = async (raw: string): Promise<Read> => {
        const reply = await send({ kind: 'load', raw, saving: { edition, daily }, at: now().getTime() });
        if (reply.kind === 'loaded') return reply.ok ? reply : { ...reply, problem: 'crashed' as const };
        return { ok: false, problem: 'crashed', message: reply.kind === 'failed' ? reply.message : 'No answer' };
      };
      const loaded = await saves.loadWith(slot, opened.build, read);
      if (!loaded.ok) {
        setNotice(`${slotName(slot)} couldn’t be loaded: ${loaded.message} It is kept as it was.`);
        return refresh();
      }
      setPlay({ slot, daily, view: loaded.view, said: [] });
      setNotice(loadNotice(loaded));
      setScreen(undefined);
    });

  const act = (action: Action) => {
    if (!play || busy) return;
    void run(async () => {
      const reply = await send({ kind: 'act', action, at: now().getTime() });
      if (reply.kind !== 'stepped') return stop(reply.kind === 'failed' ? reply.message : 'The game stopped');
      if (reply.save) await keep(play.slot, reply.save);
      // In the one render with the view, so the buttons it draws are enabled as focus comes back to one.
      setBusy(false);
      setPlay({ ...play, view: reply.view, said: reply.said });
    });
  };

  const daily = () => {
    const n = dailyNumber(now());
    const held = slots?.find((info) => info.slot === DAILY_SLOT);
    return held?.readable && held.daily === n ? resume(DAILY_SLOT, n) : begin(DAILY_SLOT, n);
  };

  // The slots are read again whenever a screen that lists them opens: play writes them every step.
  const show = (next: ShellScreenName | undefined) => {
    if (next === 'title' || next === 'new' || next === 'saves') void refresh();
    setScreen(next);
  };

  const quit = () => {
    setPlay(undefined);
    setNotice(undefined);
    setScreen('title');
    void refresh();
  };

  return {
    saves,
    screen,
    show,
    slots,
    play,
    busy,
    notice,
    setNotice,
    stopped,
    refresh,
    continueSlot: slots ? continueSlot(slots) : undefined,
    begin,
    resume,
    act,
    daily,
    dailyToday: () => dailyNumber(now()),
    quit,
  };
}

export type ShellState = ReturnType<typeof useShell>;
