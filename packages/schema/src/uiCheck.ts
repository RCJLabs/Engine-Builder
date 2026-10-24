/**
 * A game's screens and theme checked (M4.1, D51, docs/specs/screens.md#checks): their shape (E047),
 * what their templates and shows-when read (E048), what their buttons, lists and shows ask of the
 * game (E049), the theme's contrast (E050), the modes no screen shows (W133) and screens nothing
 * closes (W134, uiLints.ts); the feedback, feedbackCheck.ts's; and the shell, shellCheck.ts's. A game's actions, modes and
 * events are known only once its scripts have run: without them, take, shows, W133 and the
 * feedback's events go unchecked, as W120 does without the time module.
 */
import { type Condition, type EventCatalog, type FactCatalog, pointerSegment, type RecordIndex } from '@eb/core';
import {
  AA_BODY,
  AMBIENCE,
  CONTRAST_PAIRS,
  contrast,
  MUSIC,
  NO_ACTION,
  REGIONS,
  type Screen,
  SOUND,
  type Source,
  type Theme,
  WIDGET_KITS,
  type Widget,
} from '@eb/ui/format';
import { compareDiagnostics, type Diagnostic, type DiagnosticCode, severityOf } from './diagnostics.ts';
import { checkFeedback } from './feedbackCheck.ts';
import { schemaIssues } from './issues.ts';
import { checkList } from './listCheck.ts';
import { missingRecord } from './missingRecord.ts';
import { checkShell } from './shellCheck.ts';
import { checkTemplate, checkWhen, type Scope } from './templateCheck.ts';
import { unclosable, unshownModes } from './uiLints.ts';
import { screenSchema, themeSchema } from './uiSchema.ts';

/** A file under ui/, read as JSON. */
export interface UiFile {
  readonly file: string;
  readonly value: unknown;
  /** It didn't read (E007): still a screen, so a button that opens it doesn't fail as well. */
  readonly unreadable?: boolean;
}

export interface UiCheckOptions {
  /** The facts templates and shows-when may read: knownFrom's, the game's or the engine's and the kits'. */
  readonly facts: FactCatalog;
  /** No game's facts were given, so one not listed is taken as written. */
  readonly openFacts: boolean;
  readonly kits: readonly string[];
  /** The game's actions, as "module/verb". */
  readonly actions?: readonly string[];
  /** The game's modes, its kits' among them. */
  readonly modes?: readonly string[];
  /** The events the game declares, which feedback lines are on (M4.2). */
  readonly events?: EventCatalog;
  /** The records, for facts' arguments that name one. */
  readonly records?: RecordIndex;
  /** The files under assets/, for images. */
  readonly assets?: ReadonlySet<string>;
  /**
   * Each record type's own fields by type, which a codex's item may show as `{.field}` (M4.4): the
   * types there are. Null for a type whose fields can't be read, whose any field is taken as written.
   * Without it, a codex's type and fields go unchecked.
   */
  readonly recordFields?: Readonly<Record<string, readonly string[] | null>>;
  /** Each shows-when and binding that parses, as a condition (M5.8): what the screens read, for the flags' lint. */
  readonly read?: (condition: Condition) => void;
}

/** Where a widget sits: its file, its path, and the list whose item it is, a codex's or its `unknown` (M4.4). */
interface Place extends Scope {
  readonly file: string;
  readonly path: string;
}

type Report = (code: DiagnosticCode, file: string, path: string, message: string) => void;

/**
 * Every problem with the screens, by id, the theme, the feedback and the shell (M4.3). Sorted, and
 * the same whatever order the screens came in.
 */
export function checkUi(
  screens: ReadonlyMap<string, UiFile>,
  theme: UiFile | undefined,
  options: UiCheckOptions,
  feedback?: UiFile,
  shell?: UiFile,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const report: Report = (code, file, path, message) =>
    diagnostics.push({ code, severity: severityOf(code), message, file, path });
  const sound = new Map<string, Screen>();
  for (const [id, { file, value, unreadable }] of screens) {
    if (unreadable) continue;
    const issues = schemaIssues(screenSchema, value);
    for (const issue of issues) report('E047', file, issue.path, issue.message);
    if (issues.length === 0) sound.set(id, value as Screen);
  }
  for (const [id, screen] of sound) {
    const { file } = screens.get(id) as UiFile;
    checkScreen(screen, file, screens, options, report);
    unclosable(screen, file, diagnostics);
  }
  if (theme !== undefined && !theme.unreadable) checkTheme(theme, options.records, report);
  if (feedback !== undefined && !feedback.unreadable) {
    diagnostics.push(...checkFeedback(feedback.file, feedback.value, options.events, options.records));
  }
  if (shell !== undefined && !shell.unreadable) diagnostics.push(...checkShell(shell.file, shell.value, options));
  if (options.modes !== undefined && screens.size > 0) unshownModes(screens, options.modes, diagnostics);
  return diagnostics.sort(compareDiagnostics);
}

function checkScreen(
  screen: Screen,
  file: string,
  screens: ReadonlyMap<string, UiFile>,
  options: UiCheckOptions,
  report: Report,
): void {
  for (const [i, mode] of (screen.shows ?? []).entries()) {
    if (options.modes !== undefined && !options.modes.includes(mode)) {
      report('E049', file, `/shows/${i}`, `The game has no mode "${mode}"`);
    }
  }
  for (const type of [AMBIENCE, MUSIC] as const) {
    const problem = missingRecord(options.records, type, screen[type]);
    if (problem) report('E049', file, `/${type}`, problem);
  }
  const check = (widget: Widget, at: Place) => checkWidget(widget, at, screens, options, report);
  const typed = (type: string | undefined) =>
    type !== undefined && (options.recordFields === undefined || Object.hasOwn(options.recordFields, type));
  for (const region of REGIONS) {
    const root = screen[region];
    if (root !== undefined) walk(root, { file, path: `/${region}` }, check, typed);
  }
}

