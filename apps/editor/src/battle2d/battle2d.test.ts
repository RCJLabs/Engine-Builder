/**
 * The battle's controller on a 2D stage, headless (M7.5, D87, docs/specs/tactics.md#the-stage), against the
 * boarding fight's pack played through the session: taps select, preview and send; every action a bar or a
 * tap can send is one the sim offers and takes; Cancel and settling a new view keep the state true; a step's
 * beats play back a tile at a time and end where the sim put each unit; the words name units and odds as the
 * view gives them.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { compileWithGame, memorySource } from '@eb/compiler';
import { type Action, canonicalJson } from '@eb/core';
import type { BattleView } from '@eb/kits';
import { battleOf, type Opened, openPack, type Play, startPlay, toldAfter } from '@eb/ui/session';
import { beforeAll, describe, expect, it } from 'vitest';
import { stageBattleOf } from './forStage.ts';
import { actionOf, cancel, choicesOf, type Picking, previewsOf, settle, stepCursor, tap } from './pick.ts';
import { actsOf, lengthOf, playAt, TILE_MS } from './playback.ts';
import { beatLine, namesOf, oddsText, previewLine } from './words.ts';

const FIGHT = join(import.meta.dirname, '../../../../tools/cli/test/fixtures/fight');

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

let opened: Opened;
let names: Record<string, string>;
beforeAll(async () => {
  const compiled = await compileWithGame(memorySource(filesOf(FIGHT)));
  if (!compiled.pack) throw new Error(JSON.stringify(compiled.diagnostics));
  const open = openPack(JSON.parse(JSON.stringify(compiled.pack)));
  if (!open.ok) throw new Error(open.message);
  opened = open.opened;
  names = Object.fromEntries(
    Object.entries(compiled.pack.records.actor ?? {}).map(([id, v]) => [id, (v as { name: string }).name]),
  );
}, 30_000);

/** A boarding fight with the alarm sounded: the play and the battle's view. */
function fight(seed = '3'): { play: Play; view: () => BattleView } {
  const play = startPlay(opened.setup, seed);
  if (!play.act({ type: 'world/use', space: 'deck', object: 'alarm' }).accepted) throw new Error('No alarm');
  return {
    play,
    view: () => {
      const view = play.view.world?.battle?.view;
      if (!view) throw new Error('No battle');
      return view;
    },
  };
}

const offered = (play: Play, action: Action) =>
  play.view.offered.some((o) => canonicalJson(o) === canonicalJson(action));

