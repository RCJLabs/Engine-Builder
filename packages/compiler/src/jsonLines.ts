/**
 * Where a JSON Pointer points in a JSON file's text (M4.1): the line and column a screen's problem
 * is shown at, as a scene's are at its lines. A field's place is its key, where the eye looks; a
 * field that isn't there (a missing one) is placed at the object that should hold it.
 */
import { pointerSegment } from '@eb/core';

export interface TextPlace {
  /** From 1. */
  readonly line: number;
  readonly column: number;
}

const SPACE = ' \t\n\r';
const ESCAPES: Readonly<Record<string, string>> = { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };

/** Each value's offset by its pointer; a member's is its key's. Stops quietly at text that isn't JSON. */
function offsets(text: string): Map<string, number> {
  const at = new Map<string, number>();
  let i = 0;
  const space = () => {
    while (i < text.length && SPACE.includes(text[i] as string)) i++;
  };
  const string = (): string => {
    let out = '';
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\\') {
        const kind = text[i + 1] as string;
        if (kind === 'u') {
          out += String.fromCharCode(Number.parseInt(text.slice(i + 2, i + 6), 16));
          i += 6;
        } else {
          out += ESCAPES[kind] ?? kind;
          i += 2;
        }
      } else out += text[i++];
    }
    i++;
    return out;
  };
  const value = (pointer: string, from?: number): void => {
    space();
    at.set(pointer, from ?? i);
    const open = text[i];
    if (open === '"') {
      string();
      return;
    }
    if (open !== '{' && open !== '[') {
      while (i < text.length && !`,]}${SPACE}`.includes(text[i] as string)) i++;
      return;
    }
    const close = open === '{' ? '}' : ']';
    i++;
    space();
    for (let n = 0; i < text.length && text[i] !== close; n++) {
      if (open === '{') {
        const key = i;
        const name = string();
        space();
        i++; // the colon
        value(`${pointer}/${pointerSegment(name)}`, key);
      } else value(`${pointer}/${n}`);
      space();
      if (text[i] === ',') i++;
      space();
    }
    i++;
  };
  try {
    value('');
  } catch {
    // Text that isn't JSON has no places past where it went wrong; E007 says why.
  }
  return at;
}

function placeOf(text: string, offset: number): TextPlace {
  const before = text.slice(0, offset);
  const line = before.split('\n').length;
  return { line, column: offset - before.lastIndexOf('\n') };
}

/** Where `pointer` is in `text`, or, when it isn't there, the nearest value that holds where it would be. */
export function placeOfPointer(text: string, pointer: string): TextPlace | undefined {
  const at = offsets(text);
  let path = pointer;
  for (;;) {
    const offset = at.get(path);
    if (offset !== undefined) return placeOf(text, offset);
    if (path === '') return undefined;
    path = path.slice(0, path.lastIndexOf('/'));
  }
}
