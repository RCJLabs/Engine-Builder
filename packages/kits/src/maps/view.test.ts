/**
 * enter-map's preview, the map as the party sees it (M4.6, docs/specs/maps.md#the-map-widget):
 * every node and link, names only where known, and each travel with the verdict the action gives,
 * its cost only with the economy kit and its time only with the time kit.
 */
import type { GameState } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { RECORDS, sectorGame, sectorWith } from '../../test/sector.ts';
import type { MadeMap } from './types.ts';
import type { MapShown } from './view.ts';

type On = Extract<MapShown, { on: true }>;

const shownBy = (g: ReturnType<typeof sectorWith>, state: GameState, map: string) =>
  g.game.preview(state, [{ effect: 'enter-map', map }], g.sim)[0] as unknown as MapShown;
const onMap = (g: ReturnType<typeof sectorWith>, state: GameState, map = 'sector') => {
  const shown = shownBy(g, state, map);
  if (!shown.on) throw new Error(`Not on ${map}`);
  return shown as On;
};
const offered = (g: ReturnType<typeof sectorWith>, state: GameState) =>
  g
    .options(state)
    .filter((action) => action.type === 'maps/travel')
    .map((action) => `${action.move} ${action.to}`);

describe('the map as the party sees it', () => {
  it('draws every node and link of the sector, naming only the known', () => {
    const g = sectorGame;
    const state = g.start();
    const made = g.slice(state).made as MadeMap;
    const shown = onMap(g, state);
    expect(shown).toMatchObject({ map: 'sector', name: 'The Shoals', shape: 'layered', layers: 7, at: 'n0-0' });
    expect(shown.nodes.map((node) => node.id)).toEqual(made.nodes.map((node) => node.id));
    expect(shown.links).toHaveLength(made.links.length);
    const known = new Set(g.slice(state).known);
    for (const node of shown.nodes) {
      expect(node.known, node.id).toBe(known.has(node.id));
      expect(node.name !== undefined, node.id).toBe(known.has(node.id));
      expect(node.kind !== undefined, node.id).toBe(known.has(node.id));
    }
    expect(shown.nodes.find((node) => node.id === 'n0-0')?.visited).toBe(true);
  });

  it('shows open exactly the travels the game offers, each at what it charges', () => {
    const g = sectorGame;
    const state = g.start();
    const shown = onMap(g, state);
    const open = shown.travels.filter((travel) => travel.ok).map((travel) => `${travel.move} ${travel.to}`);
    expect(open).toEqual(offered(g, state));
    expect(shown.travels.find((travel) => travel.move === 'jump')?.cost).toEqual({ supplies: 1 });
    expect(shown.travels.find((travel) => travel.move === 'long')?.cost).toEqual({ supplies: 3 });
    // What each does to heat, by the flag's own preview: a long jump can't take it below 0.
    expect(shown.travels.find((travel) => travel.move === 'jump')?.changes).toEqual([
      { effect: 'add-to-flag', flag: 'heat', from: 0, to: 2 },
    ]);
    expect(shown.travels.find((travel) => travel.move === 'long')?.changes).toEqual([
      { effect: 'add-to-flag', flag: 'heat', from: 0, to: 0 },
    ]);
  });

  it('says why a travel is shut: the move’s condition, or the resource short', () => {
    const records = {
      ...RECORDS,
      resource: { ...RECORDS.resource, supplies: { name: 'Supplies', start: 2 } },
      map: {
        ...RECORDS.map,
        sector: {
          ...RECORDS.map.sector,
          moves: [
            ...RECORDS.map.sector.moves,
            { id: 'warp', label: 'Warp', if: { fact: 'flag.on', args: { flag: 'home' } } },
          ],
        },
      },
    };
    const g = sectorWith({ records });
    const state = g.start();
    const shown = onMap(g, state);
    const long = shown.travels.find((travel) => travel.move === 'long');
    expect(long).toMatchObject({ ok: false, short: { resource: 'supplies', have: 2, need: 3 } });
    const warp = shown.travels.find((travel) => travel.move === 'warp');
    expect(warp?.ok).toBe(false);
    expect(warp?.needs).toBeDefined();
    expect(shown.travels.filter((travel) => travel.move === 'jump').every((travel) => travel.ok)).toBe(true);
  });

  it('is not on a map the party isn’t on: a preview can’t make one', () => {
    const g = sectorGame;
    expect(shownBy(g, g.start(), 'valley')).toEqual({ effect: 'enter-map', map: 'valley', on: false });
  });

  it('draws the valley at its places, a one-way road marked, a drive at its roads’ hours and cash', () => {
    const g = sectorWith({ first: 'valley' });
    const shown = onMap(g, g.start(), 'valley');
    expect(shown).toMatchObject({ shape: 'drawn', layers: 1, at: 'van' });
    expect(shown.nodes.find((node) => node.id === 'slab')).toMatchObject({ x: 70, y: 30 });
    expect(shown.links.filter((link) => link.oneWay)).toEqual([{ from: 'town', to: 'tower', oneWay: true }]);
    expect(shown.travels.find((travel) => travel.to === 'slab')).toMatchObject({
      cost: { credits: 3 },
      takes: { hours: 3 },
      ok: true,
    });
  });

  it('shows no cost without the economy kit and no time without the time kit, as none is charged or passes', () => {
    const g = sectorWith({ first: 'valley', economy: false, time: false });
    const shown = onMap(g, g.start(), 'valley');
    for (const travel of shown.travels) {
      expect(travel.cost, travel.to).toEqual({});
      expect(travel.takes, travel.to).toEqual({});
    }
  });
});
