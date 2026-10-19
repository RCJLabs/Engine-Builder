/**
 * The hut played through its screens (M4.1's gate, D51): compiled to the pack Export game writes,
 * played in the worker's host as the editor's Play panel and the player page play it. At every
 * step each mode has a screen of the hut's own, never the fallback, and a keeper who presses only
 * buttons the screens draw plays the season to its end.
 */
import { resolve } from 'node:path';
import { compileWithGame } from '@eb/compiler';
import { type Action, Rng } from '@eb/core';
import { actionFor, drawn, holds, screenStack } from '@eb/ui';
import type { Screen, Widget } from '@eb/ui/format';
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
  it('packs its seven screens and its theme', async () => {
    const pack = (await hutPack()) as { format: number; ui: { screens: object; theme: object } };
    expect(pack.format).toBe(4);
    expect(Object.keys(pack.ui.screens)).toEqual(['closed', 'hut', 'journal', 'store', 'storm', 'talk']);
    expect(pack.ui.theme).toBeDefined();
  });

  it('plays a season pressing only what the screens draw, each mode on a screen of its own', async () => {
    const pack = await hutPack();
    const seen = new Set<string>();
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const host = playHost();
      const started = host({ id: 0, kind: 'start', pack, seed });
      if (started.kind !== 'started') throw new Error(JSON.stringify(started));
      const { screens } = started;
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
        const step: PlayReply = host({ id: turn, kind: 'act', action });
        if (step.kind !== 'stepped') throw new Error(JSON.stringify(step));
        expect(step.accepted, JSON.stringify(action)).toBe(true);
        view = step.view;
      }
      onScreens();
      expect(view.ended).toBe(true);
      expect(view.modes).toEqual(['closed']);
    }
    // The journal is opened by a button, not a mode; every other screen comes up in play.
    expect([...seen].sort()).toEqual(['closed', 'hut', 'store', 'storm', 'talk']);
  });
});
