/**
 * @eb/ink: ink scenes compiled into the dialogue kit's talks (M3.11, D49, docs/specs/ink.md). A
 * scene is ink the subset chooser-of-the-dead wrote reads: knots, once-only choices, gathers and
 * their labels, diverts, conditions on the game's facts through EXTERNALs, and tags for who
 * speaks, what a line or a choice does, what a choice costs and needs. Anything else is an error
 * at its line. The talk is checked as any talk is, and the map says which line of the scene each
 * part of it came from.
 */
import type { FactCatalog } from '@eb/core';
import { bindExternals } from './conditions.ts';
import { emitTalk, type SourceMap, type TalkValue } from './emit.ts';
import { lower } from './lower.ts';
import { parseStory } from './parse.ts';
import { type InkProblem, Problems } from './problems.ts';

export { type Bound, inkName } from './conditions.ts';
export type { SourceMap, TalkValue } from './emit.ts';
export type { InkCode, InkProblem } from './problems.ts';
export { TAG_NAMES } from './tags.ts';

export interface SceneOptions {
  /** The game's facts, which EXTERNALs name. */
  readonly facts: FactCatalog;
}

export interface CompiledScene {
  /** The talk, when the scene has no problem; a scene with one makes none, so its checks don't pile on. */
  readonly talk: TalkValue | undefined;
  /** Each JSON Pointer into the talk, and the scene's line it came from. */
  readonly map: SourceMap;
  /** By line, then column. */
  readonly problems: readonly InkProblem[];
}

export function compileScene(source: string, options: SceneOptions): CompiledScene {
  const problems = new Problems();
  const story = parseStory(source, problems);
  const bound = bindExternals(story.externals, options.facts, problems);
  const graph = lower(story, problems);
  const map: SourceMap = {};
  const talk = emitTalk(graph, story.globals, { bound, catalog: options.facts, problems, map });
  const list = [...problems.list].sort((a, b) => a.line - b.line || (a.column ?? 0) - (b.column ?? 0));
  return { talk: list.length === 0 ? talk : undefined, map, problems: list };
}

/** The scene's line a JSON Pointer into its talk came from: the nearest part of it the map has. */
export function lineAt(map: SourceMap, pointer: string): number | undefined {
  for (let path = pointer; ; path = path.slice(0, path.lastIndexOf('/'))) {
    const line = map[path];
    if (line !== undefined) return line;
    if (path === '') return undefined;
  }
}
