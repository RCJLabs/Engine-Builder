/**
 * The checks of one value against its schema, shared by a record and each effect inside it: zod's
 * issues (E001), references (E005, E006), conditions (E011 to E014, W102 to W104), asset paths and
 * effects, each of which is checked against its own schema the same way (M3.1).
 */
import { type Effect, formatRef, isRecordId, isSlotName, parseRef, type RecordIndex, slotProblem } from '@eb/core';
import type { z } from 'zod';
import { checkConditionField, type SoundCondition } from './conditions.ts';
import type { DiagnosticCode } from './diagnostics.ts';
import { isEffectShape } from './effect.ts';
import { schemaIssues } from './issues.ts';
import type { Known } from './known.ts';
import { type FoundRef, scanRecord } from './walk.ts';

export type Report = (code: DiagnosticCode, path: string, message: string) => void;

export interface PartContext {
  readonly known: Known;
  readonly records: RecordIndex;
  readonly report: Report;
  /** A reference to "type:id" at path, for used-by. */
  use(key: string, path: string): void;
  /** An asset field's path inside assets/, at path. */
  asset(path: string, value: string): void;
  /** A condition whose shape is sound, at path. */
  condition(path: string, sound: SoundCondition): void;
  /** An effect whose schema passed, at path. */
  effect(path: string, value: Effect): void;
  /**
   * The slots the field at path can name as "@slot", each with its record's type: a quest's own
   * fields (M3.10). Without it, or where it gives none, no slot can be named (E044).
   */
  slotsAt?(path: string): Readonly<Record<string, string>> | undefined;
}

const inside = (path: string, at: string) => path === at || path.startsWith(`${at}/`);

/**
 * Checks `value` against `schema`, its places reported from `base`. `self` is true when the value
 * is an effect checked against its own schema, whose mark the walk finds at the top. Returns
 * whether zod passed it.
 */
export function checkPart(
  schema: z.core.$ZodType,
  value: unknown,
  base: string,
  ctx: PartContext,
  self = false,
): boolean {
  const { refs, conditions, assets, effects } = scanRecord(schema, value);
  const issues = schemaIssues(schema, value);
  // Conditions get checkCondition's messages (E011) rather than zod's.
  for (const issue of issues) {
    if (!conditions.some((c) => inside(issue.path, c.path))) ctx.report('E001', base + issue.path, issue.message);
  }
  for (const found of refs) {
    if (isSlotName(found.value)) {
      checkSlot(found, ctx.slotsAt?.(base + found.path), (message) => ctx.report('E044', base + found.path, message));
      continue;
    }
    const key = resolve(found, (code, path, message) => ctx.report(code, base + path, message));
    if (key === undefined) continue;
    ctx.use(key, base + found.path);
    const target = parseRef(key);
    if (target && !ctx.records.has(target.type, target.id)) ctx.report('E005', base + found.path, `No record ${key}`);
  }
  for (const found of conditions) {
    const path = base + found.path;
    const slots = ctx.slotsAt?.(path);
    const sound = checkConditionField(
      { path, value: found.value },
      {
        facts: ctx.known.facts,
        open: ctx.known.openFacts,
        records: ctx.records,
        report: ctx.report,
        use: ctx.use,
        ...(slots ? { slots } : {}),
      },
    );
    if (sound) ctx.condition(path, sound);
  }
  // A path zod already refused (E001) names no file to look for.
  for (const found of assets)
    if (!issues.some((issue) => issue.path === found.path)) ctx.asset(base + found.path, found.value);
  for (const found of effects) {
    if (self && found.path === '') continue;
    if (found.open) checkEffect(found.value, base + found.path, ctx);
    // One of the engine's effects in a game's own union: zod checked it with the record.
    else if (isEffectShape(found.value) && !issues.some((issue) => inside(issue.path, found.path)))
      ctx.effect(base + found.path, found.value);
  }
  return issues.length === 0;
}

/**
 * An effect() field's value against the effect catalogue. One that names no known effect is E025
 * in a game's closed catalogue, and is kept as written in the engine's open one (D36).
 */
function checkEffect(value: unknown, at: string, ctx: PartContext): void {
  // zod reported anything that isn't an effect with the record (E001).
  if (!isEffectShape(value)) return;
  const schema = ctx.known.effects.schemas.get(value.effect);
  if (!schema) {
    if (ctx.known.effects.names?.has(value.effect)) ctx.effect(at, value);
    else if (ctx.known.effects.closed) ctx.report('E025', `${at}/effect`, `No effect "${value.effect}" in this game`);
    return;
  }
  if (checkPart(schema, value, at, ctx, true)) ctx.effect(at, value);
}

/** A slot where a reference goes: one its quest has, holding a record of a type the field takes. */
function checkSlot(
  found: FoundRef,
  slots: Readonly<Record<string, string>> | undefined,
  report: (message: string) => void,
) {
  const targets = typeof found.target === 'string' ? [found.target] : found.target;
  const problems = targets.map((to) => slotProblem(found.value, { type: 'ref', to }, slots));
  if (problems.every((problem) => problem !== undefined)) report(problems[0] as string);
}

/**
 * The "type:id" a reference names, or undefined when there is nothing to resolve: a malformed
 * value (zod reports it as E001) or a type the field does not allow (reported here, as E006).
 */
function resolve(found: FoundRef, report: Report) {
  if (typeof found.target === 'string') {
    return isRecordId(found.value) ? formatRef(found.target, found.value) : undefined;
  }
  const key = parseRef(found.value);
  if (!key) return undefined;
  if (!found.target.includes(key.type)) {
    report('E006', found.path, `This field takes ${listTypes(found.target)} records, not ${key.type}`);
    return undefined;
  }
  return found.value;
}

const listTypes = (types: readonly string[]): string =>
  types.length === 1 ? (types[0] as string) : `${types.slice(0, -1).join(', ')} or ${types[types.length - 1]}`;
