/**
 * lookAt (M4.5, D55), the designer's game as the frame asks it, its worker's client answered by
 * the Play worker's own jobs in Node: ui/ is never sent, so a broken screen refuses nothing; the
 * project is compiled again only when a file outside ui/ changes, or another project opens; the
 * game is loaded again only when the Play panel's moment moves; and with no game to read, the
 * frame shows samples and says why.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { memorySource } from '@eb/compiler';
import { wantsOf } from '@eb/ui/format';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playJobs } from '../play/jobs.ts';
import { noteMoment, playMoment } from '../play/moment.ts';
import type { PlayPageRequest } from '../play/protocol.ts';
import { gameRevision, type OpenProject } from '../projects/opened.ts';
import type { SentFile } from '../scripts/protocol.ts';
import { lookAt } from './moment.ts';

const sent = vi.hoisted(() => [] as string[]);

vi.mock('../play/playClient.ts', async () => {
  const { playJobs } = await import('../play/jobs.ts');
  return {
    playClient: () => {
      const jobs = playJobs();
      let id = 0;
      return {
        send: (request: { readonly kind: string; readonly files?: readonly SentFile[] }) => {
          const files = (request.files ?? []).map(([path]) => path);
          sent.push(request.kind, ...files.filter((path) => path.startsWith('ui/')).map((path) => `sent ${path}`));
          return jobs({ ...request, id: ++id } as PlayPageRequest);
        },
      };
    },
  };
});

const HUT = resolve(import.meta.dirname, '../../../../tools/cli/test/fixtures/hut');
const hutFiles = Object.fromEntries(
  readdirSync(HUT, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const path = join(entry.parentPath, entry.name);
      return [relative(HUT, path).split('\\').join('/'), new Uint8Array(readFileSync(path))];
    }),
);
const wants = wantsOf([JSON.parse(readFileSync(join(HUT, 'ui/hut.json'), 'utf8'))]);

/** The hut open in the editor, its scripts run, with a screen in ui/ half typed. */
const project = (status = 'loaded'): OpenProject =>
  ({
    source: memorySource({ ...hutFiles, 'ui/broken.json': '{ "main": { "widget": ' }),
    game: { status },
  }) as unknown as OpenProject;

/** The Play panel's game, a day rested, its save kept as the moment. */
async function restADay(): Promise<void> {
  const play = playJobs();
  await play({ id: 1, kind: 'open-files', files: Object.entries(hutFiles) });
  await play({ id: 2, kind: 'start', seed: '1', saving: { edition: 'playtest' }, at: 1 });
  noteMoment(await play({ id: 3, kind: 'act', action: { type: 'hut/rest' }, at: 2 }));
}

beforeEach(() => {
  sent.length = 0;
  playMoment.value = null;
});

describe('lookAt', () => {
  it('compiles without ui/, again only when the game may have changed, and loads only a new moment', async () => {
    const open = project();
    const first = await lookAt(open, wants);
    expect(first.standing).toEqual({ kind: 'moment', what: expect.stringMatching(/^The game’s start, seed 1\./) });
    expect(first.view?.facts['time.day']).toBe(0);
    expect(sent).toEqual(['open-files', 'start', 'look']);

    // An edit to a screen: looked at again, nothing compiled or started again.
    expect((await lookAt(open, wants)).view?.facts['time.day']).toBe(0);
    expect(sent.slice(3)).toEqual(['look']);

    // The Play panel steps: its save is loaded, once.
    await restADay();
    const moved = await lookAt(open, wants);
    expect(moved.standing).toEqual({ kind: 'moment', what: 'As the Play panel left the game, after 1 step.' });
    expect(moved.view?.facts['time.day']).toBe(1);
    await lookAt(open, wants);
    expect(sent.slice(4)).toEqual(['load', 'look', 'look']);

    // A record changed: compiled again and loaded again. So is another project opened.
    gameRevision.value++;
    await lookAt(open, wants);
    expect(sent.slice(7)).toEqual(['open-files', 'load', 'look']);
    await lookAt(project(), wants);
    expect(sent.slice(10)).toEqual(['open-files', 'load', 'look']);
  });

  it('shows samples, and says why, while the game can’t be read', async () => {
    expect(await lookAt(project('untrusted'), wants)).toEqual({
      standing: {
        kind: 'samples',
        why: 'This project’s scripts haven’t run in this browser. The frame shows samples.',
      },
    });
    const broken = { ...project(), source: memorySource({ 'project.json': '{' }) } as OpenProject;
    const refused = await lookAt(broken, wants);
    expect(refused.view).toBeUndefined();
    expect(refused.standing.kind).toBe('samples');
    expect(sent.filter((kind) => kind !== 'open-files')).toEqual([]);
  });
});
