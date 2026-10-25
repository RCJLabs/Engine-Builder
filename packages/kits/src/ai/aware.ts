/**
 * Awareness (docs/specs/ai.md#perception): the stage's ai/sensed says, once a real second, what each
 * NPC of the player's space saw and heard; each sighting adds 8 at arm's length down to 2 at the
 * edge of sight, each noise 20, and an NPC the report doesn't name loses 1 each 200 ms. Whole
 * numbers from 0 to 100, read as unaware, suspicious from 30 and alerted from 70.
 */
import type { Action, ModuleContext } from '@eb/core';
import { own } from '../own.ts';
import { type AiSlice, AWARE_MAX, HEARD_GAIN, levelOf, QUIET_MS } from './types.ts';

/** The most real time one report covers: the stage sends one a second. */
const MOST_MS = 2000;
/** The stage looks five times a second. */
const MOST_SIGHTINGS = 12;
const MOST_NOISES = 20;
const NEAR_CM = 100;
const NEAR_GAIN = 8;
const FAR_GAIN = 2;

/** One sighting's gain at `cm` from an NPC that sees `sightM` metres. */
export function sightGain(cm: number, sightM: number): number {
  const range = Math.round(sightM * 100);
  if (range <= NEAR_CM) return NEAR_GAIN;
  const closer = Math.max(0, range - Math.round(cm));
  const gain = FAR_GAIN + Math.floor(((NEAR_GAIN - FAR_GAIN) * closer) / (range - NEAR_CM));
  return Math.min(NEAR_GAIN, Math.max(FAR_GAIN, gain));
}

interface Sensing {
  readonly seen: readonly number[];
  readonly heard: number;
}

const isObject = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function sensingOf(value: unknown): Sensing | undefined {
  if (!isObject(value)) return undefined;
  const { seen = [], heard = 0 } = value;
  const cms = (list: unknown): list is number[] =>
    Array.isArray(list) && list.length <= MOST_SIGHTINGS && list.every((n) => Number.isSafeInteger(n) && n >= 0);
  if (!cms(seen) || !Number.isSafeInteger(heard) || (heard as number) < 0 || (heard as number) > MOST_NOISES)
    return undefined;
  return { seen, heard: heard as number };
}

/** The NPCs that sense in a space, with how far each sees, by actor. */
export type Sensers = (space: string) => ReadonlyMap<string, number>;

export function sensed(ctx: ModuleContext<AiSlice>, action: Action, sensers: Sensers): void {
  const { space, ms, npcs } = action as Action & { space?: unknown; ms?: unknown; npcs?: unknown };
  if (typeof space !== 'string' || !isObject(npcs)) ctx.refuse('bad-sensed');
  if (!Number.isSafeInteger(ms) || (ms as number) < 1 || (ms as number) > MOST_MS) ctx.refuse('bad-sensed', { ms });
  // A stage a step behind, still walking the space the player left, must not stir anyone.
  if (ctx.fact('world.in', { space }) !== true) ctx.refuse('elsewhere', { space });
  const here = sensers(space as string);
  const reports = new Map<string, Sensing>();
  for (const [actor, value] of Object.entries(npcs as Record<string, unknown>)) {
    const sensing = sensingOf(value);
    if (sensing === undefined) ctx.refuse('bad-sensed', { actor });
    if (!here.has(actor)) ctx.refuse('no-npc', { actor });
    reports.set(actor, sensing as Sensing);
  }
  const aware = (ctx.write() as { aware: Record<string, number> }).aware;
  for (const [actor, sight] of here) {
    const was = own(aware, actor) ?? 0;
    const report = reports.get(actor);
    const gain = report
      ? report.seen.reduce((sum, cm) => sum + sightGain(cm, sight), 0) + HEARD_GAIN * report.heard
      : -Math.floor((ms as number) / QUIET_MS);
    const now = Math.min(AWARE_MAX, Math.max(0, was + gain));
    if (now === 0) delete aware[actor];
    else aware[actor] = now;
    if (levelOf(now) !== levelOf(was)) ctx.emit('aware', { actor, level: levelOf(now) });
  }
}
