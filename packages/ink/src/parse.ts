/**
 * A scene's structure (docs/specs/ink.md#the-subset): EXTERNALs, the tags at its top, knots,
 * choices, gathers, diverts, lines of text and conditional blocks, each with the line it was
 * written on. A line the subset doesn't have is an error at that line, and reading goes on, so
 * one pass finds every problem.
 */
import type { At, CondBranch, External, Item, Knot, Story, Tag } from './ast.ts';
import { InkError, type Problems } from './problems.ts';
import { closing, type SourceLine, sourceLines, topColon } from './source.ts';
import { readChoice, readContent, readDivert, readTags, written } from './text.ts';

const KNOT = /^==+\s*([A-Za-z_][A-Za-z0-9_]*)\s*(=*)\s*$/;
const EXTERNAL = /^EXTERNAL\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*([^)]*)\)\s*$/;
const PARAM = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MARKERS = /^((?:[*+]\s*)+)/;
const GATHER = /^((?:-(?!>)\s*)+)/;
const LABEL = /^\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)\s*/;

const UNREAD: readonly [RegExp, string][] = [
  [/^VAR\b|^CONST\b/, 'ink’s variables aren’t read: keep state in the game, as facts and effects'],
  [/^LIST\b/, 'ink’s lists aren’t read: keep state in the game, as facts and effects'],
  [/^INCLUDE\b/, 'A scene is one file: INCLUDE isn’t read'],
  [/^~/, 'Logic lines aren’t read: change the game with # fx: tags'],
  [/^TODO\s*:/, 'TODO lines aren’t read: write it as a comment'],
  [/^==+\s*function\b/, 'ink’s functions aren’t read: name a fact of the game through an EXTERNAL'],
  [/^=\s*[A-Za-z_]/, 'Stitches aren’t read: make it a knot of its own'],
  [/^<-/, 'Threads aren’t read: divert to a knot instead'],
  [/^\+/, 'Sticky choices (+) aren’t read: write * choices'],
];

const indent = (text: string) => text.length - text.trimStart().length;

export function parseStory(source: string, problems: Problems): Story {
  return new StoryParser(sourceLines(source), problems).story();
}

class StoryParser {
  private pos = 0;
  private readonly lines: readonly SourceLine[];
  private readonly problems: Problems;

  constructor(lines: readonly SourceLine[], problems: Problems) {
    this.lines = lines;
    this.problems = problems;
  }

  story(): Story {
    const externals: External[] = [];
    const globals: Tag[] = [];
    const root: Item[] = [];
    const knots: Knot[] = [];
    let items = root;
    for (; this.pos < this.lines.length; this.pos++) {
      const { number, text } = this.lines[this.pos] as SourceLine;
      const trimmed = text.trim();
      const at: At = { line: number, column: indent(text) + 1 };
      if (trimmed === '') continue;
      const knot = KNOT.exec(trimmed);
      if (knot && !/^==+\s*function\b/.test(trimmed)) {
        items = [];
        knots.push({ name: knot[1] as string, at, items });
      } else if (trimmed.startsWith('EXTERNAL')) {
        const external = this.problems.catching(number, () => readExternal(trimmed, at));
        if (external) externals.push(external);
      } else if (
        items === root &&
        knots.length === 0 &&
        root.every((i) => i.kind === 'tags') &&
        trimmed.startsWith('#')
      ) {
        const tags = this.problems.catching(
          number,
          () => readTags(trimmed.slice(1), number, (at.column as number) + 1),
          0,
        );
        for (const tag of tags ?? [])
          (tag.kind === 'name' || tag.kind === 'show-odds' ? globals : this.loose(root, at)).push(tag);
      } else items.push(...this.lineItems(text, { line: number, column: 1 }, false));
    }
    return { externals, globals, root, knots };
  }

  /** The tags item at the end of `items` written on that line, made if need be, for top tags that aren't the talk's own. */
  private loose(items: Item[], at: At): Tag[] {
    const last = items[items.length - 1];
    if (last?.kind === 'tags' && last.at.line === at.line) return last.tags as Tag[];
    const tags: Tag[] = [];
    items.push({ kind: 'tags', at, tags });
    return tags;
  }

