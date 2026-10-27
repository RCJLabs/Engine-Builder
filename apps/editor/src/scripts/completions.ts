/**
 * What the script editor offers as you type (D38: lists, not TypeScript's language service): the
 * engine's API from @eb/script's lists, defineModule's parts inside its braces, and in a string
 * the project's own names: the game's facts, events and effects, its record types and records.
 */
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { type ApiEntry, CTX_API, EB_API, FRAME_API, MODULE_API, RNG_API, STAGE_API, STAGE_DEF_API } from '@eb/script';

/** The project's names a script may write in a string, as the editor knows them now. */
export interface ProjectNames {
  readonly facts: readonly string[];
  readonly events: readonly string[];
  readonly effects: readonly string[];
  /** Record ids by type. */
  readonly records: ReadonlyMap<string, readonly string[]>;
}

const option = (entry: ApiEntry): Completion => ({
  label: entry.name,
  type: entry.kind === 'function' ? 'function' : 'variable',
  detail: entry.detail,
  info: entry.info,
});

const WORD = /^[\w$]*$/;

/** Each name once, with what it is: "fact", "event", "effect", a record's type. */
function namesIn(names: ProjectNames): Completion[] {
  const found: Completion[] = [
    ...names.facts.map((label) => ({ label, type: 'constant', detail: 'fact' })),
    ...names.events.map((label) => ({ label, type: 'constant', detail: 'event' })),
    ...names.effects.map((label) => ({ label, type: 'constant', detail: 'effect' })),
  ];
  for (const [type, ids] of names.records) {
    found.push({ label: type, type: 'type', detail: 'record type' });
    for (const id of ids) found.push({ label: id, type: 'constant', detail: type });
  }
  return found;
}

/** Whether `from` starts a property's name in the object `define` (defineModule, defineStage) is given. */
function inDefinition(context: CompletionContext, from: number, define = 'defineModule'): boolean {
  const before = context.state.sliceDoc(0, from);
  if (!/[{,]\s*$/.test(before)) return false;
  // The braces open at the last `{` not yet closed, which must follow defineModule( or defineModule<…>(.
  let depth = 0;
  for (let i = before.length - 1; i >= 0; i--) {
    const c = before[i];
    if (c === '}') depth++;
    else if (c === '{' && depth > 0) depth--;
    else if (c === '{') return new RegExp(`\\b${define}\\s*(<[^()]*>)?\\s*\\(\\s*$`).test(before.slice(0, i));
  }
  return false;
}

export function scriptCompletions(names: () => ProjectNames) {
  return (context: CompletionContext): CompletionResult | null => {
    const member = context.matchBefore(/\bctx\.\w*$/);
    if (member) return { from: member.from + 'ctx.'.length, options: CTX_API.map(option), validFor: WORD };
    const stream = context.matchBefore(/\.rng\([^()]*\)\.\w*$/);
    if (stream) {
      const from = stream.from + stream.text.lastIndexOf('.') + 1;
      return { from, options: RNG_API.map(option), validFor: WORD };
    }
    const quoted = context.matchBefore(/['"`][\w./:-]*$/);
    if (quoted) return { from: quoted.from + 1, options: namesIn(names()), validFor: /^[\w./:-]*$/ };
    const word = context.matchBefore(/[\w$]+$/);
    if (!word && !context.explicit) return null;
    const from = word?.from ?? context.pos;
    // After a dot it is something else's member, which the lists don't know.
    if (context.state.sliceDoc(from - 1, from) === '.') return null;
    if (inDefinition(context, from)) return { from, options: MODULE_API.map(option), validFor: WORD };
    return { from, options: EB_API.map(option), validFor: WORD };
  };
}

/**
 * What the editor offers in a stage file (M7.4, D86): `"eb/stage"`'s names, the parts of
 * defineStage's braces, and a frame's fields after `f.`, the name the new stage's template gives it.
 */
export function stageCompletions() {
  return (context: CompletionContext): CompletionResult | null => {
    const member = context.matchBefore(/\bf\.\w*$/);
    if (member) return { from: member.from + 'f.'.length, options: FRAME_API.map(option), validFor: WORD };
    const word = context.matchBefore(/[\w$]+$/);
    if (!word && !context.explicit) return null;
    const from = word?.from ?? context.pos;
    if (context.state.sliceDoc(from - 1, from) === '.') return null;
    if (inDefinition(context, from, 'defineStage')) return { from, options: STAGE_DEF_API.map(option), validFor: WORD };
    return { from, options: STAGE_API.map(option), validFor: WORD };
  };
}
