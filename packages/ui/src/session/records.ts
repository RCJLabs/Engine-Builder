/**
 * A codex's entries (M4.4, D54, docs/specs/screens.md#lists): every record of a list's type, in id
 * order, each held back until its `known` holds, with the facts and shows-when its item names
 * `@entry` in read for it. Through the game's own facts and checks, as every value a screen shows.
 * And the assets' credits the pack carries, which never change in play.
 */
import type { Condition, FactCatalog, PackCredit } from '@eb/core';
import type { RecordsWant } from '../format/bindings.ts';
import { ENTRY, ENTRY_SLOT } from '../format/screen.ts';
import { soundCondition } from './sound.ts';
import type { Entry, Shown } from './types.ts';
import type { Reading } from './views.ts';
import { nameOf } from './words.ts';

/** A codex list's wants, parsed once against the game. */
export interface Codex {
  readonly key: string;
  readonly type: string;
  /** Undefined without `known`: every entry is known. Null for one that doesn't read: none is. */
  readonly known: Condition | null | undefined;
  readonly facts: ReadonlyMap<string, Condition | undefined>;
  readonly conditions: ReadonlyMap<string, Condition | undefined>;
}

export function parseCodex(want: RecordsWant, catalog: FactCatalog): Codex {
  const slots = { [ENTRY_SLOT]: want.type };
  const parse = (text: string, bare: boolean) => soundCondition(text, catalog, bare, slots);
  return {
    key: want.key,
    type: want.type,
    known: want.known === undefined ? undefined : (parse(want.known, false) ?? null),
    facts: new Map(want.facts.map((text) => [text, parse(text, true)])),
    conditions: new Map(want.conditions.map((text) => [text, parse(text, false)])),
  };
}

/** `value` with each `@entry` in it the record's id. */
function bindEntry<T>(value: T, id: string): T {
  if (value === ENTRY) return id as T;
  if (Array.isArray(value)) return value.map((item) => bindEntry(item, id)) as T;
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, bindEntry(item, id)])) as T;
}

const shown = (value: unknown): Shown =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null;

/** A record's own fields that a screen can show: text, numbers and yes/no, at its top level. */
function ownFields(value: unknown): Record<string, Shown> {
  if (typeof value !== 'object' || value === null) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => shown(v) !== null || v === null)
      .map(([k, v]) => [k, shown(v)]),
  );
}

export function codexEntries(reading: Reading, codex: Codex): Entry[] {
  const { content } = reading;
  return content.ids(codex.type).map((id) => {
    const known =
      codex.known === undefined || (codex.known !== null && reading.check(bindEntry(codex.known, id)) === true);
    if (!known) return { key: id, fields: {}, enabled: false, known: false };
    const facts: Record<string, Shown> = {};
    for (const [text, read] of codex.facts) {
      const bound = read && 'fact' in read ? bindEntry(read, id) : undefined;
      facts[text] = bound ? shown(reading.fact(bound.fact, bound.args)) : null;
    }
    const conditions: Record<string, boolean | null> = {};
    for (const [text, condition] of codex.conditions) {
      conditions[text] = condition ? reading.check(bindEntry(condition, id)) : null;
    }
    const fields = { ...ownFields(content.get(codex.type, id)), id, name: nameOf(content, codex.type, id) ?? id };
    return { key: id, fields, enabled: false, facts, conditions };
  });
}

export const creditEntries = (credits: readonly PackCredit[]): Entry[] =>
  credits.map((credit) => ({
    key: credit.asset,
    fields: {
      asset: credit.asset,
      author: credit.author ?? null,
      licence: credit.licenceName,
      source: credit.source,
      tool: credit.tool ?? null,
    },
    enabled: false,
  }));
