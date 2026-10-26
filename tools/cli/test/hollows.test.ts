/**
 * eb with the hollows (M6.7's gate, D79, docs/specs/radiant.md#the-gate): a green with a board and a
 * post, the barrow a door away and the mine two, through the hall, each cave with a cache and a
 * bandit. eb validates it clean and builds it as format 15. Played through the session as the stage
 * would play it: Supplies goes to the barrow's cache, then the mine's through its prefab, then waits
 * with both taken; the bounty to the barrow's bandit, never its hermit, then the mine's, then waits
 * with both felled; each run's markers name the cave, and a save mid-run loads to the same slots.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { compileProject, compileWithGame, memorySource } from '@eb/compiler';
import { type Action, debugRun } from '@eb/core';
import { type Opened, openPack, type Play, resumeFrom, saveOf, startPlay } from '@eb/ui/session';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const HOLLOWS = resolve(import.meta.dirname, 'fixtures/hollows');

function filesOf(root: string): Record<string, Uint8Array> {
  const files: Record<string, Uint8Array> = {};
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files[relative(root, path).split('\\').join('/')] = readFileSync(path);
    }
  };
  walk(root);
  return files;
}

async function opened(): Promise<Opened> {
  const compiled = await compileWithGame(folderSource(HOLLOWS));
  expect(compiled.diagnostics).toEqual([]);
  const open = openPack(JSON.parse(JSON.stringify(compiled.pack)), { debug: true });
  if (!open.ok) throw new Error(open.message);
  return open.opened;
}

const use = (space: string, object: string): Action => ({ type: 'world/use', space, object });
const zone = (space: string, object: string): Action => ({ type: 'world/trigger', space, object });
// A fall as the fighting kit lands one, heard: the debug step raises no event of its own, so an item given
// beside it is what the quests kit hears, as it would hear fighting/fell.
const fell = (actor: string) =>
  debugRun([
    { effect: 'fall', actor },
    { effect: 'give-item', item: 'supplies' },
  ]);

function taker(play: Play) {
  return (action: Action) => {
    const step = play.take(action);
    if (!step.accepted) throw new Error(`${JSON.stringify(action)}: ${JSON.stringify(step.beats)}`);
    return step;
  };
}

const entry = (play: Play, quest: string) =>
  (play.state.quests as { quests: Record<string, { state: string; slots?: Record<string, string> }> }).quests[quest];
const said = (play: Play) => (play.view.world?.markers ?? []).map((m) => [m.objective, m.text, m.target]);

describe('eb with the hollows', () => {
  it('builds it as format 15: every space’s tags, each tagged object’s through prefabs and overrides, the actors', async () => {
    const { pack } = await opened();
    expect(pack.format).toBe(15);
    expect(pack.world?.places).toEqual({
      spaces: {
        barrow: { tags: ['cave'] },
        green: { tags: ['village'] },
        hall: { tags: [] },
        mine: { tags: ['cave'] },
      },
      objects: {
        barrow: { cache: { tags: ['cache'], name: 'Crate' }, wick: { tags: ['chief'], name: 'Wick' } },
        mine: {
          'empty/chest': { tags: ['empty'], name: 'Old chest' },
          'stash/chest': { tags: ['cache'], name: 'Old chest' },
        },
      },
    });
    expect(Object.keys(pack.world?.actors ?? {}).sort()).toEqual(['moss', 'rusk', 'wick']);
  });

  it('sends Supplies to the nearest cave with a cache left, then the next, then waits', async () => {
    const open = await opened();
    const play = startPlay(open.setup, 'out');
    const take = taker(play);
    take(use('green', 'board'));
    expect(entry(play, 'supplies')?.slots).toEqual({ cave: 'barrow', cache: 'cache' });
    expect(said(play)).toEqual([
      ['cache', 'Take the supplies from the Crate in The barrow', { space: 'barrow', object: 'cache' }],
    ]);
    take(use('green', 'barrow-door'));
    take(use('barrow', 'cache'));
    expect(entry(play, 'supplies')?.state).toBe('done');
    take(zone('barrow', 'way-out'));
    // The barrow was the last run's: the mine, two doors away, through the prefab's chest.
    take(use('green', 'board'));
    expect(entry(play, 'supplies')?.slots).toEqual({ cave: 'mine', cache: 'stash/chest' });
    expect(said(play)).toEqual([
      ['cache', 'Take the supplies from the Old chest in The mine', { space: 'mine', object: 'stash/chest' }],
    ]);
    take(use('green', 'hall-door'));
    take(use('hall', 'mine-door'));
    take(use('mine', 'stash/chest'));
    expect(entry(play, 'supplies')?.state).toBe('done');
    take(zone('mine', 'way-out'));
    // Both caches taken, and nothing comes back: the board can't start a third run.
    const third = play.take(use('green', 'board'));
    expect(third.accepted).toBe(false);
    expect(JSON.stringify(third.beats)).toContain('unfilled');
    expect(play.view.facts['inventory.count(item: supplies)']).toBe(2);
  });

  it('takes the nearest from where the player is: from the hall, the mine', async () => {
    const open = await opened();
    const play = startPlay(open.setup, 'out');
    const take = taker(play);
    take(use('green', 'hall-door'));
    take(debugRun([{ effect: 'start-quest', quest: 'supplies' }]));
    expect(entry(play, 'supplies')?.slots).toEqual({ cave: 'mine', cache: 'stash/chest' });
  });

  it('sends the bounty to a bandit in the nearest cave, never the hermit, then the next, then waits', async () => {
    const open = await opened();
    const play = startPlay(open.setup, 'out');
    const take = taker(play);
    take(use('green', 'post'));
    expect(entry(play, 'bounty')?.slots).toEqual({ den: 'barrow', bandit: 'wick' });
    expect(said(play)).toEqual([['bandit', 'Deal with Wick in The barrow', { actor: 'wick' }]]);
    take(fell('wick'));
    expect(entry(play, 'bounty')?.state).toBe('done');
    take(use('green', 'post'));
    expect(entry(play, 'bounty')?.slots).toEqual({ den: 'mine', bandit: 'rusk' });
    take(fell('rusk'));
    expect(entry(play, 'bounty')?.state).toBe('done');
    // Moss stands in the barrow still, but is no bandit: nothing is left to fill the slot.
    expect(play.take(use('green', 'post')).accepted).toBe(false);
  });

  it('saves a run’s slots, and a load puts them back', async () => {
    const open = await opened();
    const play = startPlay(open.setup, 'out');
    const take = taker(play);
    take(use('green', 'board'));
    take(use('green', 'barrow-door'));
    take(use('barrow', 'cache'));
    take(zone('barrow', 'way-out'));
    take(use('green', 'board'));
    const file = saveOf(open, play, { edition: 'test' }, 1000);
    const resumed = resumeFrom(open, JSON.stringify(file));
    if (!resumed.ok) throw new Error(resumed.message);
    expect(entry(resumed.play, 'supplies')?.slots).toEqual({ cave: 'mine', cache: 'stash/chest' });
    expect(said(resumed.play)).toEqual(said(play));
  });

  it('breaks once each for E088, W127 and E086’s slots', async () => {
    const quest = (slots: unknown[], target?: unknown) =>
      JSON.stringify({
        name: 'Errand',
        slots,
        stages: [
          {
            id: 'go',
            objectives: [
              { id: 'it', text: 'It', 'done-when': 'world.in(space: green)', ...(target ? { target } : {}) },
            ],
          },
        ],
      });
    const codes = async (value: string) => {
      const files = { ...filesOf(HOLLOWS), 'records/quest/errand.json': new TextEncoder().encode(value) };
      const compiled = await compileProject(memorySource(files), []);
      return compiled.diagnostics
        .filter((d) => d.file === 'records/quest/errand.json' && ['E086', 'E088', 'W127'].includes(d.code))
        .map((d) => `${d.code} ${d.path}`);
    };
    const cave = { id: 'cave', type: 'space', tags: ['cave'] };
    expect(await codes(quest([cave, { id: 'cache', type: 'object', tags: ['cache'] }]))).toEqual(['E088 /slots/1/in']);
    expect(await codes(quest([{ id: 'den', type: 'space', tags: ['den'] }]))).toEqual(['W127 /slots/0/tags']);
    expect(await codes(quest([cave], { space: 'barrow', object: '@cave' }))).toEqual([
      'E086 /stages/0/objectives/0/target/object',
    ]);
    expect(
      await codes(
        quest([cave, { id: 'cache', type: 'object', in: '@cave', tags: ['cache'] }], {
          space: '@cave',
          object: '@cache',
        }),
      ),
    ).toEqual([]);
  });
});
