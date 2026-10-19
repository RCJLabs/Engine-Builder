/**
 * Offers (docs/specs/roster.md#offers): recruits rolled from templates and worked out again from
 * the salt each time they are asked for. The draws are made here by hand, in the spec's order, so
 * a change to the order fails here before it changes every save's recruits.
 */
import { createRecordStore, type GameState, Rng } from '@eb/core';
import { describe, expect, it } from 'vitest';
import { mustered, musterWith, RECORDS } from '../../test/muster.ts';
import { feeOf, NAME_TRIES, nextRecruit, type Offer, offerAt, roll } from './offers.ts';
import type { RecruitRecord, RosterSlice } from './types.ts';

const slice = (state: GameState) => state.roster as RosterSlice;
const content = createRecordStore(RECORDS as Record<string, Record<string, unknown>>);
type Template = RecruitRecord;

/** A recruit drawn by hand from a stream, as the spec lists the draws: name, stats by id, traits until `most`. */
function rolledByHand(template: Template, rng: Rng, worn: ReadonlySet<string>) {
  let name = '';
  for (let i = 0; i < NAME_TRIES; i++) {
    const first = template.names[rng.int(0, template.names.length - 1)] as string;
    const by = template.bynames ? template.bynames[rng.int(0, template.bynames.length - 1)] : undefined;
    name = by === undefined ? first : `${first} ${by}`;
    if (!worn.has(name)) break;
  }
  const stats: Record<string, number> = {};
  const ranges = template.stats ?? {};
  for (const id of Object.keys(ranges).sort()) {
    const { min, max } = ranges[id] as { min: number; max?: number };
    stats[id] = rng.int(min, max ?? min);
  }
  const traits: string[] = [];
  for (const trait of template.traits ?? []) {
    if (traits.length === template.most) break;
    if (rng.int(1, 100) <= trait.chance) traits.push(trait.status);
  }
  return { name, stats, traits };
}

function offerByHand(salt: number, hall: keyof typeof RECORDS.hall, round: number, slot: number) {
  const rng = Rng.create(`${salt}/${hall}/${round}/${slot}`);
  const offered = RECORDS.hall[hall].recruits as readonly { recruit: string; weight?: number }[];
  const total = offered.reduce((sum, r) => sum + (r.weight ?? 1), 0);
  let pick = rng.int(0, total - 1);
  let index = 0;
  for (; pick >= (offered[index]?.weight ?? 1); index++) pick -= offered[index]?.weight ?? 1;
  const from = offered[index] as { recruit: string };
  const template = RECORDS.recruit[from.recruit as keyof typeof RECORDS.recruit] as Template;
  return { recruit: from.recruit, ...rolledByHand(template, rng, new Set(['Ana', 'Bo'])) };
}

const plain = (offer: Offer) => ({
  recruit: offer.recruit,
  name: offer.name,
  stats: offer.stats ?? {},
  traits: offer.traits ?? [],
});

describe('offers', () => {
  it('are the spec’s draws, in its order, from the salt, the hall, the round and the slot', () => {
    const roster = slice(mustered.start());
    for (const round of [0, 1, 4]) {
      const at = { ...roster, halls: { dock: { round }, camp: { round } } };
      for (const slot of [0, 1, 2, 7]) {
        expect(plain(offerAt(content, at, 'dock', slot))).toEqual(offerByHand(roster.salt, 'dock', round, slot));
        expect(plain(offerAt(content, at, 'camp', slot))).toEqual(offerByHand(roster.salt, 'camp', round, slot));
      }
    }
  });

  it('are the same however often and in whatever order they are asked for, and after a save', () => {
    const roster = slice(mustered.start());
    const first = [0, 1].map((slot) => offerAt(content, roster, 'dock', slot));
    const backwards = [1, 0].map((slot) => offerAt(content, roster, 'dock', slot)).reverse();
    const saved = JSON.parse(JSON.stringify(roster)) as RosterSlice;
    expect(backwards).toEqual(first);
    expect([0, 1].map((slot) => offerAt(content, saved, 'dock', slot))).toEqual(first);
  });

  it('come from a salt drawn once from the seed', () => {
    expect(slice(mustered.start('a')).salt).toBe(slice(mustered.start('a')).salt);
    expect(slice(mustered.start('a')).salt).not.toBe(slice(mustered.start('b')).salt);
    const salt = slice(mustered.start('a')).salt;
    expect(Number.isSafeInteger(salt) && salt >= 0 && salt < 2 ** 31).toBe(true);
  });

  it('cost the template’s fee and each drawn trait’s, by resource', () => {
    const deckhand = RECORDS.recruit.deckhand as Template;
    expect(feeOf(deckhand)).toEqual({ credits: 30 });
    expect(feeOf(deckhand, ['steady', 'sharp'])).toEqual({ credits: 60 });
    const odd = { ...deckhand, fee: undefined, traits: [{ status: 'sharp', chance: 5, fee: { scrap: 2 } }] };
    expect(feeOf(odd, ['sharp'])).toEqual({ scrap: 2 });
    expect(feeOf(odd, [])).toEqual({});
    for (let slot = 0; slot < 20; slot++) {
      const offer = offerAt(content, slice(mustered.start()), 'dock', slot);
      const template = RECORDS.recruit[offer.recruit as keyof typeof RECORDS.recruit] as Template;
      expect(offer.fee).toEqual(feeOf(template, offer.traits));
    }
  });
});

