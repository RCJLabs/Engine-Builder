import { ENGINE_EVENTS, ENGINE_FACTS, KIT_EFFECT_FILES, knownFrom } from '@eb/schema';
import { describe, expect, it } from 'vitest';
import { kitEffectFile, newKitEffect } from './KitEffect.tsx';
import { holdsText } from './LogicBrowser.tsx';
import { doText, effectText, ifText, whenText } from './rowText.ts';
import { forEvent, moved, newEffect, newRow, newRowId, withArg, without } from './sheetEdits.ts';

describe('a row in words', () => {
  it('names the event by its label, with the arguments asked for', () => {
    expect(whenText({ event: 'flag/changed', args: { flag: 'met' } }, ENGINE_EVENTS)).toBe(
      'When a flag changes (flag: met)',
    );
    expect(whenText({ event: 'sheet/fired' }, ENGINE_EVENTS)).toBe('When a row runs');
    expect(whenText({ event: 'voyage/arrived', args: { day: 3 } }, ENGINE_EVENTS)).toBe('When voyage/arrived (day: 3)');
    expect(whenText({ event: '' }, ENGINE_EVENTS)).toBe('When an event not yet chosen');
  });

  it('reads the condition as describe does, text or tree, and shows text that doesn’t parse as written', () => {
    expect(ifText('flag.on(met)', ENGINE_FACTS)).toBe('If met is on');
    expect(ifText({ not: { fact: 'flag.on', args: { flag: 'met' } } }, ENGINE_FACTS)).toBe('If not met is on');
    expect(ifText('flag.on(', ENGINE_FACTS)).toBe('If flag.on(');
    expect(ifText(undefined, ENGINE_FACTS)).toBeUndefined();
  });

  it('says what each effect does, in the order written', () => {
    expect(
      doText([
        { effect: 'set-flag', flag: 'met', to: true },
        { effect: 'add-to-flag', flag: 'raids', by: -2 },
        { effect: 'roll', outcomes: [{ chance: 70 }, { chance: 30 }] },
        { effect: 'loot', table: 'wreck' },
      ]),
    ).toBe('Do: set met to on, then take 2 from raids, then roll 70 / 30, then loot');
    expect(effectText({ effect: 'set-flag', flag: '', to: 4 })).toBe('set a flag not yet chosen to 4');
    expect(effectText({ effect: '' })).toBe('an effect not yet named');
    expect(doText([])).toBe('Does nothing yet');
  });

  it('says a kit’s effects in a few words, and what isn’t chosen yet', () => {
    expect(
      doText([
        { effect: 'give-item', item: 'medkit', count: 2 },
        { effect: 'take-item', item: 'fuse' },
        { effect: 'roll-loot', table: 'wreck' },
        { effect: 'add-resource', resource: 'credits', by: 15 },
        { effect: 'add-resource', resource: 'fuel', by: -3 },
        { effect: 'pay-cost', cost: { credits: 10, fuel: 2 } },
        { effect: 'open-shop', shop: 'dutch-yard' },
      ]),
    ).toBe(
      'Do: give 2 × medkit, then take fuse, then roll wreck, then add 15 credits, then take 3 fuel, ' +
        'then pay 10 credits and 2 fuel, then open dutch-yard',
    );
    expect(effectText({ effect: 'give-item', item: '' })).toBe('give an item not yet chosen');
    expect(effectText({ effect: 'roll-loot' })).toBe('roll a loot table not yet chosen');
    expect(effectText({ effect: 'pay-cost', cost: {} })).toBe('pay a cost not yet set');
    expect(effectText({ effect: 'open-shop', shop: '' })).toBe('open a shop not yet chosen');
  });

  it('reads a faction’s facts by the faction’s id (M3.5)', () => {
    const { facts } = knownFrom({ kits: ['factions'] });
    expect(ifText('factions.reached(faction: guild, band: friendly)', facts)).toBe('If guild is at least friendly');
    expect(ifText('not factions.reached(faction: guild, band: friendly)', facts)).toBe(
      'If not guild is at least friendly',
    );
    expect(ifText('factions.band(guild) != hostile', facts)).toBe('If guild’s band is not hostile');
    expect(ifText('factions.standing(guild) >= 10 and factions.price(guild) < 100', facts)).toBe(
      'If guild’s standing is at least 10 and guild’s price share is less than 100',
    );
  });

  it('says what a flag holds', () => {
    expect(holdsText({ name: 'Met' })).toBe('On or off: starts off');
    expect(holdsText({ number: { min: 0, max: 10, start: 2 } })).toBe('A number from 0 to 10: starts at 2');
    expect(holdsText({ number: { max: 3 } })).toBe('A number up to 3: starts at 0');
  });
});

