/**
 * eb with the camp (M6.4's gate, D76, docs/specs/combat.md#the-gate): three bandits who wander until
 * alerted and then attack, Rook and Crow with swords and Wren with a bow, and a hero with a sword, a
 * bow and ten arrows. eb builds it as format 13 with its fighting; played through the session as the
 * stage would play it, a blow alerts each bandit, two strike while the third waits its turn, each
 * falls, each body is searched, a shot takes an arrow, and in a second run the hero falls and the
 * game stops, the save before it loading as it was. Fighting left out, its player placed as an NPC,
 * and an attack with nothing worn each break it.
 */
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { compileWithGame } from '@eb/compiler';
import type { Action } from '@eb/core';
import { type Opened, openPack, resumeFrom, saveOf, startPlay } from '@eb/ui/session';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const CAMP = resolve(import.meta.dirname, 'fixtures/camp');
const BANDITS = ['rook', 'crow', 'wren'];

async function opened(): Promise<Opened> {
  const compiled = await compileWithGame(folderSource(CAMP));
  expect(compiled.diagnostics).toEqual([]);
  const open = openPack(JSON.parse(JSON.stringify(compiled.pack)));
  if (!open.ok) throw new Error(open.message);
  return open.opened;
}

function played(open: Opened) {
  const play = startPlay(open.setup, 'camp');
  const take = (action: Action) => {
    const step = play.act(action);
    if (!step.accepted) throw new Error(`${JSON.stringify(action)}: ${JSON.stringify(step.beats)}`);
    return step;
  };
  const refused = (action: Action) => {
    const step = play.act(action);
    return step.accepted ? undefined : (step.beats[0] as { reason?: string } | undefined)?.reason;
  };
  const hit = (by: string, on: string, weapon: string) => take({ type: 'fighting/hit', by, on, weapon });
  const fight = () => play.view.world?.fight;
  const health = (actor: string) => play.view.facts[`stats.current(actor: ${actor}, stat: health)`];
  return { play, take, refused, hit, fight, health };
}

