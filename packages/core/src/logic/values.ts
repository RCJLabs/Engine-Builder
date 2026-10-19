import { isRecordId } from '../records.ts';
import type { Domain, Value } from './types.ts';

// A name in a condition: words of a-z and 0-9 joined by single hyphens, starting with a letter,
// so the text form can tell a name from a number.
const NAME = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*';
export const NAME_PATTERN = new RegExp(`^${NAME}$`);
/** A quest's slot, standing for the record it holds (M3.10): "@mark". */
export const SLOT_PATTERN = new RegExp(`^@${NAME}$`);
export const isSlotName = (v: unknown): v is string => typeof v === 'string' && SLOT_PATTERN.test(v);
/** "module.fact", like "hold.count". */
export const FACT_PATTERN = new RegExp(`^${NAME}\\.${NAME}$`);
// No exponents, so every number prints and reads back exactly.
const NUMBER_TEXT = /^-?\d+(?:\.\d+)?$/;

/** A number the text form can write: finite, not -0, no exponent. */
export const isPrintableNumber = (n: number): boolean =>
  Number.isFinite(n) && !Object.is(n, -0) && NUMBER_TEXT.test(String(n));

export const isValue = (v: unknown): v is Value =>
  typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && isPrintableNumber(v));

export const isOrdering = (op: string): boolean => op === '<' || op === '<=' || op === '>' || op === '>=';

/** The records that ref domains name. A RecordStore is one. */
export interface RecordIndex {
  ids(type: string): readonly string[];
  has(type: string, id: string): boolean;
}

/**
 * Why a slot can't stand where a value of this domain goes, or undefined when it can: a slot holds
 * a record, so it goes where an id of its type or any text does. `slots` gives each slot's type,
 * and is missing outside a quest, where no slot can be named.
 */
export function slotProblem(
  value: string,
  domain: Domain,
  slots: Readonly<Record<string, string>> | undefined,
): string | undefined {
  const name = value.slice(1);
  if (slots === undefined) return `${value} names a quest's slot, which only that quest's own fields can name`;
  const type = Object.hasOwn(slots, name) ? slots[name] : undefined;
  if (type === undefined) {
    const has = Object.keys(slots);
    return `No slot ${name} here: ${has.length === 0 ? 'none can be named' : `the slots are ${has.join(', ')}`}`;
  }
  if (domain.type === 'text' || (domain.type === 'ref' && domain.to === type)) return undefined;
  return domain.type === 'ref'
    ? `${name} holds ${article(type)}, not ${article(domain.to)}`
    : `${name} holds a record, not ${domainWords(domain)}`;
}

const article = (word: string): string => (/^[aeiou]/.test(word) ? `an ${word}` : `a ${word}`);

const domainWords = (domain: Domain): string =>
  domain.type === 'bool'
    ? 'true or false'
    : domain.type === 'enum'
      ? `one of: ${domain.values.join(', ')}`
      : 'a number';

/**
 * Why a value can't be compared with a fact of this domain, or undefined when it can. Bounds
 * are not checked: a comparison past them is never true, and the lint says so (W102).
 */
export const valueProblem = (value: Value, domain: Domain, records?: RecordIndex): string | undefined =>
  problem(value, domain, records, false);

/** Why a value is not one of the domain's values: what an argument, and a fact's answer, must be. */
export const domainProblem = (value: unknown, domain: Domain, records?: RecordIndex): string | undefined =>
  problem(value, domain, records, true);

function problem(value: unknown, domain: Domain, records: RecordIndex | undefined, bounds: boolean) {
  switch (domain.type) {
    case 'bool':
      return typeof value === 'boolean' ? undefined : 'Expected true or false';
    case 'text':
      return typeof value === 'string' ? undefined : 'Expected text';
    case 'enum':
      return domain.values.includes(value as string) ? undefined : `Expected one of: ${domain.values.join(', ')}`;
    case 'ref':
      if (!isRecordId(value)) return `Expected the id of a record of type ${domain.to}`;
      return records && !records.has(domain.to, value) ? `No ${domain.to} record "${value}"` : undefined;
    case 'int':
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return 'Expected a number';
      if (!bounds) return undefined;
      if (domain.type === 'int' && !Number.isInteger(value)) return 'Expected a whole number';
      if (domain.min !== undefined && value < domain.min) return `Expected at least ${domain.min}`;
      if (domain.max !== undefined && value > domain.max) return `Expected at most ${domain.max}`;
      return undefined;
  }
}

/** What is wrong with a domain as a module declared it, or undefined. A programmer error. */
export function domainError(domain: Domain): string | undefined {
  switch (domain.type) {
    case 'bool':
    case 'text':
      return undefined;
    case 'int':
    case 'number': {
      const { min, max } = domain;
      if ([min, max].some((bound) => bound !== undefined && !Number.isFinite(bound)))
        return 'min and max are finite numbers';
      if (min !== undefined && max !== undefined && min > max) return `min ${min} is above max ${max}`;
      if (domain.type === 'int' && min !== undefined && max !== undefined && Math.ceil(min) > max) {
        return `no whole number lies between ${min} and ${max}`;
      }
      return undefined;
    }
    case 'enum':
      if (domain.values.length === 0) return 'an enum needs at least one value';
      if (new Set(domain.values).size !== domain.values.length) return 'an enum lists a value twice';
      if (!domain.values.every((v) => typeof v === 'string' || isPrintableNumber(v))) {
        return 'enum values are text, or numbers a condition can write';
      }
      return undefined;
    case 'ref':
      return isRecordId(domain.to) ? undefined : `"${domain.to}" is not a record type name`;
    default:
      return `unknown domain type "${String((domain as { type: unknown }).type)}"`;
  }
}
