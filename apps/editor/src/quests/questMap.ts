/**
 * The quest map's layout (M3.9, D47, docs/specs/editor-kits.md#the-quests-kit-m39): a box for each
 * stage, in rows by the fewest steps from the first (the kit's stepsFrom, which W124 reads too),
 * and where each stage's objectives, its Then, its own set-stages and its job's outcomes (M3.10)
 * lead, and how it can end; and where the quest goes when a slot's record is gone.
 * Stages the first doesn't reach come last, in a row of their own. Read from the form's value as
 * it stands, which may not hold together yet: whatever isn't the shape a quest has is left out,
 * and no value throws.
 */
import { canBeDone, endingStages, type QuestRecord, questStepsFrom } from '@eb/kits';

/** Where a box leads: by an objective, its Then or its effects, to a stage; or how the quest ends there. */
export interface Exit {
  /** “Pay the miner 30 credits”, Then, or Its effects. */
  readonly by: string;
  /** The stage it leads to; undefined when the quest ends there. */
  readonly to: string | undefined;
  /** False when the quest has no stage `to` (E035). */
  readonly found: boolean;
  /** A Then from a stage whose objectives all lead elsewhere, which is never taken. */
  readonly never?: boolean;
}

export interface Box {
  /** Its place in the quest's stages, as the form's paths have it: /stages/<index>. */
  readonly index: number;
  readonly id: string;
  readonly log: string;
  readonly exits: readonly Exit[];
  /** How it fails the quest, in words: “Fails as it is reached”, “Fails after 6 days”. */
  readonly fails: readonly string[];
  /** The quest can never end from here (W126). */
  readonly stuck: boolean;
}

export interface MapRow {
  /** Steps from the first stage; undefined for the stages it doesn't reach. */
  readonly steps: number | undefined;
  readonly boxes: readonly Box[];
}

type Loose = Readonly<Record<string, unknown>>;

const loose = (value: unknown): Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Loose) : {};
const listOf = (value: unknown): Loose[] => (Array.isArray(value) ? value.map(loose) : []);
const textOf = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);
const daysOf = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;

/** A job's outcomes as the kit's graph reads them, those with a whole chance and a stage to go to. */
function jobShape(value: unknown) {
  if (typeof value !== 'object' || value === null) return {};
  const outcomes = listOf(loose(value).outcomes).flatMap((o) =>
    textOf(o.next) && typeof o.chance === 'number' ? [{ chance: o.chance, next: textOf(o.next) as string }] : [],
  );
  return { job: { takes: {}, outcomes } };
}

/** What the kit's graph reads of a stage, and no more: ids, where it leads, and how it ends. */
function stageShape(stage: Loose, id: string) {
  const objectives = listOf(stage.objectives).map((o, i) => ({
    id: textOf(o.id) ?? String(i),
    text: textOf(o.text) ?? textOf(o.id) ?? 'An objective',
    ...(textOf(o.next) ? { next: textOf(o.next) } : {}),
  }));
  return {
    id,
    ...(objectives.length > 0 ? { objectives } : {}),
    ...(textOf(stage.next) ? { next: textOf(stage.next) } : {}),
    ...(stage.fails === true ? { fails: true } : {}),
    ...(stage['fail-when'] !== undefined && stage['fail-when'] !== '' ? { 'fail-when': stage['fail-when'] } : {}),
    ...(daysOf(stage.days) ? { days: daysOf(stage.days) } : {}),
    ...(stage.job === undefined ? {} : jobShape(stage.job)),
    effects: listOf(stage.effects).map((e): Loose & { effect: string } => ({ ...e, effect: textOf(e.effect) ?? '' })),
  };
}

/** What the kit's graph reads of the slots: which can lose their record, and where the quest goes then. */
const slotShapes = (value: unknown) =>
  listOf(loose(value).slots).flatMap((slot) => {
    const id = textOf(slot.id);
    if (id === undefined) return [];
    const keeps = slot.keeps !== undefined && slot.keeps !== '';
    return [
      {
        id,
        type: textOf(slot.type) ?? '',
        ...(keeps ? { keeps: true } : {}),
        ...(textOf(slot.gone) ? { gone: textOf(slot.gone) } : {}),
      },
    ];
  });

