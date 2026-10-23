/**
 * The hut played through its screens (M4.1's gate, D51): compiled to the pack Export game writes,
 * played in the worker's host as the editor's Play panel and the player page play it. At every
 * step each mode has a screen of the hut's own, never the fallback, and a keeper who presses only
 * buttons the screens draw plays the season to its end. M4.2: every line of its feedback is said
 * somewhere in those seasons, each with every hole filled. M4.3: a save after every step, and a
 * save from any step loads to the same game, which then plays on as the one that never stopped.
 */
import { resolve } from 'node:path';
import { compileWithGame } from '@eb/compiler';
import { type Action, createPack, type Pack, type PackUi, Rng, type SaveFile } from '@eb/core';
import { MAX_LOG } from '@eb/platform';
import { actionFor, drawn, holds, screenStack } from '@eb/ui';
import type { Said, Screen, Widget } from '@eb/ui/format';
import { childrenOf } from '@eb/ui/format';
import { type Entry, type PlayReply, playHost, type View } from '@eb/ui/session';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const HUT = resolve(import.meta.dirname, 'fixtures/hut');

/** Every button the drawn screens show now, with the action it would take: what a player can press. */
function pressable(screens: Readonly<Record<string, Screen>>, view: View): Action[] {
  const actions: Action[] = [];
  const visit = (widget: Widget, entry?: Entry): void => {
    if (!holds(widget, view)) return;
    if (widget.widget === 'button') {
      const taken = actionFor(widget.action, view, entry);
      if (taken) actions.push(taken);
    }
    if (widget.widget === 'list') {
      for (const each of view.lists[widget.of] ?? []) visit(widget.item, each);
      return;
    }
    for (const child of childrenOf(widget)) visit(child, entry);
  };
  const shown = drawn(screenStack(screens, view.modes, []));
  const top = shown.at(-1);
  if (top?.kind !== 'screen') return actions;
  for (const region of ['top', 'main', 'bottom'] as const) {
    const root = top.screen[region];
    if (root) visit(root);
  }
  return actions;
}

async function hutPack() {
  const compiled = await compileWithGame(folderSource(HUT));
  expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return JSON.parse(JSON.stringify(compiled.pack)) as unknown;
}

describe('the hut through its screens', () => {
  it('packs its six screens, its theme, its feedback and its shell', async () => {
    const pack = (await hutPack()) as {
      format: number;
      ui: { screens: object; theme: object; feedback: object; shell: object };
    };
    // Format 8 since M4.8: the hut's music's file travels with it.
    expect(pack.format).toBe(8);
    expect(pack.ui.shell).toMatchObject({ title: 'The hut', daily: true });
    expect(Object.keys(pack.ui.screens)).toEqual(['closed', 'hut', 'journal', 'store', 'storm', 'talk']);
    expect(pack.ui.theme).toBeDefined();
    expect(pack.ui.feedback).toBeDefined();
  });

  it('plays a season pressing only what the screens draw, each mode on a screen of its own', async () => {
    const pack = await hutPack();
    const seen = new Set<string>();
    const said: Said[] = [];
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const host = playHost();
      const opened = host({ id: 0, kind: 'open', pack });
      if (opened.kind !== 'opened') throw new Error(JSON.stringify(opened));
      const { screens } = opened;
      const started = host({ id: 0, kind: 'start', seed, saving: { edition: 'test' }, at: 0 });
      if (started.kind !== 'started') throw new Error(JSON.stringify(started));
      let view = started.view;
      const rng = Rng.create(`press:${seed}`);
      const onScreens = () => {
        for (const shown of screenStack(screens, view.modes, [])) {
          expect(shown.kind, `modes ${view.modes.join(', ')}`).toBe('screen');
          if (shown.kind === 'screen') seen.add(shown.id);
        }
      };
      for (let turn = 1; !view.ended && turn < 400; turn++) {
        onScreens();
        const options = pressable(screens, view);
        expect(options.length, `nothing to press in ${view.modes.join(', ')}`).toBeGreaterThan(0);
        const action = options[rng.int(0, options.length - 1)] as Action;
        const step: PlayReply = host({ id: turn, kind: 'act', action, at: turn });
        if (step.kind !== 'stepped') throw new Error(JSON.stringify(step));
        expect(step.accepted, JSON.stringify(action)).toBe(true);
        said.push(...step.said);
        view = step.view;
      }
      onScreens();
      expect(view.ended).toBe(true);
      expect(view.modes).toEqual(['closed']);
    }
    // The journal is opened by a button, not a mode; every other screen comes up in play.
    expect([...seen].sort()).toEqual(['closed', 'hut', 'store', 'storm', 'talk']);
    // Every hole filled: a record's id as its name, never "—" or a brace.
    for (const line of said)
      expect(line.text, line.text).not.toMatch(/[—{}]|^(guild|village|rope|bread|guiding|loads|supplies)\b/);
    const heard = (pattern: RegExp) => said.some((line) => pattern.test(line.text));
    expect(heard(/^Day \d+ begins\.$/)).toBe(true);
    expect(heard(/^You carry a load up from the village\.$/)).toBe(true);
    expect(heard(/^The guides’ guild: -?\d+$/)).toBe(true);
    expect(heard(/^In the journal: The ridge$/)).toBe(true);
    expect(heard(/^The hut is shut for the winter\.$/)).toBe(true);
    const lines = said.map((line) => [line.text, line.to]);
    expect(lines).toContainEqual(['The hut is shut for the winter.', 'both']);
    expect(lines).toContainEqual(['You go down to see Greta.', 'log']);
  });
});

