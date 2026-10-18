/**
 * Events: the beats content may react to (M3.1, docs/specs/triggers.md). A module declares each
 * one with its arguments; the kernel checks every one raised, and listeners hear it when the work
 * that raised it finishes.
 */
import type { Domain } from '../logic/types.ts';
import { domainError, domainProblem, NAME_PATTERN, type RecordIndex } from '../logic/values.ts';

export interface EventInfo {
  /** Argument names and their values. Every one is given each time the event is raised, and nothing else. */
  readonly args?: Readonly<Record<string, Domain>>;
  /** How the editor names it, like "A flag changes". Defaults to the event's id. */
  readonly label?: string;
}

/** Every event a game declares, by id ("flag/changed"). */
export type EventCatalog = Readonly<Record<string, EventInfo>>;

/** What is wrong with an event as a module declared it, or undefined. A programmer error. */
export function eventInfoError(info: EventInfo): string | undefined {
  if (typeof info !== 'object' || info === null) return 'declare an event as { args?, label? }';
  if (info.label !== undefined && (typeof info.label !== 'string' || info.label === ''))
    return 'a label is text that is not empty';
  for (const [arg, domain] of Object.entries(info.args ?? {})) {
    if (!NAME_PATTERN.test(arg)) return `"${arg}" is not a valid argument name`;
    const problem = domainError(domain);
    if (problem) return `argument "${arg}": ${problem}`;
  }
  return undefined;
}

/**
 * Why a raised event's data doesn't match what its module declared, or undefined. Rows match on
 * these arguments, so one missing or of the wrong kind would make a row quietly never fire.
 */
export function eventDataProblem(
  info: EventInfo,
  data: Readonly<Record<string, unknown>>,
  records?: RecordIndex,
): string | undefined {
  const declared = info.args ?? {};
  for (const key of Object.keys(data)) {
    if (!Object.hasOwn(declared, key)) return `it has no argument "${key}"`;
  }
  for (const [arg, domain] of Object.entries(declared)) {
    if (!Object.hasOwn(data, arg)) return `the argument "${arg}" is missing`;
    const problem = domainProblem(data[arg], domain, records);
    if (problem) return `argument "${arg}": ${problem}`;
  }
  return undefined;
}
