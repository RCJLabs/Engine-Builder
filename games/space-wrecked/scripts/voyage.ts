// The run's rules, as plain functions over a module's context (the original's travel.js, hunt.js and
// quests.js placeQuests): a jump's supplies, hunger and heat, the med bay, the pursuer's hunters
// where a jump comes out, the quest events met along the way, and a station's prices.
import { capacityOf, crewOf, heatOf, jobOf, pursuerOf, type Read, rulesOf, shipStat, supplies } from './shared';

/** What run.ts's handlers use: a module's context, without its slice. */
export interface Here {
  readonly content: Parameters<typeof rulesOf>[0];
  fact(id: string, args?: Record<string, unknown>): unknown;
  apply(effect: Record<string, unknown>): void;
  rng(name: string): {
    chance(num: number, den: number): boolean;
    int(min: number, max: number): number;
    pick<T>(items: readonly T[]): T;
    shuffle<T>(items: readonly T[]): T[];
  };
}

const reader =
  (ctx: Here): Read =>
  (id, args) =>
    ctx.fact(id, args);
const hpOf = (ctx: Here, actor: string) => ctx.fact('stats.current', { actor, stat: 'hp' }) as number;
const maxOf = (ctx: Here, actor: string) => ctx.fact('stats.value', { actor, stat: 'hp' }) as number;

/**
 * A jump (travel.js): supplies past what the holds take stay behind first; then each of the crew
 * eats jumpSupplies, a long jump longJumpFactor times that. Short, the holds empty and everyone
 * goes hungry, losing hungerHp, never the last. Heat moves by jumpHeat, or longJumpHeat. A med bay
 * and a medic heal the wounded as it goes, a long jump as many jumps as it eats.
 */
export function jump(ctx: Here, long: boolean) {
  const rules = rulesOf(ctx.content);
  const read = reader(ctx);
  const crew = crewOf(ctx.content, read);
  const over = supplies(read) - capacityOf(ctx.content, read);
  if (over > 0) ctx.apply({ effect: 'add-resource', resource: 'supplies', by: -over });
  const times = long ? rules['long-jump-factor'] : 1;
  const eat = rules['jump-supplies'] * crew.length * times;
  const have = supplies(read);
  if (have >= eat) ctx.apply({ effect: 'add-resource', resource: 'supplies', by: -eat });
  else {
    if (have > 0) ctx.apply({ effect: 'add-resource', resource: 'supplies', by: -have });
    for (const actor of crew) {
      const by = Math.min(rules['hunger-hp'], hpOf(ctx, actor) - 1);
      if (by > 0) ctx.apply({ effect: 'damage-stat', actor, stat: 'hp', by });
    }
  }
  ctx.apply({ effect: 'add-to-flag', flag: 'heat', by: long ? rules['long-jump-heat'] : rules['jump-heat'] });
  const medic = crew.some((actor) => jobOf(ctx.content, actor) === 'medic') ? 1 : 0;
  const heal = (shipStat(read, 'heal') + medic) * times;
  if (heal === 0) return;
  for (const actor of crew) {
    const by = Math.min(heal, maxOf(ctx, actor) - hpOf(ctx, actor));
    if (by > 0) ctx.apply({ effect: 'heal-stat', actor, stat: 'hp', by });
  }
}

/**
 * The pursuer's hunters where a jump comes out (hunt.js): from huntHeat, huntChance in its
 * hunters' ship; from raidHeat, taskForceChance in its task force's; at 100, the task force
 * for certain. Never at a station or in a nebula.
 */
export function hunt(ctx: Here) {
  const rules = rulesOf(ctx.content);
  const read = reader(ctx);
  if (ctx.fact('maps.at', { kind: 'station' }) === true || ctx.fact('maps.at', { kind: 'nebula' }) === true) return;
  const pursuer = pursuerOf(ctx.content, read);
  const heat = heatOf(read);
  if (!pursuer || heat < rules['hunt-heat']) return;
  const rolled = (chance: number) => chance >= 100 || ctx.rng('hunt').chance(chance, 100);
  if (heat >= 100 || (heat >= rules['raid-heat'] && rolled(rules['task-force-chance']))) {
    ctx.apply({ effect: 'open-event', event: pursuer.run['task-force'] });
  } else if (heat < rules['raid-heat'] && rolled(rules['hunt-chance'])) {
    ctx.apply({ effect: 'open-event', event: pursuer.run.hunters });
  }
}

/**
 * The quest events waiting in a sector (placeQuests): each active quest at an act-2 step, its
 * event met at a layer rolled as the sector is entered, from the second to the next to last. A
 * quest started in a sector is met from the next one on.
 */
export function placeQuests(ctx: Here): Record<string, number> {
  const layers = ctx.content.getOrThrow<{ layers: { count: number } }>('map', 'sector').layers.count;
  const placed: Record<string, number> = {};
  for (const quest of ctx.content.ids('quest')) {
    if (ctx.fact('quests.state', { quest }) !== 'active') continue;
    const stage = ctx.fact('quests.stage', { quest }) as string | undefined;
    if (stage === undefined || ctx.content.get('event', stage) === undefined) continue;
    placed[stage] = ctx.rng('quests').int(2, layers - 2);
  }
  return placed;
}

/** What a station charges: its side's share of the price, by the crew's standing (standing.js). */
export function stationPrice(
  ctx: { fact(id: string, args?: Record<string, unknown>): unknown },
  side: string | undefined,
  price: number,
) {
  const share = side === undefined ? 100 : (ctx.fact('factions.price', { faction: side }) as number);
  return Math.round((price * share) / 100);
}

/** Patching everyone up at a station: patchPrice for each hit point missing. */
export function patchPrice(ctx: Here | { content: Here['content']; fact: Here['fact'] }, side: string | undefined) {
  const read = (id: string, args?: Record<string, unknown>) => ctx.fact(id, args);
  const missing = crewOf(ctx.content, read).reduce(
    (sum, actor) =>
      sum +
      (ctx.fact('stats.value', { actor, stat: 'hp' }) as number) -
      (ctx.fact('stats.current', { actor, stat: 'hp' }) as number),
    0,
  );
  return stationPrice(ctx, side, missing * rulesOf(ctx.content)['patch-price']);
}
