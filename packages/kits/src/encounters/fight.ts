/**
 * Fighting (docs/specs/encounters.md#fighting-it): one roll against the table, the party's hurt
 * from the front, the fallen, the counts, then the result's effects. Its preview is the same
 * table, each result's effects as their own previews give them.
 */
import type { Effect, EffectPreview, ModuleContext } from '@eb/core';
import type { Built, Reader } from './lines.ts';
import { encounterRecord } from './records.ts';
import { type FightTable, fightTable, rowAt } from './table.ts';
import { type EncountersSlice, type Result, ROLL_OUT_OF } from './types.ts';

type Ctx = ModuleContext<EncountersSlice>;

const effectsOf = (reader: Reader, encounter: string, result: Result): readonly Effect[] =>
  encounterRecord(reader.content, encounter)[result] ?? [];

const counted = { win: 'won', lose: 'lost' } as const;

export function fight(ctx: Ctx, built: Built, effect: Effect): void {
  const { match, rows } = fightTable(ctx, built, effect);
  const roll = ctx.rng('fight').int(1, ROLL_OUT_OF);
  const { result, hurt } = rowAt(rows, roll);
  const record = encounterRecord(ctx.content, match.encounter);
  let before = 0;
  for (const { actor, health } of match.party) {
    const took = Math.min(health, Math.max(0, hurt - before));
    before += health;
    if (took > 0) ctx.apply({ effect: 'damage-stat', actor, stat: match.health, by: took });
    if (took < health) continue;
    ctx.emit('fell', { encounter: match.encounter, actor });
    const falls = record.falls;
    if (falls?.status !== undefined) ctx.apply({ effect: 'add-status', actor, status: falls.status });
    if (falls?.leave !== undefined && built.roster && (ctx.fact('roster.place', { actor }) as number) > 0) {
      ctx.apply({ effect: 'leave', actor, why: falls.leave });
    }
  }
  const slice = ctx.write();
  slice.fought[match.encounter] = (slice.fought[match.encounter] ?? 0) + 1;
  if (result !== 'draw') {
    const counts = slice[counted[result]];
    counts[match.encounter] = (counts[match.encounter] ?? 0) + 1;
  }
  ctx.emit('fought', { encounter: match.encounter, result, hurt, roll });
  for (const next of effectsOf(ctx, match.encounter, result)) ctx.apply(next);
}

/** The fight as the player sees it before fighting: the table, and what each result does. */
export function fightShown(
  reader: Reader,
  built: Built,
  effect: Effect,
  preview: (effect: Effect) => EffectPreview,
): Record<string, unknown> {
  const { match, rows, outcomes }: FightTable = fightTable(reader, built, effect);
  return {
    encounter: match.encounter,
    combat: match.combat,
    health: match.health,
    fighters: match.party.map((fighter) => fighter.actor),
    foes: match.foes.map((fighter) => fighter.actor),
    outcomes: outcomes.map((outcome) => ({
      ...outcome,
      effects: effectsOf(reader, match.encounter, outcome.result).map(preview),
    })),
    rows,
  };
}
