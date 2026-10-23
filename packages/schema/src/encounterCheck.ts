/**
 * The encounters kit's checks (M4.7, D57, docs/specs/encounters.md#checks): E035 for a combat
 * whose bounds cross or fighters named twice; E054 for a fight nobody fights for the player in,
 * without the roster kit; W137 for fallen who leave a roster the game doesn't have.
 */
import type { Effect } from '@eb/core';
import { COMBAT, type CombatRecord, ENCOUNTER, type EncounterRecord, HIT_MAX, HIT_MIN, ROSTER } from '@eb/kits';
import type { Report } from './checkValue.ts';

interface Fought {
  readonly report: Report;
  readonly path: string;
  readonly encounter: string;
}

function checkCombat(combat: CombatRecord, report: Report): void {
  const [least, most] = [combat['hit-min'] ?? HIT_MIN, combat['hit-max'] ?? HIT_MAX];
  if (least > most) {
    const path = combat['hit-max'] === undefined ? '/hit-min' : '/hit-max';
    report('E035', path, `A hit’s chance is kept from ${least}% to ${most}%: the most is below the least`);
  }
}

function checkFighters(fighters: readonly string[] | undefined, path: string, report: Report): void {
  const seen = new Set<string>();
  (fighters ?? []).forEach((actor, i) => {
    if (seen.has(actor)) report('E035', `${path}/${i}`, `${actor} is named twice: each fights once`);
    seen.add(actor);
  });
}

export class EncounterChecks {
  private readonly roster: boolean;
  private readonly encounters = new Map<string, EncounterRecord>();
  private readonly fights: Fought[] = [];

  constructor(on: readonly string[]) {
    this.roster = on.includes(ROSTER);
  }

  /** One record that passed its schema. */
  record(type: string, id: string, value: unknown, report: Report): void {
    if (type === COMBAT) checkCombat(value as CombatRecord, report);
    if (type !== ENCOUNTER) return;
    const encounter = value as EncounterRecord;
    this.encounters.set(id, encounter);
    checkFighters(encounter.fighters, '/fighters', report);
    if (encounter.falls?.leave !== undefined && !this.roster) {
      report('W137', '/falls/leave', 'The fallen leave the roster, in a game without the roster kit: nobody can');
    }
  }

  /** An effect whose schema passed: a fight naming nobody, checked once every encounter is read. */
  effect(report: Report, path: string, effect: Effect): void {
    if (effect.effect !== 'fight' || typeof effect.encounter !== 'string') return;
    checkFighters(effect.fighters as readonly string[] | undefined, `${path}/fighters`, report);
    if (effect.fighters === undefined && !this.roster) this.fights.push({ report, path, encounter: effect.encounter });
  }

  finish(): void {
    for (const { report, path, encounter } of this.fights) {
      const record = this.encounters.get(encounter);
      if (!record || record.fighters !== undefined) continue;
      report(
        'E054',
        path,
        `Neither this fight nor ${encounter} names its fighters, and without the roster kit nobody else fights`,
      );
    }
  }
}