  /** A line's items; a block reads the lines after it as well. Nothing, with the problem reported, when it can't be read. */
  private lineItems(text: string, at: At, inBlock: boolean): Item[] {
    return this.problems.catching(at.line, () => this.readLine(text, at, inBlock)) ?? [];
  }

  private readLine(text: string, at: At, inBlock: boolean): Item[] {
    const trimmed = text.trimStart();
    const start = (at.column ?? 1) + indent(text);
    if (trimmed === '') return [];
    for (const [pattern, message] of UNREAD) if (pattern.test(trimmed)) throw new InkError(message, start);
    if (/^==/.test(trimmed)) throw new InkError('Write a knot as === name ===: lowercase words joined by _', start);
    if (trimmed.startsWith('#')) {
      const tags = readTags(trimmed.slice(1), at.line, start + 1);
      if (tags.some((tag) => tag.kind === 'name' || tag.kind === 'show-odds')) {
        throw new InkError('# name and # show-odds go at the scene’s top, before its first line', start);
      }
      return [{ kind: 'tags', at: { line: at.line, column: start }, tags }];
    }
    const markers = MARKERS.exec(trimmed);
    if (markers) {
      if (inBlock)
        throw new InkError('A choice can’t sit inside a condition: put the condition on the choice, * {…} [ ]', start);
      const depth = (markers[1] as string).replace(/\s/g, '').length;
      const choice = readChoice(trimmed.slice(markers[0].length), at.line, start + markers[0].length);
      return [{ kind: 'choice', at: { line: at.line, column: start }, depth, ...choice }];
    }
    if (trimmed.startsWith('->')) {
      const { target } = readDivert(trimmed.slice(2), at.line, start + 2);
      return [{ kind: 'divert', at: { line: at.line, column: start }, target }];
    }
    const gather = GATHER.exec(trimmed);
    if (gather) {
      if (inBlock) throw new InkError('A gather can’t sit inside a condition', start);
      return this.gather(trimmed, gather[0], { line: at.line, column: start });
    }
    if (trimmed.startsWith('{')) return this.braced(trimmed, { line: at.line, column: start });
    return this.paragraph(trimmed, { line: at.line, column: start });
  }

  private gather(trimmed: string, markers: string, at: At): Item[] {
    const depth = markers.replace(/\s/g, '').length;
    let rest = trimmed.slice(markers.length);
    let column = (at.column ?? 1) + markers.length;
    const label = LABEL.exec(rest);
    if (label) {
      rest = rest.slice(label[0].length);
      column += label[0].length;
    }
    const item: Item = { kind: 'gather', at, depth, ...(label ? { label: label[1] as string } : {}) };
    return [item, ...this.readLine(rest, { line: at.line, column }, false)];
  }

  private paragraph(text: string, at: At): Item[] {
    const content = readContent(text, at.line, at.column ?? 1);
    const items: Item[] = [];
    if (content.segments.length > 0 || (content.divert === undefined && content.tags.length > 0)) {
      const kind = content.segments.some((s) => typeof s !== 'string' || s.trim() !== '') ? 'para' : 'tags';
      items.push(
        kind === 'para'
          ? { kind, at, segments: content.segments, tags: content.tags }
          : { kind, at, tags: content.tags },
      );
    }
    if (content.divert) {
      if (content.tags.length > 0 && items.length === 0)
        throw new InkError('Tags after a divert aren’t read', content.divert.column);
      items.push({
        kind: 'divert',
        at: { line: at.line, column: content.divert.column },
        target: content.divert.target,
      });
    }
    return items;
  }