describe('rolling a recruit', () => {
  const lone: Template = { actor: 'doc', names: ['Ana'], stats: { aim: { min: 0, max: 1000 } } };

  it('draws a name again while a member wears it, then keeps the 20th', () => {
    const worn = new Set(['Ana']);
    for (const seed of ['a', 'b', 'c']) {
      const rolled = roll(lone, 'lone', Rng.create(seed), worn);
      // Every draw is "Ana", so the stat is drawn after all 20 of them.
      expect(rolled).toEqual({ recruit: 'lone', name: 'Ana', stats: rolledByHand(lone, Rng.create(seed), worn).stats });
      const two = roll({ ...lone, names: ['Ana', 'Une'] }, 'lone', Rng.create(seed), worn);
      expect(two.name).toBe('Une');
    }
    // A name no member wears is kept at the first draw.
    expect(roll(lone, 'lone', Rng.create('a'), new Set()).stats).toEqual(
      rolledByHand(lone, Rng.create('a'), new Set()).stats,
    );
  });

  it('stops drawing traits once `most` are drawn, and draws each in turn without it', () => {
    const sure = [
      { status: 'steady', chance: 100 },
      { status: 'sharp', chance: 100 },
    ];
    const template: Template = { actor: 'doc', names: ['Ida'], traits: sure };
    expect(roll({ ...template, most: 1 }, 't', Rng.create('x'), new Set()).traits).toEqual(['steady']);
    expect(roll(template, 't', Rng.create('x'), new Set()).traits).toEqual(['steady', 'sharp']);
    expect(roll({ ...template, most: 0 }, 't', Rng.create('x'), new Set()).traits).toBeUndefined();
    const never = { ...template, traits: [{ status: 'steady', chance: 1 }] };
    const counts = Array.from({ length: 200 }, (_, i) => roll(never, 't', Rng.create(`n${i}`), new Set()));
    expect(counts.filter((r) => r.traits !== undefined).length).toBeLessThan(10);
  });

  it('by the recruit effect draws from the recruit’s number, without a template to pick', () => {
    const roster = slice(mustered.start());
    const deckhand = RECORDS.recruit.deckhand as Template;
    for (const next of [0, 1, 9]) {
      const at = { ...roster, next };
      const rolled = nextRecruit(content, at, 'deckhand');
      const byHand = rolledByHand(deckhand, Rng.create(`${roster.salt}/recruit/${next}`), new Set(['Ana', 'Bo']));
      expect({ name: rolled.name, stats: rolled.stats ?? {}, traits: rolled.traits ?? [] }).toEqual(byHand);
    }
    expect(() => nextRecruit(content, roster, 'pirate')).toThrow('No recruit "pirate"');
  });

  it('reads names worn by recruits too, through the game’s content', () => {
    const {
      start,
      apply,
      content: contentOf,
    } = musterWith({
      ...RECORDS,
      recruit: { ...RECORDS.recruit, lone: { actor: 'doc', names: ['Ida', 'Une'] } },
    });
    let state = start();
    const names = new Set<string>();
    for (let i = 0; i < 2; i++) {
      state = apply(state, { effect: 'recruit', recruit: 'lone' });
      const id = slice(state).members.at(-1) as string;
      names.add((contentOf(state).get('actor', id) as { name: string }).name);
    }
    // Two of them, two names: the second was drawn again while the first was worn.
    expect([...names].sort()).toEqual(['Ida', 'Une']);
  });
});