/** Where the quest goes when each slot's record is gone, for a line above the map: a stage, or failing. */
export interface GoneLine {
  readonly slot: string;
  /** The stage; undefined when the quest fails. */
  readonly to: string | undefined;
  readonly found: boolean;
}

export function goneLines(value: unknown): GoneLine[] {
  const stages = new Set(listOf(loose(value).stages).flatMap((stage) => textOf(stage.id) ?? []));
  return slotShapes(value)
    .filter((slot) => slot.keeps)
    .map((slot) => ({ slot: slot.id, to: slot.gone, found: slot.gone === undefined || stages.has(slot.gone) }));
}

type Shape = ReturnType<typeof stageShape>;

function exitsOf(quest: string, stage: Shape, stages: ReadonlySet<string>): Exit[] {
  const exit = (by: string, to: string | undefined, never = false): Exit => ({
    by,
    to,
    found: to === undefined || stages.has(to),
    ...(never ? { never } : {}),
  });
  const exits = (stage.objectives ?? []).flatMap((o) => (o.next ? [exit(`“${o.text}”`, o.next)] : []));
  for (const outcome of stage.job?.outcomes ?? []) exits.push(exit(`${outcome.chance}%`, outcome.next));
  const done = canBeDone(stage as never);
  if (stage.next !== undefined) exits.push(exit('Then', stage.next, !done));
  else if (done && stage.fails !== true) exits.push(exit('Then', undefined));
  for (const effect of stage.effects) {
    if (effect.effect === 'set-stage' && effect.quest === quest && textOf(effect.stage)) {
      exits.push(exit('Its effects', effect.stage as string));
    }
  }
  return exits;
}

function failsOf(stage: Shape): string[] {
  if (stage.fails === true) return ['Fails as it is reached'];
  if (stage.job !== undefined) return [];
  const waits = (stage.objectives ?? []).length > 0;
  return [
    ...(waits && stage['fail-when'] !== undefined ? ['Fails when its condition holds'] : []),
    ...(waits && stage.days !== undefined ? [`Fails after ${stage.days === 1 ? '1 day' : `${stage.days} days`}`] : []),
  ];
}

/** The map of quest `id`'s value: its rows, those the first stage reaches by steps, then the rest. */
export function questMap(id: string, value: unknown): MapRow[] {
  const stages = listOf(loose(value).stages).flatMap((stage, index) => {
    const stageId = textOf(stage.id);
    return stageId === undefined ? [] : [{ index, stage, shape: stageShape(stage, stageId) }];
  });
  const ids = new Set(stages.map((s) => s.shape.id));
  const record = { name: '', slots: slotShapes(value), stages: stages.map((s) => s.shape) } as unknown as QuestRecord;
  const steps = questStepsFrom(id, record);
  const ending = endingStages(id, record);
  const first = new Map<string, number>();
  for (const { shape, index } of stages) if (!first.has(shape.id)) first.set(shape.id, index);
  const rows = new Map<number | undefined, Box[]>();
  for (const { index, stage, shape } of stages) {
    // A second stage with one id is never reached: the kit reads the first (E035).
    const at = first.get(shape.id) === index ? steps.get(shape.id) : undefined;
    const box: Box = {
      index,
      id: shape.id,
      log: typeof stage.log === 'string' ? stage.log : '',
      exits: exitsOf(id, shape, ids),
      fails: failsOf(shape),
      stuck: at !== undefined && !ending.has(shape.id),
    };
    rows.set(at, [...(rows.get(at) ?? []), box]);
  }
  const reached = [...rows.keys()].filter((k): k is number => k !== undefined).sort((a, b) => a - b);
  const order: (number | undefined)[] = rows.has(undefined) ? [...reached, undefined] : reached;
  return order.map((at) => ({ steps: at, boxes: rows.get(at) ?? [] }));
}
