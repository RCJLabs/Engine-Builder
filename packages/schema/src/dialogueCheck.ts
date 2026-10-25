/**
 * The dialogue kit's checks beyond its type files (M3.8, docs/specs/dialogue.md#checks): E035 for
 * a talk whose ids, or the lines they lead to, don't hold together; E042 for a condition naming a
 * line or an option its talk doesn't have; W119 for a cost in a game without the economy kit;
 * W121 for a line no start reaches; W122 for a line that can show only locked options; and W123
 * for a talk nothing opens. M3.11's, which follow a talk's ways (talkPaths.ts): E035 for lines
 * without text that pass in a loop, W129 for what no way to it lets hold, W130 for a line the
 * talk can't end from. A condition or an open-talk can name a talk before its record is read, so
 * E042 and W123 wait for finish().
 */
import { type Effect, type FactCatalog, NAME_PATTERN, satisfiability } from '@eb/core';
import { ACTOR, ECONOMY, type Line, stepsFrom, TALK, type TalkOption, type TalkRecord } from '@eb/kits';
import type { SoundCondition } from './conditions.ts';
import type { DiagnosticCode } from './diagnostics.ts';
import { factTests } from './flagCheck.ts';
import { endless, passingLoops, treeOf, walkTalk } from './talkPaths.ts';

type Report = (code: DiagnosticCode, path: string, message: string) => void;

const UNWRITABLE = "can't be written in a condition: use lowercase words joined by hyphens";

interface Talking {
  readonly economy: boolean;
  /** Every line id the talk has. */
  readonly lines: ReadonlySet<string>;
  /** The option ids seen so far, across the talk's lines. */
  readonly options: Set<string>;
  readonly report: Report;
}

function checkLeads(to: string | undefined, path: string, talking: Talking): void {
  if (to !== undefined && !talking.lines.has(to)) talking.report('E035', path, `This talk has no line ${to}`);
}

function checkOption(option: TalkOption, at: string, talking: Talking): void {
  const { options, report } = talking;
  if (!NAME_PATTERN.test(option.id)) report('E035', `${at}/id`, `"${option.id}" ${UNWRITABLE}`);
  else if (options.has(option.id)) {
    report('E035', `${at}/id`, `${option.id} is an option twice in this talk: a condition names it by the talk alone`);
  }
  options.add(option.id);
  checkLeads(option.next, `${at}/next`, talking);
  if (option.outcomes) {
    const total = option.outcomes.reduce((sum, outcome) => sum + outcome.chance, 0);
    if (total !== 100) report('E035', `${at}/outcomes`, `Its chances add up to ${total}: they add up to 100`);
    option.outcomes.forEach((outcome, k) => {
      checkLeads(outcome.next, `${at}/outcomes/${k}/next`, talking);
    });
  }
  if (!talking.economy && option.cost !== undefined) {
    report('W119', `${at}/cost`, 'Nothing charges a cost in a game without the economy kit');
  }
}

// An option that can be shown locked; and one always shown and open. A line whose options only
// hide, by Shown if or Once, can't hold a party: with none shown, it goes on.
const locks = (option: TalkOption) => option.needs !== undefined || option.cost !== undefined;
const alwaysOpen = (option: TalkOption) => !locks(option) && option.if === undefined && option.once !== true;

function checkLine(line: Line, at: string, talking: Talking): void {
  const options = line.options ?? [];
  options.forEach((option, j) => {
    checkOption(option, `${at}/options/${j}`, talking);
  });
  (line.branches ?? []).forEach((branch, k) => {
    checkLeads(branch.line, `${at}/branches/${k}/line`, talking);
  });
  checkLeads(line.next, `${at}/next`, talking);
  if (options.some(locks) && !options.some(alwaysOpen)) {
    talking.report(
      'W122',
      `${at}/options`,
      'No option here is always open, and one can be shown locked: a party that can say none of them is stuck',
    );
  }
}

function checkTalk(talk: TalkRecord, economy: boolean, report: Report): Set<string> {
  const talking: Talking = { economy, lines: new Set(talk.lines.map((l) => l.id)), options: new Set(), report };
  talk.starts.forEach((start, i) => {
    checkLeads(start.line, `/starts/${i}/line`, talking);
  });
  const seen = new Set<string>();
  const reached = new Set(stepsFrom(talk).keys());
  talk.lines.forEach((line, i) => {
    const at = `/lines/${i}`;
    if (!NAME_PATTERN.test(line.id)) report('E035', `${at}/id`, `"${line.id}" ${UNWRITABLE}`);
    else if (seen.has(line.id)) report('E035', `${at}/id`, `${line.id} is a line twice in this talk`);
    else if (!reached.has(line.id)) {
      report(
        'W121',
        `${at}/id`,
        'No start leads here, by an option, an outcome, a branch or a Then: it is never shown',
      );
    }
    seen.add(line.id);
    checkLine(line, at, talking);
  });
  return reached;
}

