import { describe, expect, it } from 'vitest';
import { CRIXUS, FIGHTER } from '../../test/fighter.ts';
import {
  assetSites,
  conditionMentions,
  fillField,
  missingField,
  refSites,
  removeField,
  renameAssetRefs,
  renameAtPointers,
  renameChoice,
  renameClashes,
  renameField,
  renameRecordRefs,
  renameTypeRefs,
  retargetRefs,
} from './rewrites.ts';

type Fighter = typeof CRIXUS;
const BOUTS = ['fields', 'bouts', 'of'];

describe('fields in records', () => {
  it('renames a field where it stands, at the top and inside groups of lists and maps', () => {
    const top = renameField(FIGHTER, [], 'style', 'manner')(CRIXUS) as Record<string, unknown>;
    expect(Object.keys(top).slice(0, 3)).toEqual(['name', 'manner', 'school']);
    expect(top.manner).toBe('murmillo');
    const items = renameField(FIGHTER, BOUTS, 'won', 'victory')(CRIXUS) as Fighter;
    expect(items.bouts).toEqual([
      { foe: 'fighter:spartacus', victory: false },
      { foe: 'beast:lion', victory: true },
    ]);
    const values = renameField(FIGHTER, ['fields', 'allies', 'of'], 'since', 'from')(CRIXUS) as Fighter;
    expect(values.allies).toEqual({ oenomaus: { from: 70 } });
    const group = renameField(FIGHTER, ['fields', 'record'], 'wins', 'victories')(CRIXUS) as Fighter;
    expect(group.record).toEqual({ victories: 12, losses: 1 });
  });

  it('leaves a record without the field as it is, the same object', () => {
    const bare = { name: 'Nobody' };
    expect(renameField(FIGHTER, [], 'style', 'manner')(bare)).toBe(bare);
    expect(renameField(FIGHTER, BOUTS, 'won', 'victory')(bare)).toBe(bare);
    expect(removeField(FIGHTER, [], 'style')(bare)).toBe(bare);
  });

  it('counts the objects a rename would clash in, and leaves them be', () => {
    const both = { ...CRIXUS, manner: 'odd' };
    expect(renameClashes(FIGHTER, [], 'style', 'manner', both)).toBe(1);
    expect(renameClashes(FIGHTER, [], 'style', 'manner', CRIXUS)).toBe(0);
    // Holding the new name without the old one is no clash: the rename doesn't touch it.
    const { style: _style, ...only } = both;
    expect(renameClashes(FIGHTER, [], 'style', 'manner', only)).toBe(0);
    expect(renameField(FIGHTER, [], 'style', 'manner')(both)).toBe(both);
    const items = { ...CRIXUS, bouts: [{ foe: 'beast:lion', won: true, victory: 1 }, { won: false }] };
    expect(renameClashes(FIGHTER, BOUTS, 'won', 'victory', items)).toBe(1);
  });

  it('removes a field from every object of its group', () => {
    const next = removeField(FIGHTER, BOUTS, 'won')(CRIXUS) as Fighter;
    expect(next.bouts).toEqual([{ foe: 'fighter:spartacus' }, { foe: 'beast:lion' }]);
    expect(Object.hasOwn(removeField(FIGHTER, [], 'record')(CRIXUS) as object, 'record')).toBe(false);
  });

  it('fills a field where its group leaves it out, in the type’s order, each a copy of its own', () => {
    const { school: _, ...without } = CRIXUS;
    const filled = fillField(FIGHTER, [], 'school', 'ludus-dacicus')(without) as Fighter;
    expect(Object.keys(filled).slice(0, 4)).toEqual(['name', 'style', 'school', 'rival']);
    expect(fillField(FIGHTER, [], 'school', 'ludus-dacicus')(CRIXUS)).toBe(CRIXUS);
    const items = { ...CRIXUS, bouts: [{ foe: 'beast:lion' }, { won: true }, { foe: 'beast:bear', won: false }] };
    expect(missingField(FIGHTER, BOUTS, 'won', items)).toBe(1);
    expect(missingField(FIGHTER, BOUTS, 'foe', items)).toBe(1);
    // Counted in the group's objects, not the record: the record has a name, the bouts don't.
    expect(missingField(FIGHTER, BOUTS, 'name', items)).toBe(3);
    const made = fillField(FIGHTER, BOUTS, 'won', { by: [] })(items) as { bouts: Record<string, unknown>[] };
    expect(made.bouts.map((bout) => Object.keys(bout))).toEqual([['foe', 'won'], ['won'], ['foe', 'won']]);
    expect(made.bouts[0]?.won).toEqual({ by: [] });
    // Each object filled gets a copy of its own, never the value given.
    const given = { by: [] };
    const two = { ...CRIXUS, bouts: [{ foe: 'beast:lion' }, { foe: 'beast:bear' }] };
    const copies = fillField(FIGHTER, BOUTS, 'won', given)(two) as { bouts: Record<string, unknown>[] };
    expect(copies.bouts[0]?.won).toEqual(given);
    expect(copies.bouts[0]?.won).not.toBe(given);
    expect(copies.bouts[0]?.won).not.toBe(copies.bouts[1]?.won);
  });
});

