/**
 * The leak check (docs/specs/export.md#the-leak-check; Chooser's tools/leak-check and Dirtbag's
 * demo diff): every file of an edition's build read for what the edition leaves out, with the
 * full build as the control that proves each thing can be found where it is.
 */
import { type LeaveOut, leavesOutRecord } from '@eb/compiler';

export interface LeakToken {
  /** An id as a string by itself, a long text anywhere, or an asset's path anywhere. */
  readonly kind: 'id' | 'text' | 'path';
  readonly value: string;
  /** Where it comes from: "type:id", or "asset:path". */
  readonly from: string;
}

/** What the check reads of the full game's pack. */
export interface PackContent {
  readonly records: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly audio?: Readonly<Record<string, string>>;
  readonly credits?: readonly { readonly asset: string }[];
}

/** Texts shorter than this are too common to tell a leak from a coincidence (Dirtbag's diff uses 25). */
export const MIN_TEXT = 12;

const strings = (value: unknown, into: string[] = []): string[] => {
  if (typeof value === 'string') into.push(value);
  else if (Array.isArray(value)) for (const item of value) strings(item, into);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) strings(item, into);
  return into;
};

// An id as a string of its own: after a quote or "type:", before a quote, which may be escaped.
const idPattern = (id: string) => new RegExp(`(?<=["'\`:])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\\\?["'\`])`);

const jsonBody = (text: string) => JSON.stringify(text).slice(1, -1);
const scriptEscaped = (text: string) =>
  text.replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/** The forms a text can take in a file: as written, inside JSON, and inside the page's boot JSON. */
const formsOf = (text: string): string[] => [...new Set([text, jsonBody(text), scriptEscaped(jsonBody(text))])];

/**
 * What to look for, from the full game's pack. Anything a kept record also holds is in the
 * edition by right, so it isn't looked for: the same id, or a text inside a kept record's text.
 */
export function leakTokens(full: PackContent, out: LeaveOut): LeakToken[] {
  const kept: [string, unknown][] = [];
  const left: [string, string, unknown][] = [];
  for (const [type, records] of Object.entries(full.records)) {
    for (const [id, value] of Object.entries(records)) {
      const key = `${type}:${id}`;
      if (leavesOutRecord(out, key)) left.push([key, id, value]);
      else kept.push([key, value]);
    }
  }
  const keptText = JSON.stringify(kept);
  const tokens = new Map<string, LeakToken>();
  const add = (token: LeakToken) => {
    const id = `${token.kind} ${token.value}`;
    if (!tokens.has(id)) tokens.set(id, token);
  };
  for (const [from, id, value] of left) {
    if (!idPattern(id).test(keptText)) add({ kind: 'id', value: id, from });
    for (const text of strings(value)) {
      if ([...text].length >= MIN_TEXT && !keptText.includes(jsonBody(text))) add({ kind: 'text', value: text, from });
    }
  }
  const packed = new Set([...Object.keys(full.audio ?? {}), ...(full.credits ?? []).map((c) => c.asset)]);
  for (const path of out.assets) {
    if (packed.has(path) && !keptText.includes(jsonBody(path)))
      add({ kind: 'path', value: path, from: `asset:${path}` });
  }
  return [...tokens.values()];
}

export interface Find {
  readonly token: LeakToken;
  readonly file: string;
  /** The text around it, for people. */
  readonly around: string;
}

const decoder = new TextDecoder();

/** Where the token is in the text, by the first of its forms found; -1 if nowhere. */
function findIn(text: string, token: LeakToken): { at: number; length: number } {
  if (token.kind === 'id') {
    const match = idPattern(token.value).exec(text);
    return match ? { at: match.index, length: token.value.length } : { at: -1, length: 0 };
  }
  for (const form of formsOf(token.value)) {
    const at = text.indexOf(form);
    if (at >= 0) return { at, length: form.length };
  }
  return { at: -1, length: 0 };
}

/**
 * Each token's first find in each file, PNGs aside. The engine's own texts (the runtime, the same
 * in every edition, holding no project content) are taken out of each file first.
 */
export function scan(
  files: ReadonlyMap<string, Uint8Array>,
  engine: readonly string[],
  tokens: readonly LeakToken[],
): Find[] {
  const finds: Find[] = [];
  for (const [file, bytes] of files) {
    if (file.endsWith('.png')) continue;
    let text = decoder.decode(bytes);
    for (const part of engine) if (part.length > 0) text = text.split(part).join('');
    for (const token of tokens) {
      const { at, length } = findIn(text, token);
      if (at < 0) continue;
      const around = text.slice(Math.max(0, at - 30), at + length + 30).replace(/\s+/g, ' ');
      finds.push({ token, file, around });
    }
  }
  return finds;
}

export interface LeakReport {
  readonly tokens: readonly LeakToken[];
  /** How many files of the edition's build were read. */
  readonly files: number;
  /** What the edition's build holds that it shouldn't: any fails the export. */
  readonly finds: readonly Find[];
  /** What the full build doesn't hold either, so the check can't vouch for: any fails the export. */
  readonly unseen: readonly LeakToken[];
}

export function checkLeaks(
  edition: ReadonlyMap<string, Uint8Array>,
  full: ReadonlyMap<string, Uint8Array>,
  engine: readonly string[],
  tokens: readonly LeakToken[],
): LeakReport {
  const finds = scan(edition, engine, tokens);
  const seen = new Set(scan(full, engine, tokens).map((f) => f.token));
  return {
    tokens,
    files: [...edition.keys()].filter((f) => !f.endsWith('.png')).length,
    finds,
    unseen: tokens.filter((t) => !seen.has(t)),
  };
}

/** The report in words, as the editor and eb export say it. */
export function leakWords(edition: string, report: LeakReport): string[] {
  const n = report.tokens.length;
  if (n === 0) return [`The ${edition} edition leaves nothing out that its build could hold.`];
  const lines = report.finds.map(
    (f) =>
      `The ${edition} build holds ${f.token.kind === 'text' ? `text of ${f.token.from}` : f.token.value} (${f.token.from}) in ${f.file}: …${f.around}…`,
  );
  for (const token of report.unseen) {
    lines.push(
      `The leak check can’t find ${token.value} (${token.from}) in the full build, so it can’t vouch that the ${edition} build lacks it.`,
    );
  }
  if (lines.length === 0) {
    lines.push(
      `The leak check read ${report.files} ${report.files === 1 ? 'file' : 'files'} of the ${edition} build for ${n} ${n === 1 ? 'thing' : 'things'} it leaves out: none there, and every one found in the full build.`,
    );
  }
  return lines;
}