/** E035 for passing loops, W130 for lines the talk can't end from, W129 for what no way to it lets hold. */
function checkWays(talk: TalkRecord, reached: ReadonlySet<string>, facts: FactCatalog, report: Report): void {
  const loops = passingLoops(talk);
  const stuck = endless(talk);
  const walk = walkTalk(talk, facts);
  const alone = (value: unknown) => {
    const tree = treeOf(value, facts);
    return tree === undefined || satisfiability(tree, { catalog: facts }).canBeTrue !== false;
  };
  const first = new Set<string>();
  talk.lines.forEach((line, i) => {
    const at = `/lines/${i}`;
    if (first.has(line.id) || !reached.has(line.id)) return;
    first.add(line.id);
    if (loops.has(line.id)) {
      report(
        'E035',
        `${at}/id`,
        'Lines without text pass to each other in a loop from here: the talk would pass round it forever',
      );
    } else if (stuck.has(line.id)) {
      report('W130', `${at}/id`, 'Every way on from here leads back: the talk can never end');
    }
    if (!walk.complete) return;
    if (!walk.lines.has(line.id)) {
      report('W129', `${at}/id`, 'On every way here, the conditions before rule it out: it is never shown');
      return;
    }
    (line.options ?? []).forEach((option, j) => {
      if (!walk.options.has(`${line.id}/${j}`) && alone(option.if)) {
        report(
          'W129',
          `${at}/options/${j}/if`,
          'On every way to this line, the conditions before rule this out: it is never shown',
        );
      }
    });
    (line.branches ?? []).forEach((branch, k) => {
      if (!walk.branches.has(`${line.id}/${k}`) && alone(branch.if)) {
        report(
          'W129',
          `${at}/branches/${k}/if`,
          'On every way here, the conditions before rule this out: it is never taken',
        );
      }
    });
  });
}

interface Named {
  readonly report: Report;
  readonly path: string;
  readonly talk: string;
  readonly kind: 'line' | 'option';
  readonly name: string;
}

function idsOf(talk: TalkRecord, kind: Named['kind']): string[] {
  const ids =
    kind === 'line' ? talk.lines.map((l) => l.id) : talk.lines.flatMap((l) => (l.options ?? []).map((o) => o.id));
  return [...new Set(ids)];
}

export class DialogueChecks {
  private readonly economy: boolean;
  private readonly facts: FactCatalog;
  private readonly talks = new Map<string, { readonly talk: TalkRecord; readonly report: Report }>();
  private readonly opened = new Set<string>();
  private readonly named: Named[] = [];

  constructor(on: readonly string[], facts: FactCatalog) {
    this.economy = on.includes(ECONOMY);
    this.facts = facts;
  }

  /** One record that passed its schema. */
  record(type: string, id: string, value: unknown, report: Report): void {
    // An NPC's talk (M6.1, D73): placed, Interact opens it, so it is opened as an open-talk opens it.
    const talk = type === ACTOR ? (value as { readonly talk?: unknown }).talk : undefined;
    if (typeof talk === 'string') this.opened.add(talk);
    if (type !== TALK) return;
    const reached = checkTalk(value as TalkRecord, this.economy, report);
    checkWays(value as TalkRecord, reached, this.facts, report);
    this.talks.set(id, { talk: value as TalkRecord, report });
  }

  /** An effect whose schema passed: an open-talk opens the talk it names (W123). */
  effect(effect: Effect): void {
    if (effect.effect === 'open-talk' && typeof effect.talk === 'string') this.opened.add(effect.talk);
  }

  /** A condition's tests that name a line or an option of a talk. */
  condition(report: Report, sound: SoundCondition): void {
    for (const [inner, test] of factTests(sound.tree, '')) {
      const kind = test.fact === 'dialogue.heard' ? 'line' : test.fact === 'dialogue.said' ? 'option' : undefined;
      if (kind === undefined) continue;
      const { talk, [kind]: name } = test.args ?? {};
      if (typeof talk === 'string' && typeof name === 'string') {
        this.named.push({ report, path: sound.at(inner), talk, kind, name });
      }
    }
  }

  finish(): void {
    for (const { report, path, talk, kind, name } of this.named) {
      const record = this.talks.get(talk)?.talk;
      const ids = record === undefined ? undefined : idsOf(record, kind);
      if (ids !== undefined && !ids.includes(name)) {
        const has = ids.length === 0 ? `it has no ${kind}s` : `its ${kind}s are ${ids.join(', ')}`;
        report('E042', path, `The talk ${talk} has no ${kind} ${name}: ${has}`);
      }
    }
    for (const [id, { report }] of this.talks) {
      if (!this.opened.has(id)) {
        report('W123', '', 'No row, choice, line, consequence, outcome or actor opens it');
      }
    }
  }
}
