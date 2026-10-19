/**
 * What the script editor (M3.2) and the scene editor (M3.11) share: the file, read on every change
 * and handed straight to CodeMirror rather than through a render, so no keystroke falls between
 * an undo and the editor showing it; CodeMirror kept to the access, the problems and a line asked
 * for; and the problems listed, each a way to its line.
 */
import type { Extension } from '@codemirror/state';
import type { Diagnostic } from '@eb/schema';
import { effect, type Signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { type OpenProject, revision } from '../projects/opened.ts';
import { type CodeEditor, codeEditor } from './codeEditor.ts';
import type { ProjectNames } from './completions.ts';

export type Loaded =
  | { readonly kind: 'missing' }
  | { readonly kind: 'unreadable' }
  | { readonly kind: 'ok'; readonly text: string };

const utf8 = new TextDecoder('utf-8', { fatal: true });

function decode(bytes: Uint8Array | undefined): Loaded {
  if (bytes === undefined) return { kind: 'missing' };
  try {
    return { kind: 'ok', text: utf8.decode(bytes) };
  } catch {
    return { kind: 'unreadable' };
  }
}

export type CodeRef = { current: CodeEditor | null };
export type HostRef = { current: HTMLDivElement | null };

/** The file at `path`, read on every change and pushed into the CodeMirror in `code`. */
export function useTextFile(project: OpenProject, path: string, code: CodeRef): Loaded | null {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    let live = true;
    const stop = effect(() => {
      void revision.value;
      void editing.access.value;
      void project.source.read(path).then((bytes) => {
        if (!live) return;
        const read = decode(bytes);
        if (read.kind === 'ok') code.current?.sync(read.text);
        setLoaded(read);
      });
    });
    return () => {
      live = false;
      stop();
    };
  }, [project.source, path]);
  return loaded;
}

/** Where an editor puts the cursor once it shows a file, by the file's id. */
export type LineToFocus = Signal<{ readonly id: string; readonly line: number; readonly column?: number } | null>;

export interface CodeSetup {
  readonly id: string;
  readonly path: string;
  /** Writes typed text into the file; settles once that edit has been made. */
  readonly type: (text: string) => Promise<void>;
  readonly focus: LineToFocus;
  readonly language?: Extension;
  readonly names?: () => ProjectNames;
}

/** CodeMirror in `host`, into `code`, once the text is first read; kept to the access, the problems and a line asked for. */
export function useCode(
  host: HostRef,
  code: CodeRef,
  loaded: Loaded | null,
  setup: CodeSetup,
  problems: readonly Diagnostic[],
): void {
  const { id, path, focus } = setup;
  const canEdit = editing.access.value.kind === 'editing';
  const ready = loaded?.kind === 'ok';
  useEffect(() => {
    if (code.current || !host.current || loaded?.kind !== 'ok') return;
    code.current = codeEditor(host.current, {
      text: loaded.text,
      readOnly: !canEdit,
      label: path,
      type: setup.type,
      ...(setup.names ? { names: setup.names } : {}),
      ...(setup.language ? { language: setup.language } : {}),
    });
  }, [ready]);
  useEffect(() => () => code.current?.destroy(), []);
  useEffect(() => code.current?.setReadOnly(!canEdit), [canEdit, ready]);
  useEffect(() => code.current?.setProblems(problems), [problems, ready]);
  useEffect(() => {
    const asked = focus.value;
    if (!ready || asked?.id !== id) return;
    focus.value = null;
    code.current?.focusAt(asked.line, asked.column);
  }, [ready, focus.value]);
}

/** A file's problems, each with a way to its line. */
export function CodeProblems({
  problems,
  go,
  label,
}: {
  problems: readonly Diagnostic[];
  go: (line: number, column?: number) => void;
  label: string;
}) {
  if (problems.length === 0) return <p class="muted">No problems.</p>;
  return (
    <ul class="script-problems" aria-label={label}>
      {problems.map((p, i) => (
        // Keyed by place: two problems can share a code and a line.
        <li key={i} class={p.severity === 'error' ? 'logic-problem' : 'logic-warning'}>
          {p.line !== undefined ? (
            <button type="button" class="button" onClick={() => go(p.line as number, p.column)}>
              {`Line ${p.line}`}
            </button>
          ) : null}
          <span>{`${p.code}: ${p.message}`}</span>
        </li>
      ))}
    </ul>
  );
}
