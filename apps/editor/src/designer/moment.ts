/**
 * The designer's game (M4.5, D55, docs/specs/designer.md#what-the-frame-draws): a copy of the Play
 * worker of its own, so a game in the Play panel is never disturbed. The project is compiled
 * without ui/, so a half-made screen never stops it, and again only when a file outside ui/ changes.
 * It is loaded to the Play panel's last save, or started from seed 1, then looked at with the
 * wants of the screen being designed after each edit, taking no step.
 */
import type { View, Wants } from '@eb/ui/session';
import { playMoment } from '../play/moment.ts';
import { playClient } from '../play/playClient.ts';
import type { PlayPageReply } from '../play/protocol.ts';
import { gameRevision, type OpenProject } from '../projects/opened.ts';
import type { GameStatus } from '../scripts/gameState.ts';
import { playFiles } from '../scripts/playFiles.ts';

/** What the frame draws from, in words above it. */
export type Standing =
  | { readonly kind: 'samples'; readonly why: string }
  | { readonly kind: 'moment'; readonly what: string };

export interface Looked {
  readonly standing: Standing;
  /** The moment's view for the wants; none when the frame shows samples alone. */
  readonly view?: View;
}

const SAVING = { edition: 'design' } as const;
const client = playClient();
let compiled: { readonly source: unknown; readonly revision: number } | null = null;
let loadedFrom: string | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** One request at a time, in the order asked: the worker holds one game. */
function serial<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

const samples = (why: string): Standing => ({ kind: 'samples', why: `${why} The frame shows samples.` });

/** Why there is no game to read, for each state of the project's scripts but loaded. */
export function whyNoGame(status: GameStatus): string {
  if (status === 'untrusted') return 'This project’s scripts haven’t run in this browser.';
  if (status === 'none' || status === 'no-game') return 'The project has no game yet: scripts/game.ts makes one.';
  return 'The game’s scripts have problems.';
}

function failure(reply: PlayPageReply): Standing {
  if (reply.kind === 'refused') return samples('The project has errors outside ui/: see Problems.');
  if (reply.kind === 'failed') return samples(`The game stopped: ${reply.message}.`);
  if (reply.kind === 'loaded' && !reply.ok) return samples(`The Play panel’s save didn’t load: ${reply.message}.`);
  return samples('The game answered with something else.');
}

/** Compiles the project without ui/ when a file outside it has changed since; undefined once it is open. */
async function compile(project: OpenProject): Promise<Standing | undefined> {
  const revision = gameRevision.value;
  if (compiled?.source === project.source && compiled.revision === revision) return undefined;
  compiled = null;
  loadedFrom = null;
  const files = (await playFiles(project.source)).filter(([path]) => !path.startsWith('ui/'));
  const reply = await client.send({ kind: 'open-files', files });
  if (reply.kind !== 'opened') return failure(reply);
  compiled = { source: project.source, revision };
  return undefined;
}

/** The game brought to the moment: the Play panel's last save, or the start. */
async function arrive(): Promise<Standing> {
  const moment = playMoment.value;
  const from = moment?.raw ?? 'start';
  if (loadedFrom !== from) {
    const reply = moment
      ? await client.send({ kind: 'load', raw: moment.raw, saving: SAVING, at: 0 })
      : await client.send({ kind: 'start', seed: '1', saving: SAVING, at: 0 });
    if (reply.kind !== 'started' && !(reply.kind === 'loaded' && reply.ok)) return failure(reply);
    loadedFrom = from;
  }
  const steps = moment?.turn ?? 0;
  return {
    kind: 'moment',
    what: moment
      ? `As the Play panel left the game, after ${steps} ${steps === 1 ? 'step' : 'steps'}.`
      : 'The game’s start, seed 1. Play the game to design from another moment.',
  };
}

/** The moment's view for a screen's wants, or why the frame shows samples. */
export function lookAt(project: OpenProject, wants: Wants): Promise<Looked> {
  return serial(async (): Promise<Looked> => {
    if (project.game.status !== 'loaded') return { standing: samples(whyNoGame(project.game.status)) };
    try {
      const refused = await compile(project);
      if (refused) return { standing: refused };
      const standing = await arrive();
      if (standing.kind !== 'moment') return { standing };
      const reply = await client.send({ kind: 'look', wants });
      return reply.kind === 'looked' ? { standing, view: reply.view } : { standing: failure(reply) };
    } catch (error) {
      // The worker was stopped (a script ran past its time): the next look starts it again.
      compiled = null;
      return { standing: samples(error instanceof Error ? error.message : String(error)) };
    }
  });
}