describe('picking', () => {
  it('selects the first of the crew, a tap selects another, a reachable tile previews and a second tap sends', () => {
    const { play, view } = fight();
    let picking: Picking = settle(view(), {});
    expect(picking.selected).toBe('c1');
    const oren = view().units.find((u) => u.id === 'c2');
    picking = tap(view(), picking, oren?.at as [number, number]).picking;
    expect(picking.selected).toBe('c2');
    const step = choicesOf(view(), 'c2')?.moves.find((m) => m.ap === 1);
    if (!step) throw new Error('Oren can reach nowhere');
    const first = tap(view(), picking, [step.to[0], step.to[1]]);
    expect(first.send).toBeUndefined();
    expect(first.picking.preview).toEqual({ kind: 'move', unit: 'c2', step });
    const second = tap(view(), first.picking, [step.to[0], step.to[1]]);
    expect(second.send).toEqual({ type: 'tactics/move', unit: 'c2', to: [step.to[0], step.to[1]] });
    expect(second.picking.preview).toBeUndefined();
    expect(play.act(second.send as Action).accepted).toBe(true);
  });

  it('sends only what the sim offers: every preview of every unit, and End turn', () => {
    const { play, view } = fight();
    const all = view().choices.flatMap(previewsOf);
    expect(all.length).toBeGreaterThan(10);
    for (const preview of all) expect(offered(play, actionOf(preview)), JSON.stringify(preview)).toBe(true);
    expect(offered(play, actionOf({ kind: 'end' }))).toBe(true);
  });

  it('clears a preview with Cancel, then the selection; and a tap off any choice clears the preview', () => {
    const { view } = fight();
    const picking = settle(view(), {});
    const step = choicesOf(view(), 'c1')?.moves[0];
    const previewed = tap(view(), picking, [step?.to[0] ?? 0, step?.to[1] ?? 0]).picking;
    expect(previewed.preview?.kind).toBe('move');
    expect(cancel(previewed)).toEqual({ selected: 'c1', cursor: step?.to });
    expect(cancel(cancel(previewed))).toEqual({ cursor: step?.to });
    expect(tap(view(), previewed, [0, 0]).picking.preview).toBeUndefined();
  });

  it('keeps the cursor on the map, starting from the selected', () => {
    const { view } = fight();
    const picking = settle(view(), {});
    const at = view().units[0]?.at as [number, number];
    expect(stepCursor(view(), picking, [1, 0], [11, 5]).cursor).toEqual([at[0] + 1, at[1]]);
    const corner = stepCursor(view(), { cursor: [0, 0] }, [-1, -1], [11, 5]);
    expect(corner.cursor).toEqual([0, 0]);
    expect(stepCursor(view(), { cursor: [10, 4] }, [1, 1], [11, 5]).cursor).toEqual([10, 4]);
  });

  it('settles on a new view: a preview no longer offered goes, the selection moves to one with choices', () => {
    const { play, view } = fight();
    let picking = settle(view(), {});
    const step = choicesOf(view(), 'c1')?.moves.find((m) => m.ap === 2);
    if (!step) throw new Error('Ines can dash nowhere');
    picking = tap(view(), tap(view(), picking, [step.to[0], step.to[1]]).picking, [step.to[0], step.to[1]]).picking;
    expect(play.act({ type: 'tactics/move', unit: 'c1', to: [step.to[0], step.to[1]] }).accepted).toBe(true);
    // A dash spends both action points: Ines has no choices left, so Oren is next.
    expect(settle(view(), { ...picking, selected: 'c1' }).selected).toBe('c2');
  });
});

describe('playback', () => {
  it('walks each move a tile at a time and ends where the sim put every unit', () => {
    const { play, view } = fight();
    const before = new Map(view().units.map((u) => [u.id, { at: u.at, status: u.status, hp: u.hp }]));
    expect(play.act({ type: 'tactics/end' }).accepted).toBe(true);
    const told = play.view.world?.battle?.told ?? [];
    const acts = actsOf(told, false);
    const walk = acts.find((a) => a.beat.type === 'tactics/moved');
    if (!walk) throw new Error('The boarders never moved');
    const path = walk.beat.path as [number, number][];
    const [a, b] = path as [[number, number], [number, number]];
    expect(walk.ms).toBe((path.length - 1) * TILE_MS);
    const mover = walk.beat.unit as string;
    expect(playAt(acts, before, walk.at).units.get(mover)?.at).toEqual(path[0]);
    expect(playAt(acts, before, walk.at + TILE_MS / 2).units.get(mover)?.at).toEqual([
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
    ]);
    const end = playAt(acts, before, lengthOf(acts));
    expect(end.done).toBe(true);
    for (const unit of play.view.world?.battle?.view?.units ?? [])
      if (unit.status === 'active') expect(end.units.get(unit.id)?.at, unit.id).toEqual(unit.at);
    expect(lengthOf(actsOf(told, true))).toBe(0);
  });

  it('takes a shot’s damage once it has been shown, and lays a unit down as its beat says', () => {
    const before = new Map([['c1', { at: [2, 1] as const, status: 'active' as const, hp: 10 }]]);
    const acts = actsOf(
      [
        { type: 'tactics/shot', unit: 'e1', target: 'c1', hit: true, damage: 4 },
        { type: 'tactics/down', unit: 'c1' },
      ],
      false,
    );
    expect(playAt(acts, before, 0)).toMatchObject({ shot: { from: 'e1', to: 'c1', hit: true } });
    expect(playAt(acts, before, 0).units.get('c1')?.hp).toBe(10);
    const end = playAt(acts, before, lengthOf(acts));
    expect(end.units.get('c1')).toEqual({ at: [2, 1], status: 'down', hp: 6 });
    expect(end.shot).toBeUndefined();
  });
});

