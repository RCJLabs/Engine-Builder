/**
 * An animator run (M6.5, D77, docs/specs/animation.md#animators), as plain functions of its record,
 * the body's facts and the time: each layer's state, how far into its clip, and the state it is
 * fading from. Each frame a layer's clip moves on by its rate, then its transitions are read in
 * order from the state playing, `*` for any; the first that holds decides, and one to the state
 * already playing does nothing. A `fit` state's time is the phase's progress laid on its clip, not
 * added up, so a strike's clip ends in the step the fight finds its hit. The stage lays what this
 * gives on three's mixer (mixer.ts); the editor's preview runs the same.
 */
import { type Condition, evaluate, parseCondition } from '@eb/core';
import { ANY, type AnimatorRecord, type AnimLayer, type AnimState, BLEND, type Layer } from '@eb/schema';

/** A clip as the machine needs it: seconds long, and the metres a second it is made for (0 or none: it stays put). */
export interface ClipInfo {
  readonly length: number;
  readonly pace?: number;
}

/** The swing's or the bow's phase: seconds it lasts and seconds in. */
export interface Phase {
  readonly length: number;
  readonly at: number;
}

/** A body's `anim.*` facts this frame (ANIM_FACTS), and the phase its `fit` states are laid on. */
export interface AnimFacts {
  readonly speed: number;
  readonly grounded: boolean;
  readonly rising: boolean;
  readonly swing: 'none' | 'windup' | 'strike' | 'recover';
  readonly draw: 'none' | 'draw' | 'hold' | 'loose';
  readonly weapon: 'none' | 'melee' | 'ranged';
  readonly down: boolean;
  readonly talking: boolean;
  readonly hit: boolean;
  readonly phase?: Phase;
}

export const STILL: AnimFacts = {
  speed: 0,
  grounded: true,
  rising: false,
  swing: 'none',
  draw: 'none',
  weapon: 'none',
  down: false,
  talking: false,
  hit: false,
};

interface Rule {
  readonly from: string;
  readonly to: string;
  /** Null: at the clip's end. */
  readonly when: Condition | null;
  readonly blend: number;
}

export interface MachineLayer {
  readonly start: string;
  readonly states: ReadonlyMap<string, AnimState>;
  readonly rules: readonly Rule[];
}

export interface Machine {
  readonly clips: string;
  readonly layers: Readonly<Partial<Record<Layer, MachineLayer>>>;
}

/** Where a layer is: the state playing, seconds into its clip, and the one it fades from. */
export interface LayerRun {
  readonly state: string;
  readonly time: number;
  readonly from: { readonly state: string; readonly time: number } | null;
  /** The fade's length and how far into it, in seconds. */
  readonly blend: number;
  readonly mixed: number;
}

export type AnimRun = Readonly<Partial<Record<Layer, LayerRun>>>;

/** One clip a layer plays this frame and its weight: the playing state's, and the faded one's. */
export interface Played {
  readonly state: string;
  /** The model and the clip's name, or null for a state with no clip. */
  readonly model: string;
  readonly clip: string | null;
  readonly time: number;
  readonly weight: number;
}

const never: Condition = { any: [] };

function compileLayer(layer: AnimLayer): MachineLayer {
  const rules = (layer.transitions ?? []).map((t) => {
    const parsed = t.when === undefined ? null : parseCondition(t.when);
    // A condition that doesn't parse is E022 at validate; here it never holds.
    const when = parsed === null ? null : parsed.ok ? parsed.condition : never;
    return { from: t.from, to: t.to, when, blend: Math.max(0, t.blend ?? BLEND) };
  });
  return { start: layer.start, states: new Map(layer.states.map((s) => [s.id, s])), rules };
}

/** The record with its conditions parsed once. */
export function compileAnimator(record: AnimatorRecord): Machine {
  return {
    clips: record.clips,
    layers: { base: compileLayer(record.base), ...(record.upper ? { upper: compileLayer(record.upper) } : {}) },
  };
}

/** Every layer in its start state, at the start of its clip. */
export function startRun(machine: Machine): AnimRun {
  const run: Partial<Record<Layer, LayerRun>> = {};
  for (const [name, layer] of Object.entries(machine.layers) as [Layer, MachineLayer][])
    run[name] = { state: layer.start, time: 0, from: null, blend: 0, mixed: 0 };
  return run;
}

/** The fact a condition reads, from the body's facts: `anim.speed` and the rest. */
const readFact = (facts: AnimFacts) => (test: { fact: string }) => {
  if (!test.fact.startsWith('anim.')) return undefined;
  const value = (facts as unknown as Record<string, unknown>)[test.fact.slice(5)];
  return typeof value === 'object' ? undefined : value;
};

