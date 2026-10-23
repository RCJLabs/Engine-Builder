/**
 * The fight above an encounter's form (M4.7, D57, docs/specs/encounters.md#the-editor), as plain
 * functions: the records as the index reads them, the form's value over its own, read through the
 * stats kit's own sums at full health; then the kit's own table, so what the author sees is what
 * the sim works out. A value half typed works out to nothing, and says so.
 */
import { createRecordStore, type FactArgs, type RecordPack } from '@eb/core';
import {
  ACTOR,
  type FightOutcome,
  type FightTable,
  fightTable,
  GEAR,
  gearParts,
  ROSTER,
  ROSTER_RECORD,
  type RosterRecord,
  statParts,
} from '@eb/kits';

/** A record as the index holds it. */
export interface Held {
  readonly type: string;
  readonly id: string;
  readonly value: unknown;
}

/** Who the preview fights for the player. */
export type Party = { readonly as: 'written' } | { readonly as: 'one'; readonly actor: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The records by type and id, the encounter's own replaced by the form's value. */
function packOf(records: Iterable<Held>, id: string, value: unknown): RecordPack {
  const pack: Record<string, Record<string, unknown>> = {};
  for (const { type, id: each, value: held } of records) {
    if (!isObject(held)) continue;
    pack[type] = { ...(pack[type] ?? {}), [each]: held };
  }
  pack.encounter = { ...(pack.encounter ?? {}), [id]: value };
  return pack;
}

/** The roster record's start list, the written roster's members in order: the first record's, as the kit reads one. */
function startOf(pack: RecordPack): readonly string[] {
  const records = Object.values((pack[ROSTER_RECORD] ?? {}) as Record<string, RosterRecord>);
  return records[0]?.start ?? [];
}

/**
 * The fight worked out against the party, or why it can't be yet. With no fighters of its own,
 * the encounter fights the roster's start; a party of one, that actor alone.
 */
export function fightFor(
  records: Iterable<Held>,
  kits: readonly string[],
  id: string,
  value: unknown,
  party: Party,
): { readonly table: FightTable; readonly against: readonly string[] } | { readonly why: string } {
  if (!isObject(value) || !Array.isArray(value.foes) || value.foes.length === 0) {
    return { why: 'Give it a combat and a foe to see how the fight goes.' };
  }
  const pack = packOf(records, id, value);
  const content = createRecordStore(pack);
  const start = startOf(pack);
  const roster = kits.includes(ROSTER);
  const empty = { actors: {} };
  const fact = (fact: string, args: FactArgs = {}): unknown => {
    const actor = String(args.actor);
    if (fact === 'roster.place') return start.indexOf(actor) + 1;
    if (fact === 'stats.value' || fact === 'stats.current') {
      const stat = String(args.stat);
      const worn = kits.includes(GEAR) ? gearParts(content, { worn: {} }, actor, stat) : [];
      return statParts(content, empty, actor, stat, worn).value;
    }
    throw new Error(`The preview reads no fact ${fact}`);
  };
  const fighters = party.as === 'one' ? [party.actor] : undefined;
  try {
    const table = fightTable(
      { content, fact },
      { roster },
      { effect: 'fight', encounter: id, ...(fighters ? { fighters } : {}) },
    );
    return { table, against: table.match.party.map((fighter) => fighter.actor) };
  } catch {
    return { why: 'Fix the problems above to see how the fight goes.' };
  }
}

/** The actors a party of one can be: every actor written, in id order. */
export const actorsIn = (records: Iterable<Held>): string[] =>
  [...records]
    .filter((held) => held.type === ACTOR)
    .map((held) => held.id)
    .sort();

const RESULT_WORDS = { win: 'Win', draw: 'Draw', lose: 'Lose' } as const;
const span = ([least, most]: readonly [number, number]) => (least === most ? `${least}` : `${least} to ${most}`);

/** A result in words: "Win 67%", then "0 to 10 Hull lost, none fall". */
export function outcomeWords(outcome: FightOutcome, health: string): { readonly head: string; readonly after: string } {
  const hurt = outcome.hurt[1] === 0 ? 'nothing lost' : `${span(outcome.hurt)} ${health} lost`;
  const falls =
    outcome.falls[1] === 0
      ? 'none fall'
      : `${span(outcome.falls)} ${outcome.falls[1] === 1 && outcome.falls[0] === 1 ? 'falls' : 'fall'}`;
  return { head: `${RESULT_WORDS[outcome.result]} ${outcome.chance}%`, after: `${hurt}, ${falls}` };
}
