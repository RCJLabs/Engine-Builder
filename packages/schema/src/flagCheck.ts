/**
 * The flags' checks across a project, and their lint (M3.1, D36): bounds that hold the start
 * (E027), flags set and read as the kind they are (E026), and flags set but never read, read but
 * never set, or never named (W108 to W110), as rule-or-drool's src/validate/rules.ts warns of its
 * flags. Records arrive in any order, so the checks that need every flag run at the end.
 */
import {
  type Condition,
  conditionRefs,
  type Effect,
  type FactCatalog,
  type FactTest,
  FLAG,
  type FlagNumber,
  type FlagRecord,
  isRecordId,
} from '@eb/core';
import type { Report } from './checkValue.ts';
import type { SoundCondition } from './conditions.ts';

interface Place {
  /** The record, as "type:id". */
  readonly from: string;
  readonly path: string;
  readonly report: Report;
}

const range = ({ min, max }: FlagNumber): string =>
  min !== undefined && max !== undefined ? `${min} to ${max}` : min !== undefined ? `${min} and up` : `up to ${max}`;

const outside = (flag: FlagNumber, n: number) =>
  (flag.min !== undefined && n < flag.min) || (flag.max !== undefined && n > flag.max);

/** "sheet:trader", "sheet:trader and sheet:raids", or the first two and how many more. */
function listed(from: ReadonlySet<string>): string {
  const all = [...from].sort();
  if (all.length <= 2) return all.join(' and ');
  return `${all.slice(0, 2).join(', ')} and ${all.length - 2} more`;
}

/**
 * Flags set and read outside the records (M5.8): by a space's trigger zones and by the screens'
 * conditions and bindings. Each flag's id to the files that set or read it.
 */
export interface FlagUses {
  readonly set: ReadonlyMap<string, ReadonlySet<string>>;
  readonly read: ReadonlyMap<string, ReadonlySet<string>>;
}

export class FlagChecks {
  private readonly flags = new Map<string, { readonly record: FlagRecord; readonly report: Report }>();
  private readonly setters = new Map<string, Set<string>>();
  private readonly readers = new Map<string, Set<string>>();
  private readonly sets: (Place & { readonly effect: Effect })[] = [];
  private readonly tests: (Place & { readonly test: FactTest })[] = [];

  /** A flag record that passed its schema: its own bounds are checked now (E027). */
  declare(id: string, record: FlagRecord, report: Report): void {
    this.flags.set(id, { record, report });
    const flag = record.number;
    if (!flag) return;
    if (flag.min !== undefined && flag.max !== undefined && flag.min > flag.max) {
      report('E027', '/number/max', `The highest, ${flag.max}, is below the lowest, ${flag.min}`);
      return;
    }
    const start = flag.start ?? 0;
    if (!outside(flag, start)) return;
    if (flag.start === undefined)
      report(
        'E027',
        '/number',
        `It starts at 0 when Starts at is left out, which is outside ${range(flag)}: give it a start`,
      );
    else report('E027', '/number/start', `It starts at ${start}, outside ${range(flag)}`);
  }

  /** An effect whose schema passed: a set-flag or add-to-flag sets its flag. */
  effect(place: Place, effect: Effect): void {
    if ((effect.effect !== 'set-flag' && effect.effect !== 'add-to-flag') || !isRecordId(effect.flag)) return;
    this.add(this.setters, effect.flag, place.from);
    this.sets.push({ ...place, effect });
  }

  /** A condition whose shape is sound: it reads each flag it names. */
  condition(place: Place, sound: SoundCondition, facts: FactCatalog): void {
    for (const ref of conditionRefs(sound.tree, facts))
      if (ref.type === FLAG) this.add(this.readers, ref.id, place.from);
    for (const [inner, test] of factTests(sound.tree, '')) {
      if ((test.fact === 'flag.on' || test.fact === 'flag.number') && isRecordId(test.args?.flag))
        this.tests.push({ ...place, path: sound.at(inner), test });
    }
  }

  /** A row's When names the flag: the row hears it change, which reads it. */
  heard(flag: string, from: string): void {
    this.add(this.readers, flag, from);
  }

  /** Flags set and read outside the records: they count for the lint, as a record's would. */
  elsewhere({ set, read }: FlagUses): void {
    for (const [flag, from] of set) for (const where of from) this.add(this.setters, flag, where);
    for (const [flag, from] of read) for (const where of from) this.add(this.readers, flag, where);
  }

  /** E026 for every use of a flag as the other kind; then the lint, for each flag. */
  finish(named: (flag: string) => boolean): void {
    for (const place of this.sets) this.checkSet(place);
    for (const place of this.tests) this.checkTest(place);
    for (const [id, { record, report }] of this.flags) {
      const setBy = this.setters.get(id);
      const readBy = this.readers.get(id);
      if (setBy && !readBy) {
        report('W108', '', `Set by ${listed(setBy)}, but no condition or row's When reads it`);
      } else if (readBy && !setBy) {
        const holds = record.number ? `holds ${record.number.start ?? 0}` : 'is off';
        report('W109', '', `Read by ${listed(readBy)}, but nothing sets it: it always ${holds}`);
      } else if (!setBy && !readBy && !named(id)) {
        report('W110', '', 'Nothing sets or reads this flag');
      }
    }
  }

  private checkSet({ path, report, effect }: Place & { readonly effect: Effect }): void {
    const id = effect.flag as string;
    const flag = this.flags.get(id)?.record;
    if (!flag) return;
    if (effect.effect === 'add-to-flag') {
      if (!flag.number) report('E026', `${path}/flag`, `"${id}" is on or off: change it with set-flag`);
      return;
    }
    const { to } = effect;
    if (!flag.number) {
      if (typeof to !== 'boolean') report('E026', `${path}/to`, `"${id}" is on or off: set it to true or false`);
    } else if (typeof to === 'boolean') {
      report('E026', `${path}/to`, `"${id}" is a number: set it to a whole number`);
    } else if (typeof to === 'number' && outside(flag.number, to)) {
      report('E026', `${path}/to`, `"${id}" goes ${range(flag.number)}: ${to} is outside`);
    }
  }

  private checkTest({ path, report, test }: Place & { readonly test: FactTest }): void {
    const id = test.args?.flag as string;
    const flag = this.flags.get(id)?.record;
    if (!flag) return;
    if (test.fact === 'flag.on' && flag.number) report('E026', path, `"${id}" is a number: read it with flag.number`);
    if (test.fact === 'flag.number' && !flag.number) report('E026', path, `"${id}" is on or off: read it with flag.on`);
  }

  private add(map: Map<string, Set<string>>, flag: string, from: string): void {
    const set = map.get(flag) ?? new Set();
    set.add(from);
    map.set(flag, set);
  }
}

/** Every fact test in a condition, with its place inside it. */
/** Every fact test in a condition, with its place inside it. */
export function factTests(condition: Condition, path: string): [string, FactTest][] {
  if ('all' in condition) return condition.all.flatMap((c, i) => factTests(c, `${path}/all/${i}`));
  if ('any' in condition) return condition.any.flatMap((c, i) => factTests(c, `${path}/any/${i}`));
  if ('not' in condition) return factTests(condition.not, `${path}/not`);
  return [[path, condition]];
}