  /** A line that starts with `{`: a block, a one-line condition, or text that starts with one. */
  private braced(text: string, at: At): Item[] {
    const close = closing(text, 1, '}');
    if (close < 0) return [this.block(text, at)];
    const after = text.slice(close + 1).trim();
    if (after !== '' && !after.startsWith('#')) return this.paragraph(text, at);
    if (after !== '') throw new InkError('Put the tags inside the condition’s line', (at.column ?? 1) + close + 1);
    const inner = text.slice(1, close);
    const colon = topColon(inner);
    if (colon < 0) throw new InkError('Only {condition: this|that} is read: ink’s alternatives aren’t', at.column);
    const column = (at.column ?? 1) + 1;
    const cond = written(inner.slice(0, colon), at.line, column);
    const shown = inner.slice(colon + 1);
    const bar = closing(shown, 0, '|');
    const one = (part: string, offset: number) => this.readLine(part, { line: at.line, column: column + offset }, true);
    const branches: CondBranch[] = [{ at, cond, body: one(bar < 0 ? shown : shown.slice(0, bar), colon + 1) }];
    if (bar >= 0) branches.push({ at, body: one(shown.slice(bar + 1), colon + bar + 2) });
    return [{ kind: 'cond', at, branches }];
  }

  /** A block over several lines, from its `{` to its `}`. */
  private block(header: string, at: At): Item {
    const branches: CondBranch[] = [];
    const rest = header.slice(1).trim();
    const multi = rest === '';
    if (!multi) {
      const colon = topColon(rest);
      if (colon < 0) throw new InkError('Expected {condition: on a block’s first line, or { alone', at.column);
      const column = (at.column ?? 1) + header.indexOf(rest);
      const body = this.lineItems(rest.slice(colon + 1), { line: at.line, column: column + colon + 1 }, true);
      branches.push({ at, cond: written(rest.slice(0, colon), at.line, column), body: [...body] });
    }
    for (this.pos++; this.pos < this.lines.length; this.pos++) {
      const { number, text } = this.lines[this.pos] as SourceLine;
      const trimmed = text.trim();
      const lineAt: At = { line: number, column: indent(text) + 1 };
      if (trimmed === '') continue;
      if (trimmed === '}') return { kind: 'cond', at, branches };
      if (trimmed.startsWith('}')) {
        this.problems.add(lineAt, 'Nothing can follow a block’s } on its line');
        return { kind: 'cond', at, branches };
      }
      if (KNOT.exec(trimmed)) break;
      if (GATHER.test(trimmed)) {
        const branch = this.problems.catching(number, () => this.branch(trimmed, lineAt, multi, branches));
        if (branch) branches.push(branch);
      } else {
        const last = branches[branches.length - 1];
        if (last === undefined) this.problems.add(lineAt, 'A { block starts with - condition: on its next line');
        else (last.body as Item[]).push(...this.lineItems(text, { line: number, column: 1 }, true));
      }
    }
    this.pos--;
    throw new InkError(`The block from line ${at.line} isn’t closed with }`, at.column);
  }

  /** `- condition:` or `- else:` in a block, with what follows its colon. */
  private branch(trimmed: string, at: At, multi: boolean, before: readonly CondBranch[]): CondBranch {
    const rest = trimmed.replace(/^-\s*/, '');
    const column = (at.column ?? 1) + trimmed.length - rest.length;
    const colon = topColon(rest);
    if (colon < 0) throw new InkError('Expected - condition: or - else:', column);
    const head = rest.slice(0, colon).trim();
    if (before.some((b) => b.cond === undefined)) throw new InkError('- else: is a block’s last branch', column);
    const body = this.lineItems(rest.slice(colon + 1), { line: at.line, column: column + colon + 1 }, true);
    if (head === 'else') return { at, body: [...body] };
    if (!multi) throw new InkError('A switch on a value isn’t read: write { and - condition: on each line', column);
    return { at, cond: written(rest.slice(0, colon), at.line, column), body: [...body] };
  }
}

function readExternal(text: string, at: At): External {
  const found = EXTERNAL.exec(text);
  if (found === null) throw new InkError('Write an EXTERNAL as EXTERNAL name(argument, …)', at.column);
  const params = (found[2] as string)
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  for (const param of params)
    if (!PARAM.test(param)) throw new InkError(`"${param}" isn’t an argument’s name`, at.column);
  return { name: found[1] as string, params, at };
}
