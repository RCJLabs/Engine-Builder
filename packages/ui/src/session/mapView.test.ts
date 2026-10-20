/**
 * The map in a play's view (M4.6, docs/specs/maps.md#the-map-widget): the sector and the valley as
 * the map widget draws them, each move's button enabled just while the game offers its action, at
 * the cost and time the action charges, and why it is shut in words.
 */
import { describe, expect, it } from 'vitest';
import { RECORDS, sectorWith } from '../../../kits/test/sector.ts';
import { startPlay } from './play.ts';
import type { MapNode } from './types.ts';

const KITS = ['inventory', 'economy', 'time', 'maps'];
const playOf = (setup: Parameters<typeof sectorWith>[0] = {}, kits = KITS) => {
  const g = sectorWith(setup);
  return { g, play: startPlay({ game: g.game, sim: g.sim, kits, wants: { facts: [], conditions: [] } }, 'sector') };
};
const byId = (nodes: readonly MapNode[] | undefined) => new Map((nodes ?? []).map((node) => [node.id, node]));

describe('the map in a play’s view', () => {
  it('draws the sector the party is on, its name a view field, the unknown unnamed', () => {
    const { g, play } = playOf();
    const map = play.view.map;
    expect(map).toMatchObject({ map: 'sector', name: 'The Shoals', shape: 'layered', layers: 7, at: 'n0-0' });
    expect(play.view.fields['map.name']).toBe('The Shoals');
    const known = new Set(g.slice(play.state).known);
    for (const node of map?.nodes ?? []) {
      expect(node.name !== null, node.id).toBe(known.has(node.id));
      expect(node.kind !== null, node.id).toBe(known.has(node.id));
    }
    expect(byId(map?.nodes).get('n0-0')).toMatchObject({ name: 'Way in', kind: 'Way in', visited: true });
  });

  it('enables just the moves the game offers, each saying its cost; taking one moves the party', () => {
    const { g, play } = playOf();
    const enabled = (play.view.map?.nodes ?? []).flatMap((node) =>
      node.travels.filter((t) => t.enabled).map((t) => t.action),
    );
    const offered = play.view.offered.filter((action) => action.type === 'maps/travel');
    expect(new Set(enabled.map((a) => JSON.stringify(a)))).toEqual(new Set(offered.map((a) => JSON.stringify(a))));
    const next = (play.view.map?.nodes ?? []).find((node) => node.travels.some((t) => t.key === 'jump'));
    const jump = next?.travels.find((t) => t.key === 'jump');
    expect(jump).toMatchObject({
      label: 'Jump',
      cost: '1 Supplies',
      takes: null,
      changes: 'heat 0 → 2',
      why: null,
      enabled: true,
    });
    // A long jump cools the ship by ten, but the heat is at 0 already: a change to nothing says nothing.
    const long = (play.view.map?.nodes ?? []).flatMap((node) => node.travels).find((t) => t.key === 'long');
    expect(long).toMatchObject({ cost: '3 Supplies', changes: null });
    play.act(jump?.action as never);
    expect(play.view.map?.at).toBe(next?.id);
    expect(g.slice(play.state).at).toBe(next?.id);
  });

  it('says why a move is shut: the resource it is short of', () => {
    const records = { ...RECORDS, resource: { ...RECORDS.resource, supplies: { name: 'Supplies', start: 2 } } };
    const { play } = playOf({ records });
    const long = (play.view.map?.nodes ?? []).flatMap((node) => node.travels).find((t) => t.key === 'long');
    expect(long).toMatchObject({ enabled: false, why: 'Costs 3 Supplies; you have 2' });
  });

  it('draws the valley at its places, each drive at its roads’ hours and cash', () => {
    const { play } = playOf({ first: 'valley' });
    const nodes = byId(play.view.map?.nodes);
    expect(play.view.map?.shape).toBe('drawn');
    expect(nodes.get('van')).toMatchObject({ x: 10, y: 80, name: 'The van', kind: 'Home' });
    // The valley shows nothing past where the party has stood: the slab is drawn, unnamed, and a drive reaches it.
    expect(nodes.get('slab')).toMatchObject({ x: 70, y: 30, known: false, name: null, kind: null });
    expect(nodes.get('slab')?.travels).toEqual([
      expect.objectContaining({ label: 'Drive', cost: '3 Credits', takes: '3 hours', enabled: true }),
    ]);
    // One hour reads as one.
    expect(nodes.get('town')?.travels[0]?.takes).toBe('1 hour');
    expect(play.view.map?.links.filter((link) => link.oneWay)).toEqual([{ from: 'town', to: 'tower', oneWay: true }]);
  });

  it('has no map without the maps kit among the play’s kits', () => {
    expect(playOf({}, ['inventory', 'economy', 'time']).play.view.map).toBeUndefined();
    expect(playOf({}, ['inventory', 'economy', 'time']).play.view.fields).not.toHaveProperty('map.name');
  });
});