describe('the hut saved as it plays (M4.3)', () => {
  it('saves after every step, and a save from any step loads to the game that never stopped', async () => {
    const pack = await hutPack();
    for (const seed of ['a', 'b', 'c']) {
      const host = playHost();
      host({ id: 0, kind: 'open', pack });
      const started = host({ id: 0, kind: 'start', seed, saving: { edition: 'test' }, at: 0 });
      if (started.kind !== 'started') throw new Error(JSON.stringify(started));
      const saves: SaveFile[] = [started.save];
      const views: View[] = [started.view];
      const actions: Action[] = [];
      const rng = Rng.create(`save:${seed}`);
      for (let turn = 1; !views.at(-1)?.ended && turn < 400; turn++) {
        const offered = views.at(-1)?.offered ?? [];
        const action = offered[rng.int(0, offered.length - 1)] as Action;
        const step = host({ id: turn, kind: 'act', action, at: turn * 1000 });
        if (step.kind !== 'stepped' || !step.save) throw new Error(JSON.stringify(step));
        expect(step.save.savedAt).toBe(turn * 1000);
        expect(step.save.log.length).toBeLessThanOrEqual(MAX_LOG);
        saves.push(step.save);
        views.push(step.view);
        actions.push(action);
      }
      // Its line is the shell's, filled from the facts as it was saved.
      expect(saves.at(-1)?.summary).toMatchObject({
        turn: views.at(-1)?.turn,
        line: expect.stringMatching(/^Day \d+ · \d+ coins$/),
      });
      for (const at of [0, 1, Math.floor(saves.length / 2), saves.length - 1]) {
        const again = playHost();
        again({ id: 0, kind: 'open', pack });
        const loaded = again({
          id: 1,
          kind: 'load',
          raw: JSON.stringify(saves[at]),
          saving: { edition: 'test' },
          at: 0,
        });
        if (loaded.kind !== 'loaded' || !loaded.ok) throw new Error(JSON.stringify(loaded));
        expect(loaded.report).toMatchObject({ differs: false, skipped: 0 });
        expect(loaded.view).toEqual(views[at]);
        // Played on with the same actions, it saves what the game that never stopped saved.
        for (const [i, action] of actions.slice(at).entries()) {
          const step = again({ id: i + 2, kind: 'act', action, at: (at + i + 1) * 1000 });
          if (step.kind !== 'stepped' || !step.save) throw new Error(JSON.stringify(step));
          expect(step.save.hash).toBe(saves[at + i + 1]?.hash);
        }
      }
    }
  });

  it('fills a slot line whose facts no screen reads: the shell’s own are read for it', async () => {
    const pack = (await hutPack()) as Pack;
    const ui = { ...(pack.ui as PackUi), shell: { 'slot-line': 'Loads: {quests.state(quest: loads)}' } };
    const changed = createPack(pack.project, pack.records, pack.scripts, ui);
    const host = playHost();
    host({ id: 0, kind: 'open', pack: JSON.parse(JSON.stringify(changed)) });
    const started = host({ id: 1, kind: 'start', seed: 'x', saving: { edition: 'test' }, at: 0 });
    if (started.kind !== 'started') throw new Error(JSON.stringify(started));
    expect(started.save.summary).toMatchObject({ line: expect.stringMatching(/^Loads: (waiting|active)$/) });
  });

  it('says why a save won’t load: not JSON, another game, or a game that fails replaying it', async () => {
    const pack = await hutPack();
    const host = playHost();
    host({ id: 0, kind: 'open', pack });
    const started = host({ id: 1, kind: 'start', seed: 'x', saving: { edition: 'test' }, at: 0 });
    if (started.kind !== 'started') throw new Error('no start');
    const load = (raw: string) => host({ id: 2, kind: 'load', raw, saving: { edition: 'test' }, at: 0 });
    expect(load('{"torn')).toMatchObject({ kind: 'loaded', ok: false, problem: 'damaged' });
    expect(load(JSON.stringify({ ...started.save, game: 'another' }))).toMatchObject({ ok: false });
    const broken = { ...started.save, log: [{ type: 'no/such' }] };
    expect(load(JSON.stringify(broken))).toMatchObject({ ok: false });
    // A step needs a game in play: the failed load left none.
    expect(host({ id: 3, kind: 'act', action: { type: 'x' }, at: 0 })).toMatchObject({ kind: 'failed' });
  });
});
