/**
 * The two lines of a fight (docs/specs/encounters.md#the-two-lines): who fights for the player and
 * the foes, the front first, each with the stats the encounter's combat names, read through the
 * stats kit's facts so gear and statuses count.
 */
import type { Effect, FactArgs, RecordStore } from '@eb/core';
import { ACTOR } from '../stats/types.ts';
import { combatRecord, encounterRecord } from './records.ts';
import { type CombatRecord, type EncounterRecord, HIT_MAX, HIT_MIN, ROUNDS, STANCE, type Stance } from './types.ts';

/** What a fight is worked out from: content and the other modules' facts. */
export interface Reader {
  readonly content: RecordStore;
  fact(id: string, args?: FactArgs): unknown;
}

/** How the kit was built: whether the roster's members can fight, and leave when they fall. */
export interface Built {
  readonly roster: boolean;
}

export interface Fighter {
  readonly actor: string;
  /** What it has left to lose: a foe's whole health, the party's what the stats kit says is left. */
  readonly health: number;
  readonly hit: number;
  readonly dodge: number;
  readonly damage: number;
  readonly armour: number;
}

/** Everything a fight's table is worked out from. */
export interface Match {
  readonly encounter: string;
  readonly combat: string;
  readonly health: string;
  readonly party: readonly Fighter[];
  readonly foes: readonly Fighter[];
  readonly hitMin: number;
  readonly hitMax: number;
  readonly rounds: number;
  /** Percent of the foes' health lost at which they break. */
  readonly breaks: number;
}

/** The roster's members in the order they joined: every actor with a place, by place. */
function members(reader: Reader): string[] {
  return reader.content
    .ids(ACTOR)
    .map((actor) => [actor, reader.fact('roster.place', { actor }) as number] as const)
    .filter(([, place]) => place > 0)
    .sort((a, b) => a[1] - b[1])
    .map(([actor]) => actor);
}

/** Who fights for the player, as written, each once: the fight's, else the encounter's, else the roster. */
export function partyIds(reader: Reader, built: Built, id: string, record: EncounterRecord, fight: Effect): string[] {
  const named = (fight.fighters as readonly string[] | undefined) ?? record.fighters;
  if (named !== undefined) return [...new Set(named)];
  if (!built.roster) throw new Error(`fight: encounter "${id}" names no fighters and the roster kit is off (E054)`);
  return members(reader);
}

const stanceOf = (fight: Effect): Stance =>
  Object.fromEntries(STANCE.flatMap((key) => (typeof fight[key] === 'number' ? [[key, fight[key] as number]] : [])));

function fighterOf(reader: Reader, combat: CombatRecord, actor: string, party: boolean, stance: Stance): Fighter {
  const value = (stat: string | undefined) =>
    stat === undefined ? 0 : (reader.fact('stats.value', { actor, stat }) as number);
  const health = reader.fact(party ? 'stats.current' : 'stats.value', { actor, stat: combat.health }) as number;
  return {
    actor,
    health,
    hit: value(combat.hit) + (stance.hit ?? 0),
    dodge: value(combat.dodge) + (stance.dodge ?? 0),
    damage: value(combat.damage) + (stance.damage ?? 0),
    armour: value(combat.armour) + (stance.armour ?? 0),
  };
}

/** The fight an effect asks for, read now: both lines, those already down left out, and the combat's bounds. */
export function matchOf(reader: Reader, built: Built, fight: Effect): Match {
  const encounter = String(fight.encounter);
  const record = encounterRecord(reader.content, encounter);
  const combat = combatRecord(reader.content, record.combat);
  const stance = stanceOf(fight);
  const party = partyIds(reader, built, encounter, record, fight).map((actor) =>
    fighterOf(reader, combat, actor, true, stance),
  );
  const foes = record.foes.flatMap((foe) =>
    Array.from({ length: foe.count ?? 1 }, () => fighterOf(reader, combat, foe.actor, false, {})),
  );
  return {
    encounter,
    combat: record.combat,
    health: combat.health,
    party: party.filter((fighter) => fighter.health > 0),
    foes: foes.filter((fighter) => fighter.health > 0),
    hitMin: combat['hit-min'] ?? HIT_MIN,
    hitMax: combat['hit-max'] ?? HIT_MAX,
    rounds: combat.rounds ?? ROUNDS,
    breaks: record.breaks ?? 100,
  };
}