export type ClipOf = (model: string, clip: string) => ClipInfo | undefined;

const modelOf = (machine: Machine, state: AnimState | undefined) => state?.from ?? machine.clips;

/** Seconds a state's clip moves on in `dt`: by its speed, the body's over the clip's pace, or 1. */
function rateOf(state: AnimState, info: ClipInfo, facts: AnimFacts): number {
  if (state.rate === 'pace') return info.pace && info.pace > 0 ? facts.speed / info.pace : 1;
  if (state.rate === 'fit') return 1;
  return state.speed ?? 1;
}

/** Where a state's clip is after `dt`, and whether it came to its end: a one-shot's last frame, or a loop wrapping. */
function moved(state: AnimState | undefined, info: ClipInfo | undefined, time: number, dt: number, facts: AnimFacts) {
  if (!state || !info || info.length <= 0) return { time: 0, ended: true };
  if (state.rate === 'fit' && facts.phase) {
    const fit = facts.phase.length > 0 ? Math.min(1, facts.phase.at / facts.phase.length) : 1;
    return { time: info.length * fit, ended: fit >= 1 };
  }
  const next = time + dt * rateOf(state, info, facts);
  if (state.loop) return { time: next % info.length, ended: next >= info.length };
  return { time: Math.min(next, info.length), ended: next >= info.length };
}

/** One layer `dt` seconds on. */
export function stepLayer(
  machine: Machine,
  layer: MachineLayer,
  run: LayerRun,
  facts: AnimFacts,
  dt: number,
  clipOf: ClipOf,
): LayerRun {
  const state = layer.states.get(run.state);
  const info = state?.clip === undefined ? undefined : clipOf(modelOf(machine, state), state.clip);
  const now = moved(state, info, run.time, dt, facts);
  const fromState = run.from ? layer.states.get(run.from.state) : undefined;
  const fromInfo = fromState?.clip === undefined ? undefined : clipOf(modelOf(machine, fromState), fromState.clip);
  const mixed = run.mixed + dt;
  let from: LayerRun['from'] = null;
  // The state faded from goes on at its own rate; a fit one holds where it was, its phase gone.
  if (run.from && mixed < run.blend)
    from =
      fromState?.rate === 'fit'
        ? run.from
        : { state: run.from.state, time: moved(fromState, fromInfo, run.from.time, dt, facts).time };
  const read = readFact(facts);
  for (const rule of layer.rules) {
    if (rule.from !== ANY && rule.from !== run.state) continue;
    const holds = rule.when === null ? now.ended : evaluate(rule.when, read) === true;
    if (!holds) continue;
    if (rule.to === run.state || !layer.states.has(rule.to)) break;
    const into: LayerRun = {
      state: rule.to,
      time: 0,
      // A fit state fades from where its own phase left it: the facts already hold the next phase.
      from: rule.blend > 0 ? { state: run.state, time: state?.rate === 'fit' ? run.time : now.time } : null,
      blend: rule.blend,
      mixed: 0,
    };
    // A fit state starts where its phase is, not at its clip's start.
    const target = layer.states.get(rule.to);
    const targetInfo = target?.clip === undefined ? undefined : clipOf(modelOf(machine, target), target.clip);
    return target?.rate === 'fit' ? { ...into, time: moved(target, targetInfo, 0, 0, facts).time } : into;
  }
  return { state: run.state, time: now.time, from, blend: from ? run.blend : 0, mixed: from ? mixed : 0 };
}

/** Every layer `dt` seconds on. */
export function stepAnimator(machine: Machine, run: AnimRun, facts: AnimFacts, dt: number, clipOf: ClipOf): AnimRun {
  const next: Partial<Record<Layer, LayerRun>> = {};
  for (const [name, layer] of Object.entries(machine.layers) as [Layer, MachineLayer][]) {
    const was = run[name] ?? { state: layer.start, time: 0, from: null, blend: 0, mixed: 0 };
    next[name] = stepLayer(machine, layer, was, facts, dt, clipOf);
  }
  return next;
}

/** What a layer plays now: the playing state at its fade's weight, the faded one at the rest. */
export function playedOf(machine: Machine, layer: Layer, run: AnimRun): Played[] {
  const states = machine.layers[layer]?.states;
  const at = run[layer];
  if (!states || !at) return [];
  const weight = at.from && at.blend > 0 ? Math.min(1, at.mixed / at.blend) : 1;
  const entry = (state: string, time: number, w: number): Played => {
    const s = states.get(state);
    return { state, model: modelOf(machine, s), clip: s?.clip ?? null, time, weight: w };
  };
  const played = [entry(at.state, at.time, weight)];
  if (at.from && weight < 1) played.push(entry(at.from.state, at.from.time, 1 - weight));
  return played;
}