/** Each widget with its place, depth first: a list's item is inside its list, a codex's `unknown` held apart. */
function walk(
  widget: Widget,
  at: Place,
  visit: (widget: Widget, at: Place) => void,
  typed: (type: string | undefined) => boolean,
): void {
  visit(widget, at);
  const inside = (path: string, scope: Scope = at): Place => ({ ...scope, file: at.file, path: `${at.path}${path}` });
  switch (widget.widget) {
    case 'stack':
    case 'panel':
    case 'grid':
      for (const [i, child] of widget.children.entries()) walk(child, inside(`/children/${i}`), visit, typed);
      return;
    case 'list': {
      const records = widget.of === 'records';
      const codex = records ? (typed(widget.type) ? { codex: widget.type } : { untyped: true }) : {};
      walk(widget.item, inside('/item', { list: widget.of, ...codex }), visit, typed);
      if (widget.unknown !== undefined) walk(widget.unknown, inside('/unknown', { held: true }), visit, typed);
      return;
    }
    case 'tabs':
      for (const [t, tab] of widget.tabs.entries()) {
        for (const [i, child] of tab.children.entries()) {
          walk(child, inside(`/tabs/${t}/children/${i}`), visit, typed);
        }
      }
      return;
    default:
      return;
  }
}

/** A widget's templates, each at the field that holds it. */
function templateFields(widget: Widget): readonly (readonly [string, string])[] {
  switch (widget.widget) {
    case 'text':
      return [['/text', widget.text]];
    case 'button':
      return widget.detail === undefined
        ? [['/label', widget.label]]
        : [
            ['/label', widget.label],
            ['/detail', widget.detail],
          ];
    case 'progress': {
      const bound = (['value', 'max'] as const).filter((key) => typeof widget[key] === 'string');
      return [['/label', widget.label], ...bound.map((key) => [`/${key}`, widget[key] as string] as const)];
    }
    case 'list':
      return widget.empty === undefined ? [] : [['/empty', widget.empty]];
    case 'tabs':
      return widget.tabs.map((tab, t) => [`/tabs/${t}/label`, tab.label] as const);
    case 'log':
    case 'map': {
      const fields = (['label', 'empty'] as const).filter((key) => widget[key] !== undefined);
      return fields.map((key) => [`/${key}`, widget[key] as string] as const);
    }
    default:
      return [];
  }
}

function checkWidget(
  widget: Widget,
  at: Place,
  screens: ReadonlyMap<string, UiFile>,
  options: UiCheckOptions,
  report: Report,
): void {
  const here = (code: DiagnosticCode, path: string, message: string) =>
    report(code, at.file, `${at.path}${path}`, message);
  const when = widget['shows-when'];
  if (when !== undefined) checkWhen(when, options, (message) => here('E048', '/shows-when', message), at);
  for (const [path, template] of templateFields(widget)) {
    checkTemplate(template, at, options, (code, message) => here(code, path, message));
  }
  if (widget.widget === 'image' && options.assets !== undefined && !options.assets.has(widget.asset)) {
    here('E018', '/asset', `No asset "${widget.asset}" in assets/`);
  }
  if (widget.widget === 'list') checkList(widget, options, here);
  const needs = WIDGET_KITS[widget.widget];
  if (needs !== undefined && !options.kits.includes(needs)) {
    here('E049', '/widget', `A ${widget.widget} widget needs the ${needs} kit: turn it on in project.json`);
  }
  if (widget.widget === 'button') checkAction(widget.action, at.list, screens, options, (p, m) => here('E049', p, m));
}

function checkAction(
  action: Extract<Widget, { widget: 'button' }>['action'],
  list: Source | undefined,
  screens: ReadonlyMap<string, UiFile>,
  options: UiCheckOptions,
  report: (path: string, message: string) => void,
): void {
  if ('open' in action) {
    if (!screens.has(action.open)) report('/action/open', `No screen "${action.open}" in ui/`);
    return;
  }
  if (!('take' in action)) return;
  if (action.take === 'entry') {
    if (list === undefined) report('/action/take', 'Only a list’s item takes its entry’s action');
    else if (NO_ACTION.includes(list)) report('/action/take', `A ${WHOSE[list] ?? list} entries come with no action`);
    else if (action.args !== undefined) report('/action/args', 'An entry’s action comes with its arguments');
    return;
  }
  if (options.actions !== undefined && !options.actions.includes(action.take)) {
    report('/action/take', `The game has no action "${action.take}"`);
  }
}

const WHOSE: Readonly<Partial<Record<Source, string>>> = {
  journal: 'journal’s',
  records: 'codex’s',
  credits: 'credits list’s',
};

function checkTheme(theme: UiFile, records: RecordIndex | undefined, report: Report): void {
  const issues = schemaIssues(themeSchema, theme.value);
  for (const issue of issues) report('E047', theme.file, issue.path, issue.message);
  if (issues.length > 0) return;
  const { colors, sounds = {} } = theme.value as Theme;
  for (const [kind, id] of Object.entries(sounds)) {
    const problem = missingRecord(records, SOUND, id);
    if (problem) report('E049', theme.file, `/sounds/${kind}`, problem);
  }
  for (const [fore, back] of CONTRAST_PAIRS) {
    const ratio = contrast(colors[fore], colors[back]);
    if (ratio < AA_BODY) {
      report(
        'E050',
        theme.file,
        `/colors/${pointerSegment(fore)}`,
        `${fore} on ${back} is ${(Math.floor(ratio * 100) / 100).toFixed(2)}:1; body text needs ${AA_BODY}:1`,
      );
    }
  }
}