describe('sheet edits', () => {
  it('names a new row by the first free row-n, and starts it sound', () => {
    expect(newRowId([])).toBe('row-1');
    expect(newRowId([{ id: 'row-1' }, { id: 'row-3' }])).toBe('row-2');
    expect(newRow([{ id: 'row-1' }])).toEqual({ id: 'row-2', when: { event: 'flag/changed' }, do: [] });
  });

  it('moves and takes out items, leaving what it was given as it was', () => {
    const list = ['a', 'b', 'c'];
    expect(moved(list, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moved(list, 2, 3)).toEqual(list);
    expect(without(list, 1)).toEqual(['a', 'c']);
    expect(list).toEqual(['a', 'b', 'c']);
  });

  it('sets and clears an event’s argument, leaving args out once none is left', () => {
    const when = { event: 'flag/changed' };
    const set = withArg(when, 'flag', 'met');
    expect(set).toEqual({ event: 'flag/changed', args: { flag: 'met' } });
    expect(withArg(set, 'flag', undefined)).toEqual({ event: 'flag/changed' });
    expect(when).toEqual({ event: 'flag/changed' });
    expect(forEvent('sheet/fired')).toEqual({ event: 'sheet/fired' });
  });

  it('says the stats and gear kits’ effects in a few words, whose first', () => {
    expect(
      doText([
        { effect: 'add-to-stat', actor: 'ana', stat: 'aim', by: 2 },
        { effect: 'add-to-stat', actor: 'ana', stat: 'aim', by: -1 },
        { effect: 'damage-stat', actor: 'ana', stat: 'health', by: 3 },
        { effect: 'heal-stat', actor: 'ana', stat: 'health' },
        { effect: 'heal-stat', actor: 'ana', stat: 'health', by: 5 },
        { effect: 'add-status', actor: 'bo', status: 'bleeding', stacks: 2 },
        { effect: 'remove-status', actor: 'bo', status: 'bleeding' },
        { effect: 'equip', actor: 'bo', item: 'rifle' },
        { effect: 'unequip', actor: 'bo', slot: 'hand' },
      ]),
    ).toBe(
      'Do: add 2 to ana’s aim, then take 1 from ana’s aim, then damage ana’s health by 3, then heal all of ' +
        'ana’s health, then heal ana’s health by 5, then add 2 × bleeding to bo, then remove bleeding from bo, ' +
        'then equip bo with rifle, then unequip bo’s hand',
    );
    expect(effectText({ effect: 'damage-stat', stat: 'health', by: 2 })).toBe(
      'damage health of an actor not yet chosen by 2',
    );
    expect(effectText({ effect: 'add-status', actor: '' })).toBe(
      'add a status not yet chosen to an actor not yet chosen',
    );
  });

  it('says the factions and time kits’ effects in a few words, lengths in the units written (M3.5)', () => {
    expect(
      doText([
        { effect: 'change-standing', faction: 'guild', by: 5 },
        { effect: 'change-standing', faction: 'guild', by: -3 },
        { effect: 'wait', days: 1, hours: 6 },
        { effect: 'wait', hours: 1 },
        { effect: 'cancel-timer', timer: 'harvest' },
        { effect: 'schedule', after: { days: 3 }, effects: [{ effect: 'set-flag', flag: 'met', to: true }] },
        { effect: 'schedule', after: { days: 1 }, every: { weeks: 2 }, effects: [] },
      ]),
    ).toBe(
      'Do: add 5 to guild’s standing, then take 3 from guild’s standing, then wait 1 day and 6 hours, ' +
        'then wait 1 hour, then cancel the timer harvest, then do 1 effect in 3 days, ' +
        'then do 0 effects in 1 day and every 2 weeks after',
    );
    expect(effectText({ effect: 'change-standing', by: 2 })).toBe('add 2 to the standing of a faction not yet chosen');
    expect(effectText({ effect: 'wait', days: 0 })).toBe('wait a length not yet set');
  });

  it('says the roster kit’s effects in a few words (M3.6)', () => {
    expect(
      doText([
        { effect: 'recruit', recruit: 'deckhand' },
        { effect: 'join', actor: 'ana' },
        { effect: 'leave', actor: 'ana', why: 'dead' },
        { effect: 'change-bond', actor: 'ana', with: 'bo', by: 2 },
        { effect: 'change-bond', actor: 'ana', with: 'bo', by: -1 },
        { effect: 'change-bonds', by: 1 },
        { effect: 'change-bonds', by: -2 },
        { effect: 'open-hall', hall: 'dock' },
        { effect: 'refresh-hall', hall: 'dock' },
      ]),
    ).toBe(
      'Do: recruit deckhand, then put ana on the roster, then take ana off the roster: dead, ' +
        'then add 2 to the bond of ana and bo, then take 1 from the bond of ana and bo, ' +
        'then add 1 to every bond on the roster, then take 2 from every bond on the roster, ' +
        'then open dock, then start dock’s next round',
    );
    expect(effectText({ effect: 'recruit', recruit: '' })).toBe('recruit from a template not yet chosen');
    expect(effectText({ effect: 'leave', actor: '' })).toBe('take an actor not yet chosen off the roster');
    expect(effectText({ effect: 'change-bond', actor: 'ana', by: 1 })).toBe(
      'add 1 to the bond of ana and an actor not yet chosen',
    );
    expect(effectText({ effect: 'refresh-hall' })).toBe('start the next round of a hall not yet chosen');
    expect(kitEffectFile('recruit', ['stats', 'roster'])?.kit).toBe('roster');
    expect(kitEffectFile('recruit', ['stats'])).toBeUndefined();
  });

  it('says the events kit’s effects in a few words (M3.7)', () => {
    const open = { effect: 'open-event', event: 'debt-due' };
    expect(
      doText([
        { effect: 'open-event', event: 'raiders' },
        { effect: 'draw-event', deck: 'road' },
        { effect: 'later', id: 'debt', after: { flag: 'nodes', by: 3 }, do: [open] },
        { effect: 'later', after: { days: 2 }, do: [open, open] },
        { effect: 'later', after: { choices: 1 }, do: [] },
        { effect: 'cancel-later', id: 'debt' },
      ]),
    ).toBe(
      'Do: open the event raiders, then draw an event from road, then debt: do 1 effect once nodes has ' +
        'risen by 3, then do 2 effects after 2 days, then do 0 effects after 1 choice, then cancel the consequence debt',
    );
    expect(effectText({ effect: 'later', after: { flag: 'nodes' }, do: [open] })).toBe(
      'do 1 effect once nodes has risen by 1',
    );
    expect(effectText({ effect: 'later', after: { days: 1, choices: 2 }, do: [] })).toBe(
      'do 0 effects later, when is not yet set',
    );
    expect(effectText({ effect: 'open-event' })).toBe('open the event an event not yet chosen');
    expect(effectText({ effect: 'cancel-later', id: '' })).toBe('cancel the consequence a consequence not yet chosen');
    expect(kitEffectFile('later', ['events'])?.fields.do).toEqual({ kind: 'effects', label: 'Do' });
    expect(kitEffectFile('later', ['roster'])).toBeUndefined();
  });

  it('says the dialogue kit’s open-talk in a few words (M3.8)', () => {
    expect(doText([{ effect: 'open-talk', talk: 'marge' }, { effect: 'open-talk' }])).toBe(
      'Do: open the talk marge, then open the talk a talk not yet chosen',
    );
    expect(kitEffectFile('open-talk', ['dialogue'])?.fields.talk).toMatchObject({ kind: 'ref', to: 'talk' });
    expect(kitEffectFile('open-talk', ['events'])).toBeUndefined();
  });

  it('draws the time kit’s Wait in the calendar’s lengths, and gives schedule no form (M3.5)', () => {
    const lengths = (calendar?: { ticksPerDay: number; units?: Record<string, number> }) =>
      Object.keys(kitEffectFile('wait', ['time'], calendar)?.fields ?? {});
    expect(lengths()).toEqual(['ticks', 'days']);
    expect(lengths({ ticksPerDay: 24, units: { hours: 1, weeks: 168 } })).toEqual(['ticks', 'days', 'hours', 'weeks']);
    expect(kitEffectFile('schedule', ['time'])).toBeUndefined();
    expect(kitEffectFile('change-standing', ['factions'])?.kit).toBe('factions');
    expect(kitEffectFile('change-standing', ['time'])).toBeUndefined();
  });

  it('offers a kit’s effect only with its kit on', () => {
    expect(kitEffectFile('give-item', ['inventory'])?.kit).toBe('inventory');
    expect(kitEffectFile('pay-cost', ['inventory'])).toBeUndefined();
    expect(kitEffectFile('pay-cost', ['inventory', 'economy'])?.kit).toBe('economy');
    expect(kitEffectFile('set-flag', ['inventory', 'economy'])).toBeUndefined();
  });

  it('makes a new kit effect as a new record is made: what must be filled in, empty', () => {
    const give = kitEffectFile('give-item', ['inventory']);
    expect(give && newKitEffect(give)).toEqual({ effect: 'give-item', item: '' });
    for (const file of KIT_EFFECT_FILES) {
      const required = Object.entries(file.fields).filter(([, def]) => !def.optional);
      expect(Object.keys(newKitEffect(file))).toEqual(['effect', ...required.map(([name]) => name)]);
    }
  });

  it('makes each new effect a copy of its own', () => {
    const a = newEffect('roll');
    const b = newEffect('roll');
    expect(a).toEqual(b);
    const outcomes = (effect: unknown) => (effect as { outcomes: unknown[] }).outcomes;
    expect(outcomes(a)).not.toBe(outcomes(b));
  });
});
