/**
 * eb with the ford (M6.1's gate, D73, docs/specs/npcs.md#the-gate): a river crossing with a smith and
 * a ferry-keeper drawn as figures, a warden drawn as the starter kit's pillar and a drover with no
 * talk. eb validates it clean and builds it as format 10, a Talk for each NPC with a talk; played
 * through the session as the stage would play it, the horseshoe goes from the smith's bag to the
 * party's and on to the ferry-keeper's, the warden speaks once the ford's folk are friendly, and a
 * save keeps the bags as they were.
 */
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame } from '@eb/compiler';
import type { Action } from '@eb/core';
import { type Opened, openPack, resumeFrom, saveOf, startPlay } from '@eb/ui/session';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const FORD = resolve(import.meta.dirname, 'fixtures/ford');

async function opened(): Promise<Opened> {
  const compiled = await compileWithGame(folderSource(FORD));
  expect(compiled.diagnostics).toEqual([]);
  const open = openPack(JSON.parse(JSON.stringify(compiled.pack)));
  if (!open.ok) throw new Error(open.message);
  return open.opened;
}

const use = (object: string): Action => ({ type: 'world/use', space: 'ford', object });
const say = (option: string): Action => ({ type: 'dialogue/say', option });
const GO_ON: Action = { type: 'dialogue/go-on' };
const carried = (actor: string) => `inventory.carried(actor: ${actor}, item: horseshoe)`;
const MINE = 'inventory.count(item: horseshoe)';

function played(open: Opened) {
  const play = startPlay(open.setup, 'ford');
  const take = (action: Action) => {
    const step = play.take(action);
    if (!step.accepted) throw new Error(`${JSON.stringify(action)}: ${JSON.stringify(step.beats)}`);
    return step;
  };
  const line = () => (play.state.dialogue as { open?: { talk: string; line: string } }).open;
  const bags = () => [play.view.facts[carried('smith')], play.view.facts[MINE], play.view.facts[carried('ferry')]];
  return { play, take, line, bags };
}

describe('eb with the ford', () => {
  it('builds it as format 10, a Talk for each NPC with a talk and none for the drover', async () => {
    const { pack } = await opened();
    expect(pack.format).toBe(10);
    const talk = (id: string) => ({ label: 'Talk', effects: [{ effect: 'open-talk', talk: id }] });
    expect(pack.world?.uses).toEqual({ ford: { smith: talk('smith'), ferry: talk('ferry'), warden: talk('warden') } });
    expect(pack.world?.start).toBe('ford');
  });

  it('passes the horseshoe from the smith’s bag to the party’s and on to the ferry-keeper’s', async () => {
    const { play, take, line, bags } = played(await opened());
    expect(bags()).toEqual([1, 0, 0]);
    // Bryn's mare is lame, and there is nothing to give her yet.
    take(use('ferry'));
    expect(line()).toEqual({ talk: 'ferry', line: 'lame' });
    take(GO_ON);
    expect(line()).toBeUndefined();
    take(use('smith'));
    expect(line()).toMatchObject({ talk: 'smith', line: 'ask' });
    const step = take(say('take'));
    expect(step.beats.filter((b) => b.type === 'inventory/actor-lost')).toEqual([
      expect.objectContaining({ actor: 'smith', item: 'horseshoe', count: 1 }),
    ]);
    expect(bags()).toEqual([0, 1, 0]);
    take(GO_ON);
    // Ada has nothing more to give: her talk opens on its other line.
    take(use('smith'));
    expect(line()).toMatchObject({ line: 'busy' });
    take(GO_ON);
    take(use('ferry'));
    expect(line()).toMatchObject({ line: 'shoe' });
    take(say('give'));
    expect(bags()).toEqual([0, 0, 1]);
    take(GO_ON);
    expect(play.view.facts['factions.band(faction: ford-folk)']).toBe('friendly');
  });

  it('keeps the warden’s welcome back until the ford’s folk are friendly', async () => {
    const { take, line } = played(await opened());
    take(use('warden'));
    expect(line()).toMatchObject({ talk: 'warden', line: 'watch' });
    take(GO_ON);
    for (const [npc, option] of [
      ['smith', 'take'],
      ['ferry', 'give'],
    ] as const) {
      take(use(npc));
      take(say(option));
      take(GO_ON);
    }
    take(use('warden'));
    expect(line()).toMatchObject({ line: 'welcome' });
  });

  it('refuses a use of the drover, who has no talk, and a walk under a talk', async () => {
    const { play, take } = played(await opened());
    expect(play.take(use('drover')).accepted).toBe(false);
    take(use('smith'));
    expect(play.take({ type: 'world/at', space: 'ford', feet: [1, 0, 1], yaw: 0 }).accepted).toBe(false);
  });

  it('saves the bags as they were, and a load gives them back', async () => {
    const open = await opened();
    const { play, take, bags } = played(open);
    take(use('smith'));
    take(say('take'));
    take(GO_ON);
    const file = saveOf(open, play, { edition: 'test' }, 1000);
    const resumed = resumeFrom(open, JSON.stringify(file));
    if (!resumed.ok) throw new Error(resumed.message);
    expect(bags()).toEqual([0, 1, 0]);
    expect([carried('smith'), MINE, carried('ferry')].map((f) => resumed.play.view.facts[f])).toEqual([0, 1, 0]);
    expect(resumed.play.state.inventory).toEqual(play.state.inventory);
  });

  it('is E077 for an actor placed twice, at the second place', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'ford-'));
    try {
      await cp(FORD, folder, { recursive: true });
      const file = join(folder, 'spaces/ford.json');
      const space = JSON.parse(await readFile(file, 'utf8'));
      space.objects.push({ id: 'smith-again', record: 'actor:smith', at: [5, 0, 5] });
      await writeFile(file, JSON.stringify(space));
      const compiled = await compileWithGame(folderSource(folder));
      expect(compiled.diagnostics.map((d) => [d.code, d.file, d.path])).toEqual([
        ['E077', 'spaces/ford.json', `/objects/${space.objects.length - 1}/record`],
      ]);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