describe('choices in records', () => {
  it('renames a choice in fields and list items', () => {
    expect((renameChoice(FIGHTER, ['fields', 'style'], 'murmillo', 'myrmillo')(CRIXUS) as Fighter).style).toBe(
      'myrmillo',
    );
    expect((renameChoice(FIGHTER, ['fields', 'moods', 'of'], 'wild', 'fierce')(CRIXUS) as Fighter).moods).toEqual([
      'fierce',
      'calm',
      'fierce',
    ]);
    expect(renameChoice(FIGHTER, ['fields', 'style'], 'retiarius', 'net-fighter')(CRIXUS)).toBe(CRIXUS);
  });

  it('renames a map’s keys when the choice is a key, keeping their place and refusing a taken one', () => {
    const titles = renameChoice(FIGHTER, ['fields', 'titles', 'key'], 'gold', 'aureus')(CRIXUS) as Fighter;
    expect(titles.titles).toEqual({ aureus: 'Champion of Capua' });
    const both = { ...CRIXUS, titles: { gold: 'a', silver: 'b' } };
    expect(renameChoice(FIGHTER, ['fields', 'titles', 'key'], 'gold', 'silver')(both)).toBe(both);
  });
});

describe('references in records', () => {
  it('lists every ref site with what it may name', () => {
    expect(refSites(FIGHTER).map(({ path, key, to, single }) => `${path.join('.')} ${key} ${to} ${single}`)).toEqual([
      'fields.school false school true',
      'fields.rival false fighter,beast false',
      'fields.bouts.of.fields.foe false fighter,beast false',
      'fields.kit.key true weapon true',
      'fields.spoils.key true weapon,beast false',
    ]);
  });

  it('renames a record’s id in bare refs, qualified refs and map keys', () => {
    const school = renameRecordRefs(FIGHTER, 'school', 'ludus-magnus', 'ludus-maximus')(CRIXUS) as Fighter;
    expect(school.school).toBe('ludus-maximus');
    const lion = renameRecordRefs(FIGHTER, 'beast', 'lion', 'leo')(CRIXUS) as Fighter;
    expect(lion.bouts[1]?.foe).toBe('beast:leo');
    expect(lion.spoils).toEqual({ 'weapon:trident': 1, 'beast:leo': 2 });
    expect(Object.keys(lion.spoils)).toEqual(['weapon:trident', 'beast:leo']);
    const gladius = renameRecordRefs(FIGHTER, 'weapon', 'gladius', 'sword')(CRIXUS) as Fighter;
    expect(Object.keys(gladius.kit)).toEqual(['sword', 'net']);
    const self = renameRecordRefs(FIGHTER, 'fighter', 'spartacus', 'spartacus-thrax')(CRIXUS) as Fighter;
    expect(self.rival).toBe('fighter:spartacus-thrax');
    expect(self.bouts[0]?.foe).toBe('fighter:spartacus-thrax');
  });

  it('renames at the index’s pointers: values bare or qualified, map keys in place, conditions left', () => {
    const event = {
      choices: [
        {
          needs: 'resource.at(coin) >= 5',
          cost: { stores: 1, coin: 5 },
          effects: [{ effect: 'fight', encounter: 'raiders' }],
        },
        { effects: [{ effect: 'give', item: 'resource:coin' }] },
      ],
    };
    const pointers = ['/choices/0/needs', '/choices/0/cost/coin', '/choices/1/effects/0/item', '/choices/9/gone'];
    const renamed = renameAtPointers(pointers, 'resource', 'coin', 'shilling')(event) as typeof event;
    expect(renamed.choices[0]?.needs).toBe('resource.at(coin) >= 5');
    expect(Object.keys(renamed.choices[0]?.cost ?? {})).toEqual(['stores', 'shilling']);
    expect(renamed.choices[1]?.effects[0]).toEqual({ effect: 'give', item: 'resource:shilling' });
    expect(renameAtPointers(['/choices/0/effects/0/encounter'], 'encounter', 'raiders', 'sloop')(event)).toMatchObject({
      choices: [{ effects: [{ encounter: 'sloop' }] }, {}],
    });
    // Nothing to change gives the record back as it was, so its file isn't touched.
    expect(renameAtPointers(['/choices/0/cost/coin'], 'resource', 'pearls', 'gems')(event)).toBe(event);
  });

  it('reads a list of one type as a list: its refs are qualified', () => {
    const file = { title: 'T', fields: { home: { kind: 'ref', to: ['school'] } } };
    expect(renameRecordRefs(file, 'school', 'ludus-magnus', 'ludus-maximus')({ home: 'school:ludus-magnus' })).toEqual({
      home: 'school:ludus-maximus',
    });
    expect(renameRecordRefs(file, 'school', 'ludus-magnus', 'x')({ home: 'ludus-magnus' })).toEqual({
      home: 'ludus-magnus',
    });
  });

  it('never takes an id of another type, or a word inside an id', () => {
    // "lion" is a beast; a fighter called lion isn't the same record.
    expect(renameRecordRefs(FIGHTER, 'fighter', 'lion', 'leo')(CRIXUS)).toBe(CRIXUS);
    expect(renameRecordRefs(FIGHTER, 'school', 'ludus', 'x')(CRIXUS)).toBe(CRIXUS);
    // A school id in a field of weapons is a weapon id.
    const odd = { ...CRIXUS, kit: { 'ludus-magnus': 1 } };
    expect(renameRecordRefs(FIGHTER, 'school', 'ludus-magnus', 'x')(odd)).toEqual({ ...odd, school: 'x' });
  });

  it('renames a type in qualified refs only: a field of one type holds bare ids', () => {
    const next = renameTypeRefs(FIGHTER, 'beast', 'animal')(CRIXUS) as Fighter;
    expect(next.bouts[1]?.foe).toBe('animal:lion');
    expect(next.spoils).toEqual({ 'weapon:trident': 1, 'animal:lion': 2 });
    expect(next.rival).toBe('fighter:spartacus');
    expect(renameTypeRefs(FIGHTER, 'school', 'academy')(CRIXUS)).toBe(CRIXUS);
  });

  it('qualifies bare ids when a ref takes several types, and unqualifies them back', () => {
    const many = retargetRefs(FIGHTER, ['fields', 'school'], 'school', ['school', 'guild'])(CRIXUS) as Fighter;
    expect(many.school).toBe('school:ludus-magnus');
    const keys = retargetRefs(FIGHTER, ['fields', 'kit', 'key'], 'weapon', ['beast', 'weapon'])(CRIXUS) as Fighter;
    expect(keys.kit).toEqual({ 'weapon:gladius': 1, 'weapon:net': 2 });
    const one = retargetRefs(FIGHTER, ['fields', 'rival'], ['fighter', 'beast'], 'fighter')(CRIXUS) as Fighter;
    expect(one.rival).toBe('spartacus');
    // A ref of a type no longer named stays, and won't fit.
    const beast = retargetRefs(FIGHTER, BOUTS.concat('fields', 'foe'), ['fighter', 'beast'], 'fighter')(CRIXUS);
    expect((beast as Fighter).bouts.map((b) => b.foe)).toEqual(['spartacus', 'beast:lion']);
    expect(retargetRefs(FIGHTER, ['fields', 'school'], 'school', 'guild')(CRIXUS)).toBe(CRIXUS);
  });
});