describe('eb with the camp', () => {
  it('builds it as format 13, its fighting, the navmesh and the three bandits', async () => {
    const { pack } = await opened();
    expect(pack.format).toBe(13);
    expect(pack.project.fighting).toEqual({ player: 'hero', combat: 'blades' });
    expect(Object.keys(pack.world?.actors ?? {}).sort()).toEqual(['crow', 'rook', 'wren']);
    expect(Object.keys(pack.records.item ?? {}).sort()).toEqual(['arrow', 'bow', 'coin', 'sword']);
  });

  it('tells the stage who wields what, the defaults filled in, and that no one has fallen', async () => {
    const { fight } = played(await opened());
    expect(fight()?.player).toBe('hero');
    expect(fight()?.weapons.hero).toMatchObject({ item: 'sword', kind: 'melee', damage: 4, reach: 2, arc: 100 });
    expect(fight()?.weapons.wren).toMatchObject({ item: 'bow', kind: 'ranged', range: 30, draw: 500, ammo: 'arrow' });
    expect(fight()?.fallen).toEqual([]);
    expect(fight()?.engaged).toEqual([]);
  });

  it('fights it out: two bandits strike while the third waits, each falls and is searched', async () => {
    const { play, take, refused, hit, fight, health } = played(await opened());
    for (const bandit of BANDITS) hit('hero', bandit, 'sword');
    // Each blow alerted its bandit, who attacks; Wren waits its turn behind Rook and Crow.
    expect(fight()?.engaged).toEqual(['crow', 'rook']);
    expect(refused({ type: 'fighting/hit', by: 'wren', on: 'hero', weapon: 'bow' })).toBe('not-fighting');
    hit('rook', 'hero', 'sword');
    expect(health('hero')).toBe(77);
    // Rook's armour takes 1 off the sword's 4 and the hero's might of 2: Rook, at 1, falls to the next.
    hit('hero', 'rook', 'sword');
    expect(fight()?.fallen).toEqual(['rook']);
    expect(fight()?.engaged).toEqual(['crow', 'wren']);
    hit('wren', 'hero', 'bow');
    expect(health('hero')).toBe(75);
    // The opening blows left Crow at 3 and Wren at 4: one more each.
    hit('hero', 'crow', 'sword');
    hit('hero', 'wren', 'sword');
    expect(fight()?.fallen).toEqual(['rook', 'crow', 'wren']);
    expect(play.view.facts['flag.number(flag: bandits-down)']).toBe(3);
    // Rook carried three coins and dropped two more; the others carried nothing. A search opens the
    // body's bag (M6.8), its lines taken one at a time.
    take({ type: 'fighting/search', actor: 'rook' });
    expect(play.view.lists.held?.map((e) => [e.fields.item, e.fields.count])).toEqual([['coin', 5]]);
    take({ type: 'inventory/take', item: 'coin' });
    take({ type: 'inventory/close' });
    take({ type: 'fighting/search', actor: 'crow' });
    expect(play.view.lists.held).toEqual([]);
    take({ type: 'inventory/close' });
    expect(play.view.facts['inventory.count(item: coin)']).toBe(5);
    expect(fight()?.searched).toEqual(['crow', 'rook']);
    expect(fight()?.emptied).toEqual(['crow', 'rook']);
  });

  it('takes an arrow for each shot, and none is no shot', async () => {
    const { take, refused, fight } = played(await opened());
    take({ type: 'camp/bow' });
    expect(fight()?.weapons.hero?.item).toBe('bow');
    for (let i = 0; i < 10; i++) take({ type: 'fighting/loosed', weapon: 'bow' });
    expect(refused({ type: 'fighting/loosed', weapon: 'bow' })).toBe('no-ammo');
    take({ type: 'camp/sword' });
    expect(fight()?.weapons.hero?.item).toBe('sword');
  });

  it('stops the game as the hero falls, and the save made before it loads as it was', async () => {
    const open = await opened();
    const { play, hit, refused, health } = played(open);
    hit('hero', 'crow', 'sword');
    // Crow's sword takes 3 a blow off the hero's 80, past their armour.
    for (let i = 0; i < 26; i++) hit('crow', 'hero', 'sword');
    expect(health('hero')).toBe(2);
    const before = saveOf(open, play, { edition: 'test' }, 1000);
    hit('crow', 'hero', 'sword');
    expect(play.view.modes.at(-1)).toBe('fallen');
    expect(play.view.offered).toEqual([]);
    expect(play.view.ended).toBe(false);
    expect(refused({ type: 'fighting/hit', by: 'hero', on: 'crow', weapon: 'sword' })).not.toBeUndefined();
    const resumed = resumeFrom(open, JSON.stringify(before));
    if (!resumed.ok) throw new Error(resumed.message);
    expect(resumed.play.view.modes.at(-1)).toBe('out');
    expect(resumed.play.view.facts['stats.current(actor: hero, stat: health)']).toBe(2);
  });
});

describe('the camp broken', () => {
  async function broken(change: (folder: string) => Promise<void>) {
    const folder = await mkdtemp(join(tmpdir(), 'camp-'));
    try {
      await cp(CAMP, folder, { recursive: true });
      await change(folder);
      const compiled = await compileWithGame(folderSource(folder));
      return compiled.diagnostics.map((d) => [d.code, d.file, d.path]);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }
  const edit = async (folder: string, file: string, change: (value: Record<string, unknown>) => void) => {
    const path = join(folder, file);
    const value = JSON.parse(await readFile(path, 'utf8'));
    change(value);
    await writeFile(path, JSON.stringify(value));
  };

  it('is E082 without project.json’s fighting', async () => {
    const found = await broken((folder) =>
      edit(folder, 'project.json', (p) => {
        delete p.fighting;
      }),
    );
    expect(found).toEqual([['E082', 'project.json', '']]);
  });

  it('is E082 for a player placed in the space as an NPC', async () => {
    const found = await broken((folder) =>
      edit(folder, 'project.json', (p) => Object.assign(p, { fighting: { player: 'rook', combat: 'blades' } })),
    );
    expect(found).toEqual([['E082', 'project.json', '/fighting/player']]);
  });

  it('is W150 for a bandit who attacks with nothing worn', async () => {
    const found = await broken((folder) =>
      edit(folder, 'records/actor/crow.json', (a) => {
        delete a.wears;
      }),
    );
    expect(found).toEqual([['W150', 'records/actor/crow.json', '/behaviour']]);
  });
});
