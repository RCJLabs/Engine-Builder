/**
 * The quests: all 11, each step a stage. An act-1 step is done by winning its job on the board
 * (`board/won`); an act-2 step by one of its event's done choices, and it fails on a cold one. A
 * step goes cold once its act is over. An act-3 step is the quest's last stage, shown in the
 * journal as what lies ahead: this rebuild ends at Settle, so its pay-off never comes.
 */
import { defined, type RecordSet, type Value } from './records.ts';
import type { Quest, Source, Step } from './source.ts';

const chose = (event: string, choices: readonly string[]) =>
  choices.map((choice) => `events.chose(event: ${event}, choice: ${choice})`).join(' or ');

/** The words of an event's choices, joined: "Tag it for the Fleet, or Tag it, sign on Varga". */
function labels(source: Source, event: string, choices: readonly string[]): string {
  const found = source.events.events.find((e) => e.id === event);
  if (!found) throw new Error(`No event ${event}`);
  return choices.map((id) => found.choices.find((c) => c.id === id)?.label ?? id).join(', or ');
}

const stageId = (step: Step, i: number) => step.job ?? step.event ?? (step.act === 3 ? 'colony' : `step-${i + 1}`);

function stageOf(source: Source, quest: Quest, step: Step, i: number): Value {
  const before = quest.steps[i - 1];
  const after = quest.steps[i + 1];
  const opening = i === 0 ? `${quest.blurb} ` : '';
  // What the step before said and did as it was done: its words and its effects, as this one is reached.
  const said = before?.said ? `${before.said} ` : '';
  const effects = Object.entries(before?.effects ?? {}).map(([key, by]) => {
    if (key !== 'heat') throw new Error(`A step effect the import doesn't know: ${key}`);
    return { effect: 'add-to-flag', flag: 'heat', by };
  });
  const next = after ? stageId(after, i + 1) : undefined;
  const common = {
    id: stageId(step, i),
    log: `${said}${opening}${step.next}`,
    effects: effects.length > 0 ? effects : undefined,
  };
  if (step.act === 1 && step.job) {
    const job = source.contracts.jobs.find((j) => j.id === step.job);
    return defined({
      ...common,
      objectives: [
        {
          id: 'job',
          text: `Win ${job?.title ?? step.job} on the board`,
          count: { event: 'board/won', args: { job: step.job }, to: 1 },
        },
      ],
      next,
      'fail-when': 'campaign.act >= 2',
      why: 'The ship launched: the job went to someone else.',
    });
  }
  if (step.act === 2 && step.event) {
    const done = step.done ?? [];
    const cold = step.cold ?? [];
    return defined({
      ...common,
      objectives: [{ id: 'done', text: labels(source, step.event, done), 'done-when': chose(step.event, done) }],
      next,
      'fail-when': cold.length > 0 ? `${chose(step.event, cold)} or run.past-charts` : 'run.past-charts',
      why:
        cold.length > 0
          ? `It went cold: ${labels(source, step.event, cold).toLowerCase()}.`
          : 'The run left the charts behind.',
    });
  }
  // Act 3: what lies ahead at the colony, which this rebuild doesn't reach.
  return defined({
    ...common,
    objectives: [
      { id: 'colony', text: `${step.place?.name ?? 'At the colony'}: act 3`, 'done-when': 'campaign.act >= 3' },
    ],
  });
}

export function importQuests(source: Source, set: RecordSet): void {
  for (const quest of source.quests.quests) {
    set.add(
      'quest',
      quest.id,
      defined({
        name: quest.name,
        'starts-when': quest.background ? `campaign.background == ${quest.background}` : undefined,
        stages: quest.steps.map((step, i) => stageOf(source, quest, step, i)),
      }),
    );
  }
}
