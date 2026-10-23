/**
 * Where the Play panel's game stands (M4.5, D55): its last save in this session, kept as the play
 * shell's saves are, so the designer's own game can be loaded to the same moment and the frame
 * draw the screen being designed as the Play panel left the game.
 */
import type { SaveFile } from '@eb/core';
import { signal } from '@preact/signals';
import type { PlayPageReply } from './protocol.ts';

export interface PlayMoment {
  /** The save as its slot holds it. */
  readonly raw: string;
  /** How many steps the game had taken. */
  readonly turn: number;
}

export const playMoment = signal<PlayMoment | null>(null);

/** Keeps the save a reply carries: a game started, loaded or stepped, or moved by the debug tools (M4.9). */
export function noteMoment(reply: PlayPageReply): void {
  const save: SaveFile | undefined =
    reply.kind === 'started' ||
    reply.kind === 'stepped' ||
    reply.kind === 'debug-moved' ||
    reply.kind === 'debug-replayed'
      ? reply.save
      : reply.kind === 'loaded' && reply.ok
        ? reply.file
        : undefined;
  if (save === undefined || !('view' in reply)) return;
  playMoment.value = { raw: JSON.stringify(save), turn: reply.view.turn };
}
