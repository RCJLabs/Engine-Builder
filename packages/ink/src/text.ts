/**
 * One line's content (docs/specs/ink.md#lines): its text, with `{cond: this|that}` inside it, then
 * a divert, then its tags; and a choice's `* (label) {cond} [what the player says # tags] -> divert`.
 * Columns are the source line's, counted from 1: `column` is where `text` starts in it.
 */
import type { At, Segment, Tag, Written } from './ast.ts';
import { parseExpr } from './expr.ts';
import { InkError, shifted } from './problems.ts';
import { closing, topColon } from './source.ts';
import { parseTag } from './tags.ts';

export interface Content {
  readonly segments: Segment[];
  readonly divert?: { readonly target: string; readonly column: number };
  readonly tags: Tag[];
}

export interface ChoiceLine {
  readonly label?: string;
  readonly conds: Written[];
  readonly text: string;
  readonly tags: Tag[];
  readonly divert?: string;
}

const TARGET = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?/;
const LABEL = /^\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/;

/** A condition written at `column` of `line`. */
export function written(text: string, line: number, column: number): Written {
  const lead = text.length - text.trimStart().length;
  return { expr: shifted(() => parseExpr(text), column - 1), at: { line, column: column + lead }, offset: column - 1 };
}

/** Each `#` tag in `text`, which starts at `column`. */
export function readTags(text: string, line: number, column: number): Tag[] {
  const tags: Tag[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (text[i] === '\\') i++;
    else if (i === text.length || text[i] === '#') {
      const piece = text.slice(start, i);
      if (piece.trim() !== '') {
        const at: At = { line, column: column + start };
        tags.push(shifted(() => parseTag(piece, at), column + start - 1));
      }
      start = i + 1;
    }
  }
  return tags;
}

/** `-> target`, from just after the arrow: nothing but tags may follow it. */
export function readDivert(text: string, line: number, column: number): { target: string; tags: Tag[] } {
  if (text.startsWith('->'))
    throw new InkError('Tunnels aren’t read: divert to a knot or a gather’s label', column - 2);
  const lead = text.length - text.trimStart().length;
  const target = TARGET.exec(text.trimStart())?.[0];
  if (target === undefined) throw new InkError('Expected a knot or a label to divert to, or END', column + lead);
  const after = text.slice(lead + target.length);
  const rest = after.trimStart();
  const restColumn = column + lead + target.length + (after.length - rest.length);
  if (rest.startsWith('->'))
    throw new InkError('Tunnels aren’t read: divert to a knot or a gather’s label', restColumn);
  if (rest.startsWith('(')) throw new InkError('A divert takes no arguments: knots have no parameters', restColumn);
  if (rest !== '' && !rest.startsWith('#'))
    throw new InkError('Nothing but tags can follow a divert on its line', restColumn);
  return { target, tags: rest === '' ? [] : readTags(rest.slice(1), line, restColumn + 1) };
}

/** `{cond: this|that}`'s inside, which starts at `column`. */
function inlineCond(inner: string, line: number, column: number): Segment {
  const colon = topColon(inner);
  if (colon < 0) {
    throw new InkError(
      'Only {condition: this|that} is read inside a line: ink’s alternatives and printed variables aren’t',
      column - 1,
    );
  }
  const shown = inner.slice(colon + 1);
  if (shown.includes('->')) {
    throw new InkError(
      'A divert inside a line’s text isn’t read: put the condition on a line of its own',
      column + colon + 1,
    );
  }
  const parts = shown.split('|');
  if (parts.length > 2) throw new InkError('Only {condition: this|that} is read: one | at most', column + colon + 1);
  return {
    cond: written(inner.slice(0, colon), line, column),
    holds: (parts[0] ?? '').trim(),
    fails: (parts[1] ?? '').trim(),
  };
}

/** A line of text: its segments, then a divert or tags. */
export function readContent(text: string, line: number, column: number): Content {
  const segments: Segment[] = [];
  let buffer = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string;
    const at = column + i;
    if (char === '\\' && i + 1 < text.length) {
      buffer += text[++i];
    } else if (char === '{') {
      const close = closing(text, i + 1, '}');
      const nested = text.indexOf('{', i + 1);
      if (close < 0) throw new InkError('This { isn’t closed on its line', at);
      if (nested >= 0 && nested < close) throw new InkError('A { inside { … } isn’t read', column + nested);
      if (buffer !== '') segments.push(buffer);
      buffer = '';
      segments.push(inlineCond(text.slice(i + 1, close), line, at + 1));
      i = close;
    } else if (char === '}') {
      throw new InkError('This } closes nothing', at);
    } else if (char === '#') {
      if (buffer !== '') segments.push(buffer);
      return { segments, tags: readTags(text.slice(i + 1), line, at + 1) };
    } else if (text.startsWith('->', i)) {
      if (buffer !== '') segments.push(buffer);
      const { target, tags } = readDivert(text.slice(i + 2), line, at + 2);
      return { segments, divert: { target, column: at }, tags };
    } else if (text.startsWith('<>', i)) {
      throw new InkError('Glue isn’t read: write the line whole', at);
    } else if (text.startsWith('<-', i)) {
      throw new InkError('Threads aren’t read: divert to a knot instead', at);
    } else buffer += char;
  }
  if (buffer !== '') segments.push(buffer);
  return { segments, tags: [] };
}

/** A choice, from just after its `*`s. */
export function readChoice(text: string, line: number, column: number): ChoiceLine {
  let rest = text.trimStart();
  let at = column + (text.length - rest.length);
  const skip = (n: number) => {
    const next = rest.slice(n).trimStart();
    at += rest.length - next.length;
    rest = next;
  };
  const label = LABEL.exec(rest);
  if (label) skip(label[0].length);
  const conds: Written[] = [];
  while (rest.startsWith('{')) {
    const close = closing(rest, 1, '}');
    if (close < 0) throw new InkError('This { isn’t closed on its line', at);
    conds.push(written(rest.slice(1, close), line, at + 1));
    skip(close + 1);
  }
  const open = 'Write a choice as * [what the player says], and what follows on the lines after it';
  if (!rest.startsWith('[')) throw new InkError(open, at);
  const close = closing(rest, 1, ']');
  if (close < 0) throw new InkError('This [ isn’t closed on its line', at);
  const inside = rest.slice(1, close);
  const hash = inside.search(/(?<!\\)#/);
  const said = (hash < 0 ? inside : inside.slice(0, hash)).replace(/\\(.)/g, '$1');
  if (/[{}]/.test(said)) throw new InkError('A choice’s words are plain text: put its condition before the [', at + 1);
  const tags = hash < 0 ? [] : readTags(inside.slice(hash + 1), line, at + 2 + hash);
  const choice: ChoiceLine = { ...(label ? { label: label[1] as string } : {}), conds, text: tidy(said), tags };
  skip(close + 1);
  if (rest === '') return choice;
  if (rest.startsWith('#'))
    throw new InkError('Put a choice’s effects on the line after it, or its cost and needs inside its [ ]', at);
  if (!rest.startsWith('->')) throw new InkError(open, at);
  const divert = readDivert(rest.slice(2), line, at + 2);
  if (divert.tags.length > 0) throw new InkError('Put a choice’s effects on the line after it', at);
  return { ...choice, divert: divert.target };
}

/** Text as shown: runs of white space made one space, none at either end. */
export const tidy = (text: string): string => text.replace(/\s+/g, ' ').trim();