describe('the beats a stage plays back', () => {
  it('are the last step’s that had any, kept through a step with none, and only the battle’s own', () => {
    const { play } = fight();
    const { content } = opened.setup.sim;
    const tiles = opened.setup.tiles ?? {};
    const before = play.state;
    expect(play.act({ type: 'tactics/end' }).accepted).toBe(true);
    const shown = play.view.world?.battle;
    expect(shown?.told.length).toBeGreaterThan(0);
    const last = { space: 'deck', battle: 'boarders', beats: shown?.told ?? [], step: shown?.step ?? 0 };
    // A step with no tactics beats keeps the last ones, so they are played back once and not lost.
    expect(toldAfter(last, before, play.state, [{ type: 'world/used' }], content)).toBe(last);
    // Another battle's beats are never shown on this one.
    const other = battleOf(play.state, content, tiles, { ...last, battle: 'raid', step: 99 });
    expect([other?.told, other?.step]).toEqual([[], 0]);
    expect(battleOf(play.state, content, tiles, last)?.told).toEqual(last.beats);
  });
});

describe('the battle a stage in code is handed', () => {
  it('gives the units where the playback has them, the chosen’s reach and targets, and the preview’s tiles', () => {
    const { view } = fight();
    const step = choicesOf(view(), 'c1')?.moves.find((m) => m.ap === 2);
    if (!step) throw new Error('Ines can dash nowhere');
    const units = new Map(view().units.map((u) => [u.id, { at: u.at, status: u.status, hp: u.hp }]));
    units.set('e1', { at: [3.5, 2], status: 'down', hp: 0 });
    const picking: Picking = { selected: 'c1', preview: { kind: 'move', unit: 'c1', step }, cursor: [1, 2] };
    const now = { view: view(), units, picking, playing: false };
    const shown = stageBattleOf(now, 96);
    expect(shown).toMatchObject({ side: 'crew', round: 1, selected: 'c1', cursor: [1, 2], playing: false, inset: 96 });
    expect(shown.units.find((u) => u.id === 'e1')).toMatchObject({
      actor: 'pirate',
      at: [3.5, 2],
      status: 'down',
      hp: 0,
    });
    expect(shown.reach).toEqual(choicesOf(view(), 'c1')?.moves.map((m) => ({ to: m.to, ap: m.ap })));
    expect(shown.targets).toEqual(choicesOf(view(), 'c1')?.shots.map((s) => s.target));
    expect(shown.preview).toEqual({ kind: 'move', unit: 'c1', path: step.path, to: step.to });
    // While a step plays back, nothing is offered to tap.
    const playing = stageBattleOf({ ...now, playing: true, shot: { from: 'e2', to: 'c1', hit: true } }, 96);
    expect([playing.reach, playing.targets, playing.shot]).toEqual([[], [], { from: 'e2', to: 'c1', hit: true }]);
  });
});

describe('words', () => {
  it('names units by their actors, numbered when two share one, and says a preview and a beat', () => {
    const { view } = fight();
    const name = namesOf(view(), (actor) => names[actor]);
    expect(view().units.map((u) => name(u.id))).toEqual([
      'Ines',
      'Oren',
      'Sal',
      'Pirate 1',
      'Pirate 2',
      'Pirate brute',
    ]);
    const step = choicesOf(view(), 'c1')?.moves.find((m) => m.ap === 1);
    if (!step) throw new Error('Ines can reach nowhere');
    expect(previewLine({ kind: 'move', unit: 'c1', step }, view(), name)).toBe(
      `Ines moves to ${step.to[0]}, ${step.to[1]}: 1 action point.`,
    );
    expect(oddsText({ hit: 62, crit: 10 })).toBe('62% to hit, 10% to crit');
    expect(beatLine({ type: 'tactics/turn', side: 'foes', round: 1 }, name)).toBe("Round 1: the enemy's turn.");
    expect(beatLine({ type: 'tactics/won', battle: 'boarders' }, name)).toBe('The battle is won.');
  });
});
