/**
 * A game's screens and theme checked (M4.1, D51, docs/specs/screens.md#checks): their shape (E047),
 * what their templates and shows-when read (E048), what their buttons, lists and shows ask of the
 * game (E049), the theme's contrast (E050) and the modes no screen shows (W133). A game's actions
 * and modes are known only once its scripts have run: without them, take, shows and W133 go
 * unchecked, as W120 does without the time module.
 */
import { checkCondition, type FactCatalog, parseCondition, pointerSegment, type RecordIndex } from '@eb/core';
import {
  AA_BODY,
  CONTRAST_PAIRS,
  contrast,
  REGIONS,
  type Screen,
  SOURCE_FIELDS,
  SOURCE_KITS,
  type Source,
  splitTemplate,
  type Theme,
  VIEW_FIELDS,
  type Widget,
} from '@eb/ui/format';
import { compareDiagnostics, type Diagnostic, type DiagnosticCode, severityOf } from './diagnostics.ts';
import { schemaIssues } from './issues.ts';
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
  /** The records, for facts' arguments that name one. */
  readonly records?: RecordIndex;
  /** The files under assets/, for images. */
  readonly assets?: ReadonlySet<string>;
}

/** Where a widget sits: its file, its path, and the list whose item it is, if any. */
interface Place {
  readonly file: string;
  readonly path: string;
  readonly list: Source | undefined;
}

type Report = (code: DiagnosticCode, file: string, path: string, message: string) => void;

/** Every problem with the screens, by id, and the theme. Sorted, and the same whatever order the screens came in. */
export function checkUi(
  screens: ReadonlyMap<string, UiFile>,
  theme: UiFile | undefined,
  options: UiCheckOptions,
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
  for (const [id, screen] of sound) checkScreen(screen, (screens.get(id) as UiFile).file, screens, options, report);
  if (theme !== undefined && !theme.unreadable) checkTheme(theme, report);
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
  const check = (widget: Widget, at: Place) => checkWidget(widget, at, screens, options, report);
  for (const region of REGIONS) {
    const root = screen[region];
    if (root !== undefined) walk(root, { file, path: `/${region}`, list: undefined }, check);
  }
}

