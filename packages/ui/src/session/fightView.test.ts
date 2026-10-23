/**
 * A fight's odds in a play's view (M4.7, docs/specs/encounters.md#on-screen): an event's choice
 * that fights shows each result's chance, the hurt and the falls, and what it does, worded from the
 * fight's own preview, the table it rolls; with the event's odds hidden it shows none.
 */
import { createGame, createRecordStore, defineModule, engineModules, type Module, type SimContext } from '@eb/core';
import { kitModules } from '@eb/kits';
import { describe, expect, it } from 'vitest';
import { startPlay } from './play.ts';
import { fightText } from './words.ts';

const records = (showOdds: boolean) => ({
  stat: { hull: { name: 'Hull', min: 0 }, aim: { name: 'Aim', min: 0, start: 60 }, guns: { name: 'Guns', start: 2 } },
  resource: { credits: { name: 'Credits', start: 30 } },
  actor: { ship: { name: 'The ship', stats: { hull: 6 } }, raider: { name: 'Raider', stats: { hull: 4, aim: 50 } } },
  combat: { broadside: { health: 'hull', hit: 'aim', damage: 'guns', rounds: 6 } },
  encounter: {
    raiders: {
      combat: 'broadside',
      fighters: ['ship'],
      foes: [{ actor: 'raider' }],
      win: [{ effect: 'add-resource', resource: 'credits', by: 12 }],
    },
  },
  event: {
    hostile: {
      name: 'Hostile ship',
      ...(showOdds ? { 'show-odds': true } : {}),
      choices: [
        { id: 'fight', label: 'Fight', effects: [{ effect: 'fight', encounter: 'raiders' }] },
        { id: 'flee', label: 'Burn away' },
      ],
    },
  },
});

const KITS = ['inventory', 'economy', 'stats', 'events', 'encounters'];
const hailed = defineModule<Record<string, never>>({
  id: 'sea',
  init: () => ({}),
  start: (ctx) => ctx.apply({ effect: 'open-event', event: 'hostile' }),
  modes: { sea: { actions: [] } },
});

function playOf(showOdds: boolean) {
  const modules: Module[] = [...engineModules, ...kitModules(KITS), hailed];
  const game = createGame({ modules, start: 'sea' });
  const sim: SimContext = { content: createRecordStore(records(showOdds)) };
  return { game, sim, play: startPlay({ game, sim, kits: KITS, wants: { facts: [], conditions: [] } }, 'sea') };
}

describe('a fight on screen', () => {
  it('words a fight choice’s odds from its preview, each result with its hurt, falls and what it does', () => {
    const { game, sim, play } = playOf(true);
    const [fight, flee] = play.view.lists.event ?? [];
    const preview = game.preview(play.state, [{ effect: 'fight', encounter: 'raiders' }], sim)[0];
    expect(fight?.fields.odds).toBe(fightText([preview], sim.content));
    const outcomes = (preview as unknown as { outcomes: { result: string; chance: number }[] }).outcomes;
    const words = String(fight?.fields.odds);
    for (const { result, chance } of outcomes) {
      expect(words).toContain(`${{ win: 'Win', draw: 'Draw', lose: 'Lose' }[result]} ${chance}%`);
    }
    expect(words).toMatch(/Win \d+%, \d+(–\d+)? Hull lost, Credits 30 → 42/);
    expect(words).toMatch(/Lose \d+%, 6 Hull lost, 1 falls/);
    expect(flee?.fields.odds).toBeNull();
  });

  it('shows no odds for a fight in an event that hides them', () => {
    const { play } = playOf(false);
    expect(play.view.lists.event?.[0]?.fields.odds).toBeNull();
  });

  it('says nothing of hurt or falls a result can’t have, and a range of one number as the number', () => {
    const content = createRecordStore({ stat: { vigour: { name: 'Vigour' } } });
    const fight = {
      effect: 'fight',
      health: 'vigour',
      outcomes: [
        { result: 'win', chance: 70, hurt: [0, 0], falls: [0, 0], effects: [] },
        { result: 'draw', chance: 10, hurt: [3, 3], falls: [0, 1], effects: [] },
        { result: 'lose', chance: 20, hurt: [4, 9], falls: [1, 2], effects: [] },
      ],
    };
    expect(fightText([{ effect: 'pay-cost' }, fight], content)).toBe(
      'Win 70% · Draw 10%, 3 Vigour lost, 0–1 fall · Lose 20%, 4–9 Vigour lost, 1–2 fall',
    );
    expect(fightText([{ effect: 'pay-cost' }], content)).toBeNull();
    expect(fightText(undefined, content)).toBeNull();
  });
});
