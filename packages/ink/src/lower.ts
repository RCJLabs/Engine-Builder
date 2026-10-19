/**
 * A scene's weave made into lines to be (docs/specs/ink.md#how-a-scene-becomes-a-talk). Text runs
 * on in one line while one speaker says it and nothing comes between; a condition branches the
 * line before it, or a line of its own that passes; choices hang on the line before them, or on a
 * line of their own, and a line that shows none of its choices ends the talk, as ink's story ends.
 * Each loose end is tied to whatever comes next; at a knot's end, it is ink's "loose end" error.
 */
import type { At, CondBranch, Item, Story, Tag } from './ast.ts';
import {
  type Branch,
  END,
  type End,
  type Fx,
  type Graph,
  hasInline,
  type Name,
  type Node,
  type Option,
  type Ref,
} from './graph.ts';
import type { Problems } from './problems.ts';
import { type ChoiceBranch, type Part, weave } from './weave.ts';

interface Flow {
  ends: End[];
  open: Node | undefined;
  fx: Fx[];
  speaker: { id: string; at: At } | undefined;
  beat: boolean;
  name: Name | undefined;
  readonly knot: string | undefined;
}

const nodeRef = (node: Node): Ref => ({ kind: 'node', node });
const tie = (ends: readonly End[], ref: Ref) => {
  for (const end of ends) end.set(ref);
};

export function lower(story: Story, problems: Problems): Graph {
  const lowerer = new Lowerer(problems);
  let start: Ref | undefined;
  const top: End = { set: (ref) => (start = ref), at: { line: 1 } };
  tie(lowerer.flow(weave(story.root, problems), [top], undefined, undefined), END);
  for (const knot of story.knots) {
    const name: Name = { name: knot.name, at: knot.at, label: false };
    for (const end of lowerer.flow(weave(knot.items, problems), [], knot.name, name)) {
      problems.add(end.at, 'The flow runs out here: end it with -> END, or divert');
      end.set(END);
    }
  }
  return { nodes: lowerer.nodes, start };
}

class Lowerer {
  readonly nodes: Node[] = [];
  private readonly problems: Problems;

  constructor(problems: Problems) {
    this.problems = problems;
  }

  /** Lowers the parts after `ends`, and returns the loose ends after them. */
  flow(parts: readonly Part[], ends: End[], knot: string | undefined, name: Name | undefined): End[] {
    const flow: Flow = { ends, open: undefined, fx: [], speaker: undefined, beat: false, name, knot };
    for (const part of parts) this.part(flow, part);
    if (flow.fx.length > 0 || flow.name) this.pass(flow, flow.fx[0]?.at ?? flow.name?.at ?? { line: 1 });
    if (flow.speaker) this.problems.add(flow.speaker.at, 'A speaker tag goes on the line it names');
    return flow.ends;
  }

  private part(flow: Flow, part: Part): void {
    if (part.kind === 'para') this.para(flow, part);
    else if (part.kind === 'tags') this.tags(flow, part.tags);
    else if (part.kind === 'divert') this.divert(flow, part.target, part.at);
    else if (part.kind === 'cond') this.cond(flow, part.branches, part.at);
    else if (part.kind === 'choices') this.choices(flow, part.choices);
    else {
      flow.open = undefined;
      flow.beat = false;
      if (part.label === undefined) return;
      if (flow.name) this.pass(flow, flow.name.at);
      flow.name = { name: part.label, at: part.at, label: true };
    }
  }

  private make(flow: Flow, kind: Node['kind'], at: At, extra: Partial<Node> = {}): Node {
    const node: Node = { kind, at, knot: flow.knot, paras: [], effects: [], options: [], branches: [], ...extra };
    if (flow.name) node.name = flow.name;
    flow.name = undefined;
    this.nodes.push(node);
    tie(flow.ends, nodeRef(node));
    flow.ends = [{ set: (ref) => (node.next = ref), at }];
    flow.open = undefined;
    return node;
  }

  /** A line that passes, holding the effects waiting and any name, the flow going on from it. */
  private pass(flow: Flow, at: At): Node {
    const node = this.make(flow, 'pass', at, { effects: flow.fx });
    flow.fx = [];
    return node;
  }

  private para(flow: Flow, item: Extract<Item, { kind: 'para' }>): void {
    this.tags(flow, item.tags);
    const { open } = flow;
    const speaker = flow.speaker;
    const effects = flow.fx;
    flow.speaker = undefined;
    flow.fx = [];
    const para = { segments: item.segments, at: item.at };
    if (open && !flow.beat && !flow.name && open.speaker?.id === speaker?.id && open.options.length === 0) {
      open.paras.push(para);
      open.effects.push(...effects);
    } else {
      flow.open = this.make(flow, 'text', item.at, { paras: [para], effects, ...(speaker ? { speaker } : {}) });
    }
    flow.beat = false;
  }

