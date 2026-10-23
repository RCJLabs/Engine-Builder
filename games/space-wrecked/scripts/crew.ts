import type { Module, ModuleContext } from 'eb';
import { defineModule } from 'eb';
import { crewOf, type Read, stepped } from './shared';

type Ctx = ModuleContext<Record<string, never>>;
const reader =
  (ctx: Ctx): Read =>
  (id, args) =>
    ctx.fact(id, args);

const hpOf = (ctx: Ctx, actor: string) => ctx.fact('stats.current', { actor, stat: 'hp' }) as number;

/**
 * Hit points off one crew member with more than 1, rolled, or off everyone with more than 1
 * (`all`): never the last one (the original's events.js wound).
 */
function wound(ctx: Ctx, hp: number, all: boolean) {
  const able = crewOf(ctx.content, reader(ctx)).filter((actor) => hpOf(ctx, actor) > 1);
  if (able.length === 0) return;
  const hurt = all ? able : [ctx.rng('wound').pick(able)];
  for (const actor of hurt) {
    const by = Math.min(hp, hpOf(ctx, actor) - 1);
    if (by > 0) ctx.apply({ effect: 'damage-stat', actor, stat: 'hp', by });
  }
}

/** Parts on hand sold, the dearest first, at what the shops pay: half their worth, in fives. */
function sellPart(ctx: Ctx, count: number) {
  const value = (item: string) => ctx.content.getOrThrow<{ value?: number }>('item', item).value ?? 0;
  for (let n = 0; n < count; n++) {
    const [dearest] = ctx.content
      .ids('item')
      .filter((item) => (ctx.fact('inventory.count', { item }) as number) > 0)
      .sort((a, b) => value(b) - value(a) || (a < b ? -1 : 1));
    if (dearest === undefined) return;
    ctx.apply({ effect: 'take-item', item: dearest });
    const paid = stepped(value(dearest) / 2);
    if (paid > 0) ctx.apply({ effect: 'add-resource', resource: 'credits', by: paid });
  }
}

/**
 * After every fight (the original's endFight): everyone counts it towards their rank; in act 1,
 * whose home is the hangar, everyone heals fully; after it, anyone who fell comes back on 1 hit
 * point. Nobody dies.
 */
function afterFight(ctx: Ctx) {
  const crew = crewOf(ctx.content, reader(ctx));
  const home = ctx.fact('campaign.act') === 1;
  for (const actor of crew) {
    ctx.apply({ effect: 'add-to-stat', actor, stat: 'fights', by: 1 });
    if (home) ctx.apply({ effect: 'heal-stat', actor, stat: 'hp' });
    else if (hpOf(ctx, actor) === 0) ctx.apply({ effect: 'heal-stat', actor, stat: 'hp', by: 1 });
  }
}

type View = { content: Ctx['content']; fact: Read };

/** Who stands at a place on the roster, from 1 in the order they joined. */
const at = (view: View, place: unknown) => crewOf(view.content, view.fact)[(place as number) - 1];

/** A member as the crew screen says them: their job, their traits, their rank. */
function about(view: View, actor: string): string {
  const record = view.content.get<{ job?: string; statuses?: string[] }>('actor', actor);
  const named = (type: string, id: string) => view.content.get<{ name?: string }>(type, id)?.name ?? id;
  const job = record?.job ? named('actor', record.job) : 'Crew';
  const traits = (record?.statuses ?? []).filter((status) => (view.fact('stats.has', { actor, status }) as number) > 0);
  const rank = view.fact('roster.rank', { actor }) as string | undefined;
  return [job, ...traits.map((trait) => named('status', trait)), rank && rank !== 'green' ? rank.replace('-', ' ') : '']
    .filter((part) => part !== '')
    .join(' · ');
}

const PLACE = { place: { type: 'int', min: 1 } } as const;

/** The crew's own rules: wounds, parts sold off, and what a fight leaves behind. */
export const crew: Module = defineModule<Record<string, never>>({
  id: 'crew',
  init: () => ({}),
  effects: {
    wound: (ctx, effect) => wound(ctx, effect.hp as number, effect.all === true),
    'sell-part': (ctx, effect) => sellPart(ctx, (effect.count as number | undefined) ?? 1),
  },
  on: {
    'encounters/fought': (ctx) => afterFight(ctx),
  },
  // The crew screen's rows, by place on the roster: the roster kit lists no members.
  facts: {
    member: {
      args: PLACE,
      domain: { type: 'text' },
      label: 'who stands at a place on the roster',
      read: (view, { place }) => {
        const actor = at(view, place);
        return actor && view.content.get<{ name?: string }>('actor', actor)?.name;
      },
    },
    hp: {
      args: PLACE,
      domain: { type: 'text' },
      label: 'their hit points, now and at most',
      read: (view, { place }) => {
        const actor = at(view, place);
        if (!actor) return undefined;
        return `${view.fact('stats.current', { actor, stat: 'hp' })}/${view.fact('stats.value', { actor, stat: 'hp' })}`;
      },
    },
    about: {
      args: PLACE,
      domain: { type: 'text' },
      label: 'their job, traits and rank',
      read: (view, { place }) => {
        const actor = at(view, place);
        return actor && about(view, actor);
      },
    },
    'offer-kind': {
      args: { slot: { type: 'int', min: 0 } },
      domain: { type: 'text' },
      label: 'what kind of recruit stands in a station bar’s slot',
      read: ({ content, fact }, { slot }) => {
        const recruit = fact('roster.offer-recruit', { hall: 'station', slot }) as string | undefined;
        return recruit && content.get<{ name?: string }>('recruit', recruit)?.name;
      },
    },
  },
});
