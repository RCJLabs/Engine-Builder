/**
 * The talk a scene's lines make (docs/specs/ink.md#how-a-scene-becomes-a-talk), and where each
 * part of it was written: a knot's first line is called by the knot, a gather's by its label, any
 * other by its knot and a number; a choice's option by its label or its line and a number. Text
 * with `{cond: this|that}` inside becomes a line that passes to one variant of it per way its
 * conditions can fall.
 */
import { type Condition, type FactCatalog, printCondition } from '@eb/core';
import type { At, Tag, Written } from './ast.ts';
import { type Bound, toCondition } from './conditions.ts';
import { type Graph, hasInline, type Node, type Option, type Ref } from './graph.ts';
import type { Problems } from './problems.ts';
import { tidy } from './text.ts';

/** Where each part of the talk was written: a JSON Pointer into it, and the scene's line. */
export type SourceMap = Record<string, number>;

export type TalkValue = Record<string, unknown>;

const NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
/** More would make too many variants: 2 to the power of how many. */
const MOST_INLINE = 3;

interface Context {
  readonly bound: ReadonlyMap<string, Bound>;
  readonly catalog: FactCatalog;
  readonly problems: Problems;
  readonly map: SourceMap;
}

export function emitTalk(graph: Graph, globals: readonly Tag[], ctx: Context): TalkValue | undefined {
  const ids = nameNodes(graph.nodes, ctx.problems);
  const id = (ref: Ref | undefined): string | undefined => resolve(ref, graph.nodes, ids, ctx.problems);
  const lines: Record<string, unknown>[] = [];
  for (const node of graph.nodes) lines.push(...lineOf(node, ids.get(node) as string, lines.length, id, ctx));
  const start = id(graph.start);
  if (start === undefined) {
    ctx.problems.add({ line: 1 }, 'Nothing to say: write a line before the first knot, or divert to one');
    return undefined;
  }
  ctx.map['/starts/0'] = 1;
  onceOnLoops(lines);
  const talk: TalkValue = {};
  for (const tag of globals) {
    if (tag.kind === 'name') talk.name = tag.text;
    if (tag.kind === 'show-odds') talk['show-odds'] = true;
  }
  return { ...talk, starts: [{ line: start }], lines };
}

/**
 * An ink choice is once-only within a play. A play comes back to a line only round a loop, so a
 * choice on a line on no loop keeps no `once`, and a scene opened again offers it again, as
 * chooser played each scene afresh; and an option that is always there keeps W122 quiet.
 */
function onceOnLoops(lines: readonly Record<string, unknown>[]): void {
  const leads = new Map<string, string[]>();
  for (const line of lines) {
    const options = (line.options ?? []) as { next?: string }[];
    const branches = (line.branches ?? []) as { line?: string }[];
    const to = [...options.map((o) => o.next), ...branches.map((b) => b.line), line.next as string | undefined];
    leads.set(
      line.id as string,
      to.filter((id): id is string => id !== undefined),
    );
  }
  const comesBack = (from: string) => {
    const seen = new Set<string>();
    const stack = [...(leads.get(from) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (id === from) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(leads.get(id) ?? []));
    }
    return false;
  };
  for (const line of lines) {
    if (line.options === undefined || comesBack(line.id as string)) continue;
    for (const option of line.options as Record<string, unknown>[]) delete option.once;
  }
}

/** A name as an id: lowercase words joined by _ in ink, by - in the engine. */
function idOf(name: string, at: At, problems: Problems): string {
  if (!NAME.test(name)) problems.add(at, `Name "${name}" in lowercase words joined by _, like the_pass`);
  return name.toLowerCase().replace(/_/g, '-');
}

function nameNodes(nodes: readonly Node[], problems: Problems): Map<Node, string> {
  const ids = new Map<Node, string>();
  const taken = new Map<string, At>();
  for (const node of nodes) {
    if (node.name === undefined) continue;
    const own = idOf(node.name.name, node.name.at, problems);
    const id = node.name.label && node.knot !== undefined ? `${idOf(node.knot, node.at, problems)}-${own}` : own;
    const before = taken.get(id);
    if (before) problems.add(node.name.at, `Two lines would both be called ${id}: the other is on line ${before.line}`);
    taken.set(id, node.name.at);
    ids.set(node, id);
  }
  const counts = new Map<string, number>();
  for (const node of nodes) {
    if (ids.has(node)) continue;
    const scope = node.knot === undefined ? 'start' : node.knot.toLowerCase().replace(/_/g, '-');
    let n = counts.get(scope) ?? 0;
    let id: string;
    do {
      n++;
      id = n === 1 ? scope : `${scope}-${n}`;
    } while (taken.has(id));
    counts.set(scope, n);
    taken.set(id, node.at);
    ids.set(node, id);
  }
  return ids;
}

function resolve(ref: Ref | undefined, nodes: readonly Node[], ids: Map<Node, string>, problems: Problems) {
  if (ref === undefined || ref.kind === 'end') return undefined;
  if (ref.kind === 'node') return ids.get(ref.node);
  const [first, second] = ref.target.split('.') as [string, string | undefined];
  const named = (knot: string | undefined, name: string, label: boolean) =>
    nodes.find((node) => node.name?.name === name && node.name.label === label && (!label || node.knot === knot));
  const node =
    second === undefined
      ? (named(ref.knot, first, true) ?? named(undefined, first, false))
      : named(first, second, true);
  if (node === undefined) problems.add(ref.at, `No knot or label called ${ref.target}`);
  return node === undefined ? undefined : ids.get(node);
}