/** Each widget with its place, depth first: a list's item is inside its list. */
function walk(widget: Widget, at: Place, visit: (widget: Widget, at: Place) => void): void {
  visit(widget, at);
  const inside = (path: string, list = at.list): Place => ({ file: at.file, path: `${at.path}${path}`, list });
  switch (widget.widget) {
    case 'stack':
    case 'panel':
    case 'grid':
      for (const [i, child] of widget.children.entries()) walk(child, inside(`/children/${i}`), visit);
      return;
    case 'list':
      walk(widget.item, inside('/item', widget.of), visit);
      return;
    case 'tabs':
      for (const [t, tab] of widget.tabs.entries()) {
        for (const [i, child] of tab.children.entries()) walk(child, inside(`/tabs/${t}/children/${i}`), visit);
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
      return [['/label', widget.label]];
    case 'progress': {
      const bound = (['value', 'max'] as const).filter((key) => typeof widget[key] === 'string');
      return [['/label', widget.label], ...bound.map((key) => [`/${key}`, widget[key] as string] as const)];
    }
    case 'list':
      return widget.empty === undefined ? [] : [['/empty', widget.empty]];
    case 'tabs':
      return widget.tabs.map((tab, t) => [`/tabs/${t}/label`, tab.label] as const);
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
  if (when !== undefined) checkWhen(when, options, (message) => here('E048', '/shows-when', message));
  for (const [path, template] of templateFields(widget)) {
    checkTemplate(template, at.list, options, (code, message) => here(code, path, message));
  }
  if (widget.widget === 'image' && options.assets !== undefined && !options.assets.has(widget.asset)) {
    here('E018', '/asset', `No asset "${widget.asset}" in assets/`);
  }
  if (widget.widget === 'list') {
    const kit = SOURCE_KITS[widget.of];
    if (kit !== undefined && !options.kits.includes(kit)) {
      here('E049', '/of', `A list of ${widget.of} needs the ${kit} kit: turn it on in project.json`);
    }
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
    else if (list === 'journal') report('/action/take', 'A journal’s entries come with no action');
    else if (action.args !== undefined) report('/action/args', 'An entry’s action comes with its arguments');
    return;
  }
  if (options.actions !== undefined && !options.actions.includes(action.take)) {
    report('/action/take', `The game has no action "${action.take}"`);
  }
}

/** A shows-when: a condition in the text form, checked as a record's is. */
function checkWhen(text: string, options: UiCheckOptions, report: (message: string) => void): void {
  const parsed = parseCondition(text, options.facts);
  if (!parsed.ok) {
    report(parsed.message);
    return;
  }
  const check = {
    catalog: options.facts,
    open: options.openFacts,
    ...(options.records ? { records: options.records } : {}),
  };
  for (const issue of checkCondition(parsed.condition, check)) report(issue.message);
}

function checkTemplate(
  template: string,
  list: Source | undefined,
  options: UiCheckOptions,
  report: (code: DiagnosticCode, message: string) => void,
): void {
  const split = splitTemplate(template);
  if (!split.ok) {
    report('E047', split.message);
    return;
  }
  for (const segment of split.segments) {
    if (segment.kind === 'fact') checkBinding(segment.text, options, (message) => report('E048', message));
    if (segment.kind === 'view') {
      const kit = VIEW_FIELDS[segment.name] as string;
      if (!options.kits.includes(kit))
        report('E049', `{${segment.name}} needs the ${kit} kit: turn it on in project.json`);
    }
    if (segment.kind === 'field') {
      if (list === undefined) report('E048', `{.${segment.name}} is an entry’s field: only a list’s item has one`);
      else if (!SOURCE_FIELDS[list].includes(segment.name)) {
        report('E048', `A ${list} entry has no field "${segment.name}": ${SOURCE_FIELDS[list].join(', ')}`);
      }
    }
  }
}

/** A fact in braces: one fact, its arguments named, shown as its value, so it compares with nothing. */
function checkBinding(text: string, options: UiCheckOptions, report: (message: string) => void): void {
  const parsed = parseCondition(text, options.facts);
  if (!parsed.ok) {
    report(`{${text}}: ${parsed.message}`);
    return;
  }
  const test = parsed.condition;
  if (!('fact' in test) || test.op !== undefined) {
    report(`{${text}} shows one fact’s value: a comparison goes in shows-when`);
    return;
  }
  const check = {
    catalog: options.facts,
    open: options.openFacts,
    ...(options.records ? { records: options.records } : {}),
  };
  // E014 here is only "not a yes/no fact", which a value shown needn't be.
  for (const issue of checkCondition(test, check)) if (issue.code !== 'E014') report(`{${text}}: ${issue.message}`);
}

function checkTheme(theme: UiFile, report: Report): void {
  const issues = schemaIssues(themeSchema, theme.value);
  for (const issue of issues) report('E047', theme.file, issue.path, issue.message);
  if (issues.length > 0) return;
  const { colors } = theme.value as Theme;
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

/**
 * W133: a mode the game has that no screen shows, so it plays with the fallback. A screen with
 * problems of its own still counts for the modes it names, so its E047 isn't joined by a W133.
 */
function unshownModes(screens: ReadonlyMap<string, UiFile>, modes: readonly string[], out: Diagnostic[]): void {
  const shows = ({ value }: UiFile) => {
    const named = typeof value === 'object' && value !== null ? (value as { shows?: unknown }).shows : undefined;
    return Array.isArray(named) ? named.filter((mode): mode is string => typeof mode === 'string') : [];
  };
  const shown = new Set([...screens.values()].flatMap(shows));
  for (const mode of modes) {
    if (shown.has(mode)) continue;
    out.push({
      code: 'W133',
      severity: 'warning',
      message: `No screen shows the mode "${mode}": it plays with the fallback, a list of the actions on offer`,
      path: '',
    });
  }
}
