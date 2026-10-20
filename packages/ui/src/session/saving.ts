/**
 * A play's save, made in the worker after each step (M4.3, D53, docs/specs/shell.md#saving): the
 * page only keeps it, so the worker never touches storage. Its summary is what a slot shows.
 */
import { createSaveFile, type SaveFile } from '@eb/core';
import { MAX_LOG } from '@eb/platform';
import { fill } from '../render/fill.ts';
import type { Opened } from './fromPack.ts';
import type { Play } from './play.ts';

/** Where the page keeps a play's saves, and the Daily it is, if one. */
export interface Saving {
  readonly edition: string;
  readonly daily?: number;
}

/** The play's save as of now, then the play compacted once its log reaches MAX_LOG, as writeSession does. */
export function saveOf(opened: Opened, play: Play, saving: Saving, at: number): SaveFile {
  const { view } = play;
  const line = opened.shell?.['slot-line'];
  const summary = {
    turn: view.turn,
    ...(line !== undefined ? { line: fill(line, view) } : {}),
    ...(saving.daily !== undefined ? { daily: saving.daily } : {}),
  };
  const { id } = opened.pack.project;
  const file = createSaveFile(play.run, {
    game: id,
    edition: saving.edition,
    build: opened.pack.hash,
    savedAt: at,
    summary,
  });
  // Compacted after the save is made: the next save holds the state now as its snapshot.
  if (file.log.length >= MAX_LOG) play.compact();
  return file;
}
