/**
 * The tactics kit's checks of its records (M7.5, D87, docs/specs/tactics.md#checks): E035 for an order
 * without the number its kind reads, or a suppression that adds or a mark that takes off, and for a battle
 * naming one of its crew twice; W160 for a unit whose actor has no gun. A battle against its space is the
 * compiler's (E096).
 */
import { ACTOR, BATTLE, type BattleRecord, ORDER, ORDER_NUMBER, type OrderRecord, TEAMS } from '@eb/kits';
import type { Report } from './checkValue.ts';

function checkOrder(order: OrderRecord, report: Report): void {
  const key = ORDER_NUMBER[order.kind];
  const value = order[key];
  if (value === undefined) report('E035', `/${key}`, `A ${order.kind} order reads its ${key}: give it one`);
  else if (order.kind === 'suppress' && value >= 0)
    report('E035', '/aim', 'A suppression takes its aim off the target’s shots: below 0');
  else if (order.kind === 'mark' && value <= 0)
    report('E035', '/aim', 'A mark adds its aim to shots at the target: above 0');
}

function checkCrew(battle: BattleRecord, report: Report): void {
  const seen = new Set<string>();
  battle.crew.forEach((post, i) => {
    if (seen.has(post.actor))
      report('E035', `/crew/${i}/actor`, `${post.actor} is in the crew twice: each of the crew is one unit`);
    seen.add(post.actor);
  });
}

export class TacticsChecks {
  /** Each actor read, and whether it has a gun. */
  private readonly armed = new Map<string, boolean>();
  private readonly battles: { readonly battle: BattleRecord; readonly report: Report }[] = [];

  /** One record that passed its schema. */
  record(type: string, id: string, value: unknown, report: Report): void {
    if (type === ACTOR) this.armed.set(id, typeof (value as { gun?: unknown }).gun === 'string');
    if (type === ORDER) checkOrder(value as OrderRecord, report);
    if (type !== BATTLE) return;
    const battle = value as BattleRecord;
    checkCrew(battle, report);
    this.battles.push({ battle, report });
  }

  /** W160, once every actor is read. */
  finish(): void {
    for (const { battle, report } of this.battles)
      for (const side of TEAMS)
        battle[side].forEach((post, i) => {
          if (this.armed.get(post.actor) === false)
            report(
              'W160',
              `/${side}/${i}/actor`,
              `${post.actor} has no gun: in this battle it can’t shoot, watch or reload`,
            );
        });
  }
}
