/**
 * The roster kit's checks beyond its type files (M3.6, docs/specs/roster.md#checks): E035 for
 * templates, halls and the roster's settings that don't hold together, and for a change-bond
 * naming one actor twice; E040 for a condition naming a rank or bond band the roster lacks, or an
 * actor's bond with itself; W117 for a fee in a game without the economy kit. What reads other
 * records (the statuses ranks give, the flag a cap reads, the actors a recruit's id could take)
 * and what reads the roster waits for finish().
 */
import { type Effect, FLAG, type FlagRecord, pointerSegment } from '@eb/core';
import {
  ACTOR,
  ECONOMY,
  HALL,
  type HallRecord,
  RECRUIT,
  type RecruitRecord,
  ROSTER_RECORD,
  type RosterRecord,
  STATUS,
  type StatusRecord,
} from '@eb/kits';
import { boundsText, checkBands, outside } from './bandCheck.ts';
import type { SoundCondition } from './conditions.ts';
import { compareText, type DiagnosticCode } from './diagnostics.ts';
import { factTests } from './flagCheck.ts';

type Report = (code: DiagnosticCode, path: string, message: string) => void;

const NO_FEES = 'Nothing charges a fee in a game without the economy kit';

function checkRecruit(recruit: RecruitRecord, economy: boolean, report: Report): void {
  for (const [stat, range] of Object.entries(recruit.stats ?? {})) {
    if (range.max !== undefined && range.max < range.min) {
      report(
        'E035',
        `/stats/${pointerSegment(stat)}/max`,
        `${stat} is rolled from ${range.min} to ${range.max}: To is below From`,
      );
    }
  }
  const seen = new Set<string>();
  (recruit.traits ?? []).forEach((trait, i) => {
    if (seen.has(trait.status)) report('E035', `/traits/${i}/status`, `${trait.status} is a trait twice`);
    seen.add(trait.status);
    if (!economy && trait.fee !== undefined) report('W117', `/traits/${i}/fee`, NO_FEES);
  });
  if (!economy && recruit.fee !== undefined) report('W117', '/fee', NO_FEES);
}

function checkHall(hall: HallRecord, report: Report): void {
  const seen = new Set<string>();
  hall.recruits.forEach((entry, i) => {
    if (seen.has(entry.recruit)) {
      report('E035', `/recruits/${i}/recruit`, `${entry.recruit} is offered twice: give it one entry and a weight`);
    }
    seen.add(entry.recruit);
  });
}

function checkRoster(roster: RosterRecord, report: Report): void {
  if (roster.cap !== undefined && roster['cap-flag'] !== undefined) {
    report('E035', '/cap-flag', 'It has Most members and Most members from a flag: the flag would win, so give one');
  }
  const seen = new Set<string>();
  (roster.start ?? []).forEach((actor, i) => {
    if (seen.has(actor)) report('E035', `/start/${i}`, `${actor} starts on the roster twice`);
    seen.add(actor);
  });
  const starting = seen.size;
  if (roster.cap !== undefined && starting > roster.cap) {
    report('E035', '/start', `${starting} start on it, more than its ${roster.cap} places`);
  }
  if (roster.ranks) checkBands(roster.ranks.bands, '/ranks/bands', undefined, 'rank', report);
  const { bonds } = roster;
  if (!bonds) return;
  if (bonds.min !== undefined && bonds.max !== undefined && bonds.max < bonds.min) {
    report('E035', '/bonds/max', `Highest ${bonds.max} is below lowest ${bonds.min}`);
    return;
  }
  if (bonds.start !== undefined && outside(bonds, bonds.start)) {
    report('E035', '/bonds/start', `Bonds start at ${bonds.start}, outside ${boundsText(bonds)}`);
  }
  checkBands(bonds.bands ?? [], '/bonds/bands', bonds, 'band', report);
}

/** Where a recruit's id could be a written actor's: its template's id, a hyphen and a number as the kit writes it. */
const RECRUIT_ID = /^(.+)-(0|[1-9][0-9]*)$/;

interface Seen<T> {
  readonly id: string;
  readonly value: T;
  readonly report: Report;
}

interface Named {
  readonly report: Report;
  readonly path: string;
  readonly kind: 'rank' | 'band' | 'self';
  readonly name: string;
}

export class RosterChecks {
  private readonly economy: boolean;
  private readonly rosters: Seen<RosterRecord>[] = [];
  private readonly recruits = new Set<string>();
  private readonly actors: Seen<unknown>[] = [];
  private readonly statuses = new Map<string, StatusRecord>();
  private readonly flags = new Map<string, FlagRecord>();
  private readonly named: Named[] = [];

  constructor(on: readonly string[]) {
    this.economy = on.includes(ECONOMY);
  }