  private tags(flow: Flow, tags: readonly Tag[]): void {
    for (const tag of tags) {
      if (tag.kind === 'fx') flow.fx.push({ effect: tag.effect, at: tag.at });
      else if (tag.kind === 'beat') flow.beat = true;
      else if (tag.kind === 'speaker') {
        if (flow.speaker) this.problems.add(tag.at, 'One speaker tag to a line');
        flow.speaker = { id: tag.id, at: tag.at };
      } else if (tag.kind === 'name' || tag.kind === 'show-odds') {
        this.problems.add(tag.at, '# name and # show-odds go at the scene’s top, before its first line');
      } else this.problems.add(tag.at, `# ${tag.kind} goes inside a choice’s [ ]`);
    }
  }

  private divert(flow: Flow, target: string, at: At): void {
    const ref: Ref = target === 'END' || target === 'DONE' ? END : { kind: 'divert', target, knot: flow.knot, at };
    if (flow.fx.length > 0 || flow.name) this.pass(flow, at);
    if (flow.speaker) this.problems.add(flow.speaker.at, 'A speaker tag goes on the line it names');
    flow.speaker = undefined;
    tie(flow.ends, ref);
    flow.ends = [];
    flow.open = undefined;
  }

  /** The line a branch point or choices hang on: the open one, when it can take them. */
  private holder(flow: Flow, kind: 'pass' | 'choices', at: At): Node {
    const { open } = flow;
    if (open && !flow.name && open.branches.length === 0 && open.options.length === 0 && !hasInline(open)) {
      open.effects.push(...flow.fx);
      flow.fx = [];
      return open;
    }
    const node = this.make(flow, kind, at, { effects: flow.fx });
    flow.fx = [];
    return node;
  }

  private cond(flow: Flow, branches: readonly CondBranch[], at: At): void {
    if (flow.speaker) this.problems.add(flow.speaker.at, 'A speaker tag goes on the line it names');
    flow.speaker = undefined;
    const holder = this.holder(flow, 'pass', at);
    const ends: End[] = [];
    let otherwise = false;
    for (const branch of branches) {
      if (branch.cond === undefined) otherwise = true;
      const into: End = branch.cond
        ? this.branchEnd(holder, branch.cond, branch.at)
        : { set: (ref) => (holder.next = ref), at: branch.at };
      ends.push(...this.flow(weave(branch.body, this.problems), [into], flow.knot, undefined));
    }
    if (!otherwise) ends.push({ set: (ref) => (holder.next = ref), at });
    flow.ends = ends;
    flow.open = undefined;
    flow.beat = false;
  }

  private branchEnd(holder: Node, cond: NonNullable<CondBranch['cond']>, at: At): End {
    const branch: Branch = { cond };
    holder.branches.push(branch);
    return { set: (ref) => (branch.to = ref), at };
  }

  private choices(flow: Flow, choices: readonly ChoiceBranch[]): void {
    if (flow.speaker) this.problems.add(flow.speaker.at, 'A speaker tag goes on the line it names');
    flow.speaker = undefined;
    const first = choices[0]?.choice.at ?? { line: 1 };
    // When it shows no choice, ink's story ends there: the holder keeps no next, and so ends the talk.
    const holder = this.holder(flow, 'choices', first);
    const ends: End[] = [];
    for (const { choice, body } of choices) {
      const option = this.option(choice);
      holder.options.push(option);
      const rest = this.leadingFx(body, option);
      const into: End = { set: (ref) => (option.to = ref), at: choice.at };
      if (choice.divert === undefined) ends.push(...this.flow(rest, [into], flow.knot, undefined));
      else {
        if (rest.length > 0) this.problems.add(choice.at, 'Nothing after a choice’s divert is reached');
        this.flow([{ kind: 'divert', at: choice.at, target: choice.divert }], [into], flow.knot, undefined);
      }
    }
    flow.ends = ends;
    flow.open = undefined;
    flow.beat = false;
  }

  private option(choice: ChoiceBranch['choice']): Option {
    let needs: Option['needs'];
    let cost: Option['cost'];
    for (const tag of choice.tags) {
      if (tag.kind === 'needs' && needs === undefined) needs = tag.needs;
      else if (tag.kind === 'cost' && cost === undefined) cost = tag.cost;
      else if (tag.kind === 'needs' || tag.kind === 'cost') this.problems.add(tag.at, `One # ${tag.kind} to a choice`);
      else
        this.problems.add(
          tag.at,
          `Inside a choice’s [ ], only # cost and # needs: put # ${tag.kind} on the line after it`,
        );
    }
    return {
      at: choice.at,
      ...(choice.label === undefined ? {} : { label: choice.label }),
      text: choice.text,
      conds: choice.conds,
      ...(needs ? { needs } : {}),
      ...(cost ? { cost } : {}),
      effects: [],
    };
  }

  /** The `# fx:` lines right after a choice are what saying it does; the rest of its body follows. */
  private leadingFx(body: readonly Part[], option: Option): Part[] {
    const rest = [...body];
    while (rest[0]?.kind === 'tags' && rest[0].tags.every((tag) => tag.kind === 'fx')) {
      for (const tag of rest[0].tags) if (tag.kind === 'fx') option.effects.push({ effect: tag.effect, at: tag.at });
      rest.shift();
    }
    return rest;
  }
}
