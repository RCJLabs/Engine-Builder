/**
 * The drift played through its screens (M4.6's gate, D56): compiled to the pack Export game writes,
 * played in the worker's host as the Play panel and the player page play it, pressing only the
 * buttons its stock screens draw, the map widget's moves among them. At every step the map's
 * enabled moves are just the travels the game offers, and a player who jumps on towards the exit
 * four times in five, as the drift's pilot does, reaches home through all three sectors in most runs.
 */
import { resolve } from 'node:path';
import { compileWithGame } from '@eb/compiler';
import { type Action, canonicalJson, Rng } from '@eb/core';
import { actionFor, drawn, holds, screenStack } from '@eb/ui';
import type { Screen, Widget } from '@eb/ui/format';
import { childrenOf } from '@eb/ui/format';
import { type Entry, type PlayReply, playHost, type View } from '@eb/ui/session';
import { describe, expect, it } from 'vitest';
import { folderSource } from '../src/folderSource.ts';

const DRIFT = resolve(import.meta.dirname, 'fixtures/drift');

interface Pressable {
  readonly action: Action;
  /** A jump on the map that goes on towards the exit, as the drift's pilot prefers. */
  readonly onward: boolean;
}

/** What a map widget lets a player press: each enabled move to each node, onward when a jump climbs a layer. */
function mapMoves(view: View): Pressable[] {
  const map = view.map;
  if (!map) return [];
  const layer = map.nodes.find((node) => node.id === map.at)?.layer ?? 0;
  return map.nodes.flatMap((node) =>
    node.travels
      .filter((t) => t.enabled)
      .map((t) => ({ action: t.action, onward: t.key === 'jump' && node.layer > layer })),
  );
}

/** Every button the drawn screens show now, with the action it would take. */
function pressable(screens: Readonly<Record<string, Screen>>, view: View): Pressable[] {
  const found: Pressable[] = [];
  const visit = (widget: Widget, entry?: Entry): void => {
    if (!holds(widget, view)) return;
    if (widget.widget === 'button') {
      const taken = actionFor(widget.action, view, entry);
      if (taken) found.push({ action: taken, onward: false });
    }
    if (widget.widget === 'map') found.push(...mapMoves(view));
    if (widget.widget === 'list') {
      for (const each of view.lists[widget.of] ?? []) visit(widget.item, each);
      return;
    }
    for (const child of childrenOf(widget)) visit(child, entry);
  };
  const top = drawn(screenStack(screens, view.modes, [])).at(-1);
  if (top?.kind !== 'screen') return found;
  for (const region of ['top', 'main', 'bottom'] as const) {
    const root = top.screen[region];
    if (root) visit(root);
  }
  return found;
}

/** The map's enabled moves are the travels on offer: no more, no fewer. */
function mapMatchesOffers(view: View): void {
  if (!view.map) return;
  const shown = mapMoves(view).map((m) => canonicalJson(m.action));
  const offered = view.offered.filter((a) => a.type === 'maps/travel').map((a) => canonicalJson(a));
  expect(new Set(shown)).toEqual(new Set(offered));
}

describe('the drift through its screens', () => {
  it('flies to the exit pressing only what its screens draw, the map’s moves the travels on offer', async () => {
    const compiled = await compileWithGame(folderSource(DRIFT));
    expect(compiled.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const pack = JSON.parse(JSON.stringify(compiled.pack)) as unknown;
    let home = 0;
    const seen = new Set<string>();
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const host = playHost();
      const opened = host({ id: 0, kind: 'open', pack });
      if (opened.kind !== 'opened') throw new Error(JSON.stringify(opened));
      const { screens } = opened;
      const started = host({ id: 0, kind: 'start', seed, saving: { edition: 'test' }, at: 0 });
      if (started.kind !== 'started') throw new Error(JSON.stringify(started));
      let view = started.view;
      const rng = Rng.create(`fly:${seed}`);
      const onScreens = () => {
        for (const shown of screenStack(screens, view.modes, [])) {
          expect(shown.kind, `modes ${view.modes.join(', ')}`).toBe('screen');
          if (shown.kind === 'screen') seen.add(shown.id);
        }
      };
      for (let turn = 1; !view.ended && turn < 400; turn++) {
        onScreens();
        mapMatchesOffers(view);
        const options = pressable(screens, view);
        expect(options.length, `nothing to press in ${view.modes.join(', ')}`).toBeGreaterThan(0);
        const onward = options.filter((o) => o.onward);
        const pool = onward.length > 0 && rng.int(1, 5) > 1 ? onward : options;
        const { action } = pool[rng.int(0, pool.length - 1)] as Pressable;
        const step: PlayReply = host({ id: turn, kind: 'act', action, at: turn });
        if (step.kind !== 'stepped') throw new Error(JSON.stringify(step));
        expect(step.accepted, JSON.stringify(action)).toBe(true);
        view = step.view;
      }
      onScreens();
      expect(view.ended, seed).toBe(true);
      if (view.modes.at(-1) === 'home') home++;
    }
    expect([...seen].sort()).toEqual(['ending', 'event', 'map']);
    expect(home).toBeGreaterThanOrEqual(5);
  });
});
