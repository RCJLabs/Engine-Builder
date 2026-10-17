import { evaluate } from '../logic/evaluate.ts';
import type { Condition, Truth } from '../logic/types.ts';
import { domainProblem } from '../logic/values.ts';
import { isRecordId } from '../records.ts';
import { Rng } from '../rng.ts';
import { cloneJson, freezeJson } from './json.ts';
import type { FactArgs, ModeControl, ModuleContext, PreviewContext } from './module.ts';
import { Attempts, Refusal } from './refusal.ts';
import { type EffectEntry, KERNEL, type Registry } from './registry.ts';
import type { Beat, Effect, EffectPreview, GameState, ModeFrame, SimContext } from './types.ts';

/** Effects that apply effects are fine; this many levels deep means one is applying itself. */
const MAX_EFFECT_DEPTH = 64;

/**
 * One action's work. Slices are copied the first time a module writes them, and the copies,
 * the streams and the mode stack replace the old ones only at commit, so a refused or failed
 * action leaves no trace and the state passed in is never changed.
 */
export class Transaction {
  readonly beats: Beat[] = [];
  private readonly registry: Registry;
  private readonly state: GameState;
  private readonly sim: SimContext;
  private readonly drafts = new Map<string, unknown>();
  private readonly streams = new Map<string, Rng>();
  private modes: readonly ModeFrame[] | undefined;
  private depth = 0;
  private readonly attempts: Attempts;

  /** `skipped` holds the attempts that refused in earlier runs of this action, by name. */
  constructor(
    registry: Registry,
    state: GameState,
    sim: SimContext,
    skipped: ReadonlyMap<string, Refusal> = new Map(),
  ) {
    this.registry = registry;
    this.state = state;
    this.sim = sim;
    this.attempts = new Attempts(skipped);
  }

  context(module: string): ModuleContext<unknown> {
    return {
      module,
      step: this.state.kernel.step + 1,
      content: this.sim.content,
      read: () => this.read(module),
      write: () => this.write(module),
      fact: (id, args) => this.fact(id, args),
      check: (condition) => this.check(condition),
      apply: (effect) => this.apply(effect),
      attempt: (work) => this.attempts.run(work),
      rng: (name) => this.stream(`${module}/${kebab(name, 'stream name')}`),
      emit: (what, data) => this.emit(`${module}/${kebab(what, 'beat name')}`, data),
      refuse: (reason, data = {}) => {
        throw new Refusal(kebab(reason, 'refusal reason'), data);
      },
      modes: this.modeControl(),
    };
  }

  read(module: string): unknown {
    return this.drafts.has(module) ? this.drafts.get(module) : this.state[module];
  }

  fact(id: string, args: FactArgs = {}): unknown {
    const fact = this.registry.facts.get(id);
    if (!fact) throw new Error(`Unknown fact "${id}"`);
    const value = fact.read(
      { state: this.read(fact.module), content: this.sim.content, fact: (i, a) => this.fact(i, a) },
      args,
    );
    // The lint trusts a fact's domain, so an answer outside it is a bug in the module.
    const { domain } = fact.info;
    const problem = domain && value !== undefined && value !== null && domainProblem(value, domain, this.sim.content);
    if (problem) throw new Error(`Fact "${id}" answered ${shown(value)}, outside its domain: ${problem}`);
    return value;
  }

  check(condition: Condition): Truth {
    return evaluate(condition, (test) => this.fact(test.fact, test.args));
  }

  apply(effect: Effect): void {
    const handler = this.handler(effect);
    this.nested(() => handler.run(this.context(handler.module), effect));
  }

  /** What the effect would do, from this state, changing nothing. */
  preview(effect: Effect): EffectPreview {
    const handler = this.handler(effect);
    const { preview } = handler;
    if (!preview) return effect;
    const result = {
      ...this.nested(() => preview(this.previewContext(handler.module), effect)),
      effect: effect.effect,
    };
    freezeJson(result, `(preview of ${effect.effect})`);
    return result;
  }

  /** The new state: unchanged slices are shared, and everything new is checked as JSON and frozen. */
  commit(): GameState {
    const next: Record<string, unknown> = { ...this.state };
    for (const [module, draft] of this.drafts) {
      freezeJson(draft, `/${module}`);
      next[module] = draft;
    }
    const { kernel } = this.state;
    const streams = { ...kernel.streams };
    for (const [label, rng] of this.streams) streams[label] = rng.toState();
    const nextKernel = { seed: kernel.seed, step: kernel.step + 1, modes: this.modes ?? kernel.modes, streams };
    freezeJson(nextKernel, `/${KERNEL}`);
    next[KERNEL] = nextKernel;
    return Object.freeze(next) as GameState;
  }

  private previewContext(module: string): PreviewContext<unknown> {
    return {
      module,
      content: this.sim.content,
      read: () => this.read(module),
      fact: (id, args) => this.fact(id, args),
      check: (condition) => this.check(condition),
      preview: (effect) => this.preview(effect),
    };
  }

  private handler(effect: Effect): EffectEntry {
    const handler = this.registry.effects.get(effect?.effect);
    if (!handler) throw new Error(`Unknown effect "${String(effect?.effect)}"`);
    return handler;
  }

  private nested<T>(run: () => T): T {
    if (this.depth >= MAX_EFFECT_DEPTH)
      throw new Error(`Effects nested ${MAX_EFFECT_DEPTH} deep: is one applying itself?`);
    this.depth++;
    try {
      return run();
    } finally {
      this.depth--;
    }
  }

  private write(module: string): unknown {
    if (!this.drafts.has(module)) this.drafts.set(module, cloneJson(this.state[module]));
    return this.drafts.get(module);
  }

  private stream(label: string): Rng {
    let rng = this.streams.get(label);
    if (!rng) {
      const saved = this.state.kernel.streams[label];
      rng = saved ? Rng.fromState(saved) : Rng.create(this.state.kernel.seed).fork(label);
      this.streams.set(label, rng);
    }
    return rng;
  }

  private emit(type: string, data: Readonly<Record<string, unknown>> = {}): void {
    const beat = { ...data, type };
    freezeJson(beat, `(beat ${type})`);
    this.beats.push(beat);
  }

  private modeControl(): ModeControl {
    const stack = () => this.modes ?? this.state.kernel.modes;
    const change = (next: readonly ModeFrame[]) => {
      this.modes = next;
      this.beats.push(Object.freeze({ type: 'mode', modes: Object.freeze(next.map((frame) => frame.id)) }));
    };
    const frame = (id: string, data: unknown): ModeFrame => {
      if (!this.registry.modes.has(id)) throw new Error(`Unknown mode "${id}"`);
      return data === undefined ? { id } : { id, data };
    };
    return {
      get stack() {
        return stack();
      },
      get current() {
        return stack()[stack().length - 1] as ModeFrame;
      },
      push: (id, data) => change([...stack(), frame(id, data)]),
      pop: () => {
        const frames = stack();
        if (frames.length === 1) throw new Error(`Cannot pop "${frames[0]?.id}": the mode stack is never empty`);
        change(frames.slice(0, -1));
        return frames[frames.length - 1] as ModeFrame;
      },
      replace: (id, data) => change([...stack().slice(0, -1), frame(id, data)]),
    };
  }
}

const shown = (value: unknown): string => (typeof value === 'string' ? JSON.stringify(value) : String(value));

function kebab(text: string, what: string): string {
  if (!isRecordId(text)) throw new Error(`"${text}" is not a valid ${what}: use kebab-case`);
  return text;
}