  /** One record that passed its schema: the roster kit's own, and the actors, statuses and flags they read. */
  record(type: string, id: string, value: unknown, report: Report): void {
    if (type === RECRUIT) {
      checkRecruit(value as RecruitRecord, this.economy, report);
      this.recruits.add(id);
    } else if (type === HALL) checkHall(value as HallRecord, report);
    else if (type === ROSTER_RECORD) {
      checkRoster(value as RosterRecord, report);
      this.rosters.push({ id, value: value as RosterRecord, report });
    } else if (type === ACTOR) this.actors.push({ id, value, report });
    else if (type === STATUS) this.statuses.set(id, value as StatusRecord);
    else if (type === FLAG) this.flags.set(id, value as FlagRecord);
  }

  /** An effect whose schema passed: a bond names two actors. */
  effect(report: Report, path: string, effect: Effect): void {
    if (effect.effect === 'change-bond' && effect.actor === effect.with) {
      report('E035', `${path}/with`, `${String(effect.actor)} has no bond with itself`);
    }
  }

  /** A condition's tests that name a rank, a bond band, or a bond. */
  condition(report: Report, sound: SoundCondition): void {
    for (const [inner, test] of factTests(sound.tree, '')) {
      const path = sound.at(inner);
      const compared = test.op === '==' || test.op === '!=' ? test.value : undefined;
      const rank =
        test.fact === 'roster.reached' || test.fact === 'roster.ranked'
          ? test.args?.rank
          : test.fact === 'roster.rank'
            ? compared
            : undefined;
      if (typeof rank === 'string') this.named.push({ report, path, kind: 'rank', name: rank });
      if (test.fact === 'roster.bond-band' && typeof compared === 'string') {
        this.named.push({ report, path, kind: 'band', name: compared });
      }
      const pair = test.fact === 'roster.bond' || test.fact === 'roster.bond-band';
      if (pair && typeof test.args?.actor === 'string' && test.args.actor === test.args.with) {
        this.named.push({ report, path, kind: 'self', name: test.args.actor });
      }
    }
  }

  finish(): void {
    const [roster, ...others] = [...this.rosters].sort((a, b) => compareText(a.id, b.id));
    for (const other of others) {
      other.report('E035', '', `A game has one roster: ${roster?.id} is the one read, so this one does nothing`);
    }
    if (roster) this.settings(roster);
    for (const actor of this.actors) {
      const template = RECRUIT_ID.exec(actor.id)?.[1];
      if (template !== undefined && this.recruits.has(template)) {
        actor.report('E035', '', `A recruit made from ${template} could be called ${actor.id}: name it otherwise`);
      }
    }
    this.names(roster?.value);
  }

  /** The roster's own record against the statuses its ranks give and the flag its cap reads. */
  private settings({ value, report }: Seen<RosterRecord>): void {
    const flag = value['cap-flag'];
    if (flag !== undefined && this.flags.has(flag) && this.flags.get(flag)?.number === undefined) {
      report('E035', '/cap-flag', `${flag} is on or off: Most members from a flag reads a number flag`);
    }
    const ladder = value.ranks;
    ladder?.bands.forEach((rank, i) => {
      const status = rank.status === undefined ? undefined : this.statuses.get(rank.status);
      if (status === undefined) return;
      const at = `/ranks/bands/${i}/status`;
      if (status.lasts !== undefined) {
        report('E035', at, `${rank.status} lasts a while: a rank's status is had for as long as the rank`);
      } else if (status.modifiers?.some((m) => m.stat === ladder.stat)) {
        report(
          'E035',
          at,
          `${rank.status} changes ${ladder.stat}, the ladder's own stat: it could move the rank that gives it`,
        );
      }
    });
  }

  /** E040: each rank and band a condition names, against the roster's. */
  private names(roster: RosterRecord | undefined): void {
    const ranks = (roster?.ranks?.bands ?? []).map((b) => b.id);
    const bands = (roster?.bonds?.bands ?? []).map((b) => b.id);
    for (const { report, path, kind, name } of this.named) {
      if (kind === 'self') report('E040', path, `${name} has no bond with itself`);
      else if (kind === 'rank' && !ranks.includes(name)) {
        report(
          'E040',
          path,
          ranks.length === 0
            ? 'The roster has no ranks'
            : `The roster has no rank ${name}: its ranks are ${ranks.join(', ')}`,
        );
      } else if (kind === 'band' && !bands.includes(name)) {
        report(
          'E040',
          path,
          bands.length === 0
            ? 'The roster’s bonds have no bands'
            : `The roster’s bonds have no band ${name}: its bands are ${bands.join(', ')}`,
        );
      }
    }
  }
}
