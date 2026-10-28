/**
 * The script editor's CodeMirror 6 (M3.2, D38): TypeScript's colours, the engine's API and the
 * project's names offered as you type (completions.ts), the script's problems in the gutter, and
 * no history of its own: typing becomes the editor's steps, which its undo takes back (D30). Tab
 * indents; Escape then Tab moves on, as CodeMirror has it. The scene editor (M3.11) uses it with
 * ink's colours in place of TypeScript's.
 */
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { javascript, localCompletionSource } from '@codemirror/lang-javascript';
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { type Diagnostic as CodeProblem, lintGutter, setDiagnostics } from '@codemirror/lint';
import { Annotation, Compartment, EditorState, type Extension, type Text } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import type { Diagnostic } from '@eb/schema';
import { tags } from '@lezer/highlight';
import { type ProjectNames, scriptCompletions, stageCompletions } from './completions.ts';
import { typedAhead } from './typedAhead.ts';

/** Marks a change that comes from the file, which isn't typing to send back. */
const fromFile = Annotation.define<boolean>();

// Colours from the app's tokens (scripts.css), so they follow its light and dark themes.
const colours = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.moduleKeyword, tags.operatorKeyword], color: 'var(--code-keyword)' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: 'var(--code-string)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--code-number)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: [tags.typeName, tags.className], color: 'var(--code-type)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--code-name)' },
  { tag: tags.propertyName, color: 'var(--code-property)' },
  { tag: [tags.heading, tags.labelName], color: 'var(--code-keyword)', fontWeight: 'bold' },
  { tag: tags.meta, color: 'var(--code-type)' },
]);

/** Where `line` and `column` (1-based) fall in `doc`, kept inside it. */
function at(doc: Text, line: number, column?: number): { from: number; to: number } {
  const found = doc.line(Math.min(Math.max(line, 1), doc.lines));
  if (column === undefined) return { from: found.from, to: found.to };
  return { from: Math.min(found.from + Math.max(column - 1, 0), found.to), to: found.to };
}

/** The change that turns `before` into `after`: what lies between their common start and end. */
export function changeBetween(before: string, after: string): { from: number; to: number; insert: string } {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  )
    end++;
  return { from: start, to: before.length - end, insert: after.slice(start, after.length - end) };
}

export interface CodeEditor {
  /** The file as it is now: shown, unless the editor holds typing that hasn't reached it yet. */
  sync(text: string): void;
  setReadOnly(readOnly: boolean): void;
  setProblems(problems: readonly Diagnostic[]): void;
  focusAt(line: number, column?: number): void;
  destroy(): void;
}

export interface CodeOptions {
  readonly text: string;
  readonly readOnly: boolean;
  /** Names the editor for assistive tech: the script's path. */
  readonly label: string;
  /** Writes typed text into the file; settles once that edit has been made. */
  readonly type: (text: string) => Promise<void>;
  /** The project's names, as completion offers them in a string: a script's. */
  readonly names?: () => ProjectNames;
  /** The language and what it offers as you type; TypeScript with the engine's API when left out. */
  readonly language?: Extension;
}

const NO_NAMES = (): ProjectNames => ({ facts: [], events: [], effects: [], records: new Map() });

/** TypeScript, with the engine's API and the project's names offered as you type. */
const scriptLanguage = (names: () => ProjectNames): Extension => [
  javascript({ typescript: true }),
  autocompletion({ override: [scriptCompletions(names), localCompletionSource] }),
];

/** TypeScript, with `"eb/stage"`'s names offered as you type (M7.4). */
export const stageLanguage = (): Extension => [
  javascript({ typescript: true }),
  autocompletion({ override: [stageCompletions(), localCompletionSource] }),
];

export function codeEditor(parent: HTMLElement, options: CodeOptions): CodeEditor {
  const typing = typedAhead();
  const readOnly = new Compartment();
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: options.text,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        options.language ?? scriptLanguage(options.names ?? NO_NAMES),
        syntaxHighlighting(colours),
        lintGutter(),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...completionKeymap, indentWithTab]),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': options.label }),
        readOnly.of(EditorState.readOnly.of(options.readOnly)),
      ],
    }),
    dispatchTransactions(transactions, editor) {
      editor.update(transactions);
      if (!transactions.some((t) => t.docChanged && !t.annotation(fromFile))) return;
      const text = editor.state.doc.toString();
      // Counted as in flight before the edit is asked for, so its arrival is known for ours.
      const landed = typing.send(text);
      void options.type(text).finally(landed);
    },
  });
  return {
    sync(text) {
      if (typing.read(text) !== 'show') return;
      const doc = view.state.doc.toString();
      if (doc === text) return;
      // Undo, redo, or another tab's save: the file wins, the cursor kept where it maps.
      view.dispatch({ changes: changeBetween(doc, text), annotations: fromFile.of(true) });
    },
    setReadOnly(value) {
      view.dispatch({ effects: readOnly.reconfigure(EditorState.readOnly.of(value)) });
    },
    setProblems(problems) {
      const doc = view.state.doc;
      const marks: CodeProblem[] = problems.map((p) => ({
        ...(p.line === undefined ? { from: 0, to: 0 } : at(doc, p.line, p.column)),
        severity: p.severity === 'error' ? 'error' : 'warning',
        message: `${p.code}: ${p.message}`,
      }));
      view.dispatch(setDiagnostics(view.state, marks));
    },
    focusAt(line, column) {
      const { from } = at(view.state.doc, line, column);
      view.dispatch({ selection: { anchor: from }, scrollIntoView: true });
      view.focus();
    },
    destroy: () => view.destroy(),
  };
}