describe('assets in records', () => {
  const ART = {
    title: 'Art',
    fields: {
      portrait: { kind: 'asset', of: 'image' },
      gallery: { kind: 'list', of: { kind: 'asset' } },
      art: { kind: 'map', of: { kind: 'asset' } },
      caption: { kind: 'text' },
    },
  };

  it('finds every asset def: fields, list items and map values', () => {
    expect(assetSites(ART)).toEqual([
      ['fields', 'portrait'],
      ['fields', 'gallery', 'of'],
      ['fields', 'art', 'of'],
    ]);
    expect(assetSites(FIGHTER)).toEqual([]);
  });

  it('renames a file where a record names it, and nothing else, a text that says it included', () => {
    const record = {
      portrait: 'a.png',
      gallery: ['a.png', 'b.png'],
      art: { x: 'a.png', y: 'c.png' },
      caption: 'a.png',
    };
    expect(renameAssetRefs(ART, 'a.png', 'z.png')(record)).toEqual({
      portrait: 'z.png',
      gallery: ['z.png', 'b.png'],
      art: { x: 'z.png', y: 'c.png' },
      caption: 'a.png',
    });
    const other = { portrait: 'q.png', gallery: ['b.png'], art: {}, caption: '' };
    expect(renameAssetRefs(ART, 'a.png', 'z.png')(other)).toBe(other);
  });
});

describe('conditions', () => {
  it('finds a record’s id as a word in text and in trees, never inside a fact’s name', () => {
    expect(conditionMentions(FIGHTER, CRIXUS, 'spartacus').map((p) => p.join('.'))).toEqual(['fields.fights']);
    expect(conditionMentions(FIGHTER, CRIXUS, 'day')).toEqual([]);
    expect(conditionMentions(FIGHTER, CRIXUS, 'arena')).toEqual([]);
    expect(conditionMentions(FIGHTER, CRIXUS, 'spart')).toEqual([]);
    const tree = { ...CRIXUS, fights: { fact: 'rival.is', args: { who: 'fighter:spartacus' } } };
    expect(conditionMentions(FIGHTER, tree, 'spartacus')).toHaveLength(1);
    expect(conditionMentions(FIGHTER, { name: 'x' }, 'spartacus')).toEqual([]);
  });
});