type Ids = (ref: Ref | undefined) => string | undefined;

function lineOf(node: Node, id: string, index: number, ids: Ids, ctx: Context): Record<string, unknown>[] {
  if (hasInline(node)) return variants(node, id, index, ids, ctx);
  const at = `/lines/${index}`;
  ctx.map[at] = node.at.line;
  const line: Record<string, unknown> = { id };
  if (node.speaker) {
    line.speaker = node.speaker.id;
    ctx.map[`${at}/speaker`] = node.speaker.at.line;
  }
  if (node.paras.length > 0) line.text = node.paras.map((p) => tidy(p.segments.join(''))).join('\n');
  effectsOf(line, node.effects, at, ctx);
  if (node.options.length > 0)
    line.options = node.options.map((o, k) => optionOf(o, `${at}/options/${k}`, id, k, ids, ctx));
  branchesOf(line, node, at, ids, ctx);
  const next = ids(node.next);
  if (next !== undefined) line.next = next;
  return [line];
}

function effectsOf(into: Record<string, unknown>, effects: Node['effects'], at: string, ctx: Context): void {
  if (effects.length === 0) return;
  into.effects = effects.map((fx, k) => {
    ctx.map[`${at}/effects/${k}`] = fx.at.line;
    return fx.effect;
  });
}

function branchesOf(line: Record<string, unknown>, node: Node, at: string, ids: Ids, ctx: Context): void {
  if (node.branches.length === 0) return;
  line.branches = node.branches.map((branch, k) => {
    ctx.map[`${at}/branches/${k}`] = branch.cond.at.line;
    const to = ids(branch.to);
    return { if: conditionText(branch.cond, ctx), ...(to === undefined ? {} : { line: to }) };
  });
}

function optionOf(option: Option, at: string, line: string, k: number, ids: Ids, ctx: Context) {
  ctx.map[at] = option.at.line;
  const { label } = option;
  const out: Record<string, unknown> = {
    id: label === undefined ? `${line}-${k + 1}` : idOf(label, option.at, ctx.problems),
    label: option.text,
  };
  if (option.conds.length > 0) out.if = option.conds.map((cond) => conditionText(cond, ctx)).join(' and ');
  if (option.needs) out.needs = conditionText(option.needs, ctx);
  if (option.cost) out.cost = option.cost;
  out.once = true;
  effectsOf(out, option.effects, at, ctx);
  const next = ids(option.to);
  if (next !== undefined) out.next = next;
  return out;
}

/** The engine's text for a written condition, in brackets when it has an or. */
function conditionText(written: Written, ctx: Context): string {
  const condition = ctx.problems.catching(
    written.at.line,
    () => toCondition(written, ctx.bound, ctx.catalog),
    written.offset,
  );
  return condition === undefined ? 'false' : bracketed(condition, ctx.catalog);
}

const bracketed = (condition: Condition, catalog: FactCatalog) => {
  const text = printCondition(condition, catalog);
  return 'any' in condition ? `(${text})` : text;
};

/** A line with `{cond: this|that}` inside: one that passes, holding its effects, and a variant per way its conditions fall. */
function variants(node: Node, id: string, index: number, ids: Ids, ctx: Context): Record<string, unknown>[] {
  const conds = node.paras.flatMap((p) => p.segments.flatMap((s) => (typeof s === 'string' ? [] : [s.cond])));
  if (conds.length > MOST_INLINE) {
    ctx.problems.add(node.at, `At most ${MOST_INLINE} {condition: this|that} to a line: split it with # beat`);
    return [];
  }
  const texts = conds.map((cond) => conditionText(cond, ctx));
  const at = `/lines/${index}`;
  ctx.map[at] = node.at.line;
  const pass: Record<string, unknown> = { id };
  effectsOf(pass, node.effects, at, ctx);
  const ways = 1 << conds.length;
  const variant = (way: number) => `${id}-${way + 1}`;
  pass.branches = Array.from({ length: ways - 1 }, (_, way) => {
    const holds = texts.map((text, k) => (way & (1 << (conds.length - 1 - k)) ? `not ${wrap(text)}` : text));
    ctx.map[`${at}/branches/${way}`] = node.at.line;
    return { if: holds.length === 1 ? holds[0] : holds.map(wrap).join(' and '), line: variant(way) };
  });
  pass.next = variant(ways - 1);
  const next = ids(node.next);
  const shown = Array.from({ length: ways }, (_, way) => {
    ctx.map[`/lines/${index + 1 + way}`] = node.at.line;
    let k = 0;
    const text = node.paras
      .map((p) =>
        tidy(
          p.segments
            .map((s) => (typeof s === 'string' ? s : way & (1 << (conds.length - 1 - k++)) ? s.fails : s.holds))
            .join(''),
        ),
      )
      .join('\n');
    return { id: variant(way), ...(node.speaker ? { speaker: node.speaker.id } : {}), text, ...(next ? { next } : {}) };
  });
  return [pass, ...shown];
}

const wrap = (text: string) => (/ (and|or) /.test(text) && !text.startsWith('(') ? `(${text})` : text);
