import { describe, expect, it } from 'vitest';
import { caravanWith } from '../../../kits/test/caravan.ts';
import { RECORDS as CRAG, cragWith } from '../../../kits/test/crag.ts';
import { dockWith } from '../../../kits/test/dock.ts';
import { startPlay } from './play.ts';
import type { Entry, Wants } from './types.ts';

const none: Wants = { facts: [], conditions: [] };
const crag = cragWith(CRAG, { first: 'marge', start: 'talking' });
const cragPlay = (wants = none) =>
  startPlay({ game: crag.game, sim: crag.sim, kits: ['inventory', 'economy', 'dialogue'], wants }, 'crag');
const fieldsOf = (entries: readonly Entry[] | undefined) =>
  (entries ?? []).map((e) => ({ ...e.fields, enabled: e.enabled }));

describe('a play’s view', () => {
  it('shows the open talk: its line, its speaker by name, and its options with their actions', () => {
    const play = cragPlay();
    expect(play.view.modes.at(-1)).toBe('talking');
    expect(play.view.fields).toEqual({
      'talk.name': 'Marge at the crag',
      'talk.speaker': 'Marge',
      'talk.text': 'First time at the crag?',
    });
    expect(play.view.lists.talk?.map((e) => e.action)).toEqual([
      { type: 'dialogue/say', option: 'first' },
      { type: 'dialogue/say', option: 'been' },
    ]);
    expect(play.view.lists.talk?.every((e) => e.enabled)).toBe(true);
    expect(play.view.ended).toBe(false);
  });

  it('shows a locked option’s reason and a cost, from the sim’s own verdict', () => {
    const play = cragPlay();
    play.act({ type: 'dialogue/say', option: 'been' });
    expect(play.view.fields['talk.text']).toBe('What are we doing today?');
    const byId = Object.fromEntries((play.view.lists.talk ?? []).map((e) => [e.key, e]));
    expect(byId.gas?.fields).toMatchObject({ label: 'Chip in for gas', locked: false, cost: '10 Cash', why: null });
    expect(byId.gas?.enabled).toBe(true);
    expect(byId.beta?.fields.locked).toBe(true);
    expect(byId.beta?.fields.why).toMatch(/^Needs /);
    expect(byId.beta?.enabled).toBe(false);
    // The send is shown only once she knows the arete: the talk's If, not a lock.
    expect(byId.send).toBeUndefined();
  });

  it('reads the facts and conditions the screens name after every step', () => {
    const wants = {
      facts: ['economy.amount(resource: cash)', 'flag.number(flag: bond)', 'nope.nothing'],
      conditions: ['flag.number(flag: bond) >= 1', 'not ('],
    };
    const play = cragPlay(wants);
    expect(play.view.facts).toEqual({
      'economy.amount(resource: cash)': 20,
      'flag.number(flag: bond)': 0,
      'nope.nothing': null,
    });
    expect(play.view.conditions).toEqual({ 'flag.number(flag: bond) >= 1': false, 'not (': null });
    play.act({ type: 'dialogue/say', option: 'first' });
    expect(play.view.facts['flag.number(flag: bond)']).toBe(1);
    expect(play.view.conditions['flag.number(flag: bond) >= 1']).toBe(true);
  });

  it('opens the shop’s shelf at the kit’s prices, and sells from the bag only while it is open', () => {
    const play = cragPlay();
    expect(fieldsOf(play.view.lists.bag)).toEqual([]);
    play.act({ type: 'dialogue/say', option: 'been' });
    play.act({ type: 'dialogue/say', option: 'gear' });
    expect(play.view.modes.at(-1)).toBe('shopping');
    expect(play.view.fields['shop.name']).toBe('The gear shop');
    const [rope] = play.view.lists.shelf ?? [];
    expect(rope?.fields).toEqual({
      item: 'rope',
      name: 'Rope',
      price: crag.fact(play.state, 'economy.price', { shop: 'gear-shop', item: 'rope' }),
      count: 1,
    });
    expect(rope?.action).toEqual({ type: 'economy/buy', item: 'rope' });
    expect(typeof rope?.fields.price).toBe('number');
  });

  it('lists every action on offer with words a button can use', () => {
    const play = cragPlay();
    expect(fieldsOf(play.view.lists.offered)).toEqual([
      { type: 'dialogue/say', label: 'Say first', enabled: true },
      { type: 'dialogue/say', label: 'Say been', enabled: true },
    ]);
  });

  it('refuses an action that isn’t on offer before the sim sees it', () => {
    const play = cragPlay();
    const before = play.view;
    const step = play.act({ type: 'dialogue/say', option: 'beta' });
    expect(step).toEqual({ view: before, beats: [], said: [], accepted: false });
    expect(play.view).toBe(before);
  });

  it('gives the step’s beats with the view after it', () => {
    const play = cragPlay();
    const step = play.act({ type: 'dialogue/say', option: 'first' });
    expect(step.accepted).toBe(true);
    expect(step.beats.map((b) => b.type)).toContain('dialogue/said');
    expect(step.view.turn).toBe(1);
  });

  it('shows the open event’s text and choices, the odds only where the event shows them', () => {
    const caravan = caravanWith(undefined, { first: 'raiders', start: 'choosing' });
    const play = startPlay(
      { game: caravan.game, sim: caravan.sim, kits: ['inventory', 'economy', 'events'], wants: none },
      'c',
    );
    expect(play.view.fields).toEqual({ 'event.name': 'Raiders', 'event.text': 'Bikes on the ridge.' });
    const byId = Object.fromEntries((play.view.lists.event ?? []).map((e) => [e.key, e]));
    expect(byId.pay?.fields).toMatchObject({ label: 'Pay the toll', cost: '30 Scrap', locked: false });
    expect(byId.pay?.action).toEqual({ type: 'events/choose', choice: 'pay' });
    expect(byId.fight?.fields.odds).toBeNull();
    expect(byId.parley).toBeUndefined();
  });

  it('lists the quests started in the journal, with their open objectives, and none waiting', () => {
    const dock = dockWith();
    const play = startPlay({ game: dock.game, sim: dock.sim, kits: ['quests'], wants: none }, 'dock');
    const journal = play.view.lists.journal ?? [];
    expect(journal.length).toBeGreaterThan(0);
    for (const entry of journal) {
      expect(entry.fields.state).not.toBe('waiting');
      expect(entry.enabled).toBe(false);
      expect(entry.action).toBeUndefined();
    }
  });

  it('applies no list whose kit is off', () => {
    const play = startPlay({ game: crag.game, sim: crag.sim, kits: [], wants: none }, 'crag');
    expect(Object.keys(play.view.lists)).toEqual(['offered']);
    expect(play.view.fields).toEqual({});
  });
});
