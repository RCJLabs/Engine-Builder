/**
 * The Play panel's debug tools on the page (M4.9, D59): what they last heard from the worker, and
 * the requests they send it through the Play panel's one client, so a debug step goes between two
 * of the game's steps. A move's view and save go to the shell as `moved`, which keeps it in its slot.
 */
import type { Effect, EffectPreview } from '@eb/core';
import type { Moved, OpenedGame } from '@eb/ui/shell';
import { signal } from '@preact/signals';
import type { SentFile } from '../../scripts/protocol.ts';
import { playing } from '../client.ts';
import { noteMoment } from '../moment.ts';
import type { PlayPageReply } from '../protocol.ts';
import type { DebugLook, ReplayReport } from './protocol.ts';

export const debugLook = signal<DebugLook | null>(null);
export const debugMoved = signal<Moved | undefined>(undefined);
/** What the last request came to, for the panel's status line: refused, failed, or done. */
export const debugSaid = signal('');
export const debugBusy = signal(false);
export const debugPreviews = signal<readonly EffectPreview[] | null>(null);
export const replayReport = signal<ReplayReport | null>(null);
/** The edited project's game after a Replay, which the shell draws from (its screens and build). */
export const replayedGame = signal<{ readonly opened: OpenedGame; readonly at: number } | null>(null);

let moves = 0;

/** Forgets everything heard: a new game is starting. */
export function resetDebug(): void {
  debugLook.value = null;
  debugMoved.value = undefined;
  debugSaid.value = '';
  debugPreviews.value = null;
  replayReport.value = null;
  replayedGame.value = null;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function heard(reply: PlayPageReply, said: string): boolean {
  if ('look' in reply) debugLook.value = reply.look;
  if (reply.kind === 'debug-moved' || reply.kind === 'debug-replayed') {
    noteMoment(reply);
    debugMoved.value = { n: ++moves, view: reply.view, save: reply.save };
    debugSaid.value = said;
    return true;
  }
  if (reply.kind === 'debug-refused') debugSaid.value = `Refused: ${reply.reason}`;
  else if (reply.kind === 'failed') debugSaid.value = reply.message;
  else if (reply.kind === 'refused') {
    const n = reply.errors.length;
    debugSaid.value = `The project has ${n === 1 ? 'an error' : `${n} errors`}: fix ${n === 1 ? 'it' : 'them'} to replay. See Problems.`;
  }
  return false;
}

async function ask(request: Parameters<typeof playing.send>[0], said = ''): Promise<PlayPageReply | undefined> {
  debugBusy.value = true;
  try {
    const reply = await playing.send(request);
    heard(reply, said);
    return reply;
  } catch (error) {
    debugSaid.value = message(error);
    return undefined;
  } finally {
    debugBusy.value = false;
  }
}

/** The look again, after a step the shell took: no status line, nothing moved. */
export async function refreshLook(): Promise<void> {
  try {
    const reply = await playing.send({ kind: 'debug-look' });
    if (reply.kind === 'debug-looked') debugLook.value = reply.look;
  } catch {
    // The game stopped; the shell says why.
  }
}

export const runEffects = (effects: readonly Effect[], said: string) =>
  ask({ kind: 'debug-run', effects, at: Date.now() }, said);

export async function previewEffects(effects: readonly Effect[]): Promise<void> {
  const reply = await ask({ kind: 'debug-preview', effects });
  debugPreviews.value = reply?.kind === 'debug-previewed' ? reply.previews : null;
}

export const stepBack = () => ask({ kind: 'debug-back', at: Date.now() }, 'Stepped back.');
export const stepForward = () => ask({ kind: 'debug-forward', at: Date.now() }, 'Stepped forward.');

export async function keepState(): Promise<PlayPageReply | undefined> {
  return ask({ kind: 'debug-keep', at: Date.now() });
}

export const restoreState = (raw: string, name: string) =>
  ask({ kind: 'debug-restore', raw, at: Date.now() }, `Restored ${name}.`);

/** Replay on the project's files now; the shell then draws the edited game. */
export async function replay(files: readonly SentFile[], revision: number): Promise<void> {
  replayReport.value = null;
  const reply = await ask({ kind: 'debug-replay', files, at: Date.now() }, 'Replayed.');
  if (reply?.kind !== 'debug-replayed') return;
  replayReport.value = reply.report;
  replayedGame.value = { opened: reply.opened, at: revision };
}
