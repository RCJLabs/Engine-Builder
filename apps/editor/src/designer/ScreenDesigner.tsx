/**
 * A screen designed as it looks (M4.5, D55, docs/specs/designer.md): the frame, the outline and
 * the selected part's form, over the screen's file as it stands, each change one step of the
 * editor's undo. A file the designer can't read says why, for the JSON tab to fix.
 */
import { THEME_FILE } from '@eb/compiler';
import type { Diagnostic } from '@eb/schema';
import { frameBreakpoint } from '@eb/ui';
import { COLOR_NAMES, type Screen, type Theme } from '@eb/ui/format';
import { useMemo } from 'preact/hooks';
import { editing } from '../editing/current.ts';
import { useFile } from '../forms/useFile.ts';
import type { OpenProject } from '../projects/opened.ts';
import { drawableScreen } from './drawable.ts';
import { Frame } from './Frame.tsx';
import { sizeOf } from './frame.ts';
import { Outline } from './Outline.tsx';
import { OutlineBar } from './OutlineBar.tsx';
import { ScreenForm, TabForm } from './PartForms.tsx';
import { valueAt } from './paths.ts';
import { SAMPLE_LOG } from './samples.ts';
import { device, editFile, selectionOf, turned } from './state.ts';
import { type Row, rowName, rowsOf } from './tree.ts';
import { type Edited, moveTo } from './treeEdits.ts';
import { useDesignView, useImages } from './useDesign.ts';
import { WidgetForm } from './WidgetForm.tsx';

type Loose = Record<string, unknown>;

/** The theme the frame draws in: the project's while its colours are all there, else the engine's. */
function themeOf(value: unknown): Theme | undefined {
  const colors = (value as { colors?: Loose } | null)?.colors;
  return colors && COLOR_NAMES.every((name) => typeof colors[name] === 'string') ? (value as Theme) : undefined;
}

/** Each row's problems: a problem falls to the deepest row whose pointer it is at or under. */
function problemsByRow(rows: readonly Row[], problems: readonly Diagnostic[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const problem of problems) {
    let best = '';
    for (const row of rows) {
      const under = problem.path === row.at || problem.path.startsWith(`${row.at}/`);
      if (under && row.at.length >= best.length) best = row.at;
    }
    counts.set(best, (counts.get(best) ?? 0) + 1);
  }
  return counts;
}

/** Each widget's shows-when and the breakpoints its `at` names, for the outline's marks. */
function marksOf(screen: unknown, rows: readonly Row[]) {
  return new Map(
    rows
      .filter((row) => row.role === 'widget')
      .map((row) => {
        const widget = (valueAt(screen, row.at) ?? {}) as Loose;
        const when = typeof widget['shows-when'] === 'string' ? widget['shows-when'] : undefined;
        const at = typeof widget.at === 'object' && widget.at !== null ? (Object.keys(widget.at) as never[]) : [];
        return [row.at, { ...(when !== undefined ? { when } : {}), at }] as const;
      }),
  );
}

export function ScreenDesigner({ project, path, id }: { project: OpenProject; path: string; id: string }) {
  const loaded = useFile(project, path);
  const theme = useFile(project, THEME_FILE);
  const value = loaded?.kind === 'ok' ? loaded.value : undefined;
  const screen = useMemo(() => drawableScreen(value) ?? ({} as Screen), [value]);
  const { view, standing } = useDesignView(project, screen);
  const images = useImages(project, screen);
  if (!loaded) return <p class="muted">Reading {path}…</p>;
  if (loaded.kind !== 'ok' || drawableScreen(value) === null) {
    const why =
      loaded.kind === 'unreadable'
        ? `it isn’t JSON (${loaded.message})`
        : loaded.kind === 'missing'
          ? 'it isn’t there any more'
          : 'it isn’t a screen';
    return <p class="logic-problem">{`${path} can’t be designed: ${why}. The JSON tab shows it as written.`}</p>;
  }
  return (
    <Designing
      project={project}
      path={path}
      id={id}
      value={value}
      screen={screen}
      theme={themeOf(theme?.kind === 'ok' ? theme.value : undefined)}
      view={view}
      standing={standing}
      images={images}
    />
  );
}

interface Designing {
  readonly project: OpenProject;
  readonly path: string;
  readonly id: string;
  readonly value: unknown;
  readonly screen: Screen;
  readonly theme: Theme | undefined;
  readonly view: ReturnType<typeof useDesignView>['view'];
  readonly standing: ReturnType<typeof useDesignView>['standing'];
  readonly images: (path: string) => string | undefined;
}

function Designing(props: Designing) {
  const { project, path, id, value } = props;
  const selection = selectionOf(path);
  const canEdit = editing.access.value.kind === 'editing';
  const problems = useMemo(
    () => [...project.catalog.problems, ...(project.index?.screens ?? [])].filter((p) => p.file === path),
    [project.catalog, project.index, path],
  );
  const rows = useMemo(() => rowsOf(value), [value]);
  const row = rows.find((r) => r.at === selection.value) ?? (rows[0] as Row);
  const size = sizeOf(device.value, turned.value);
  const breakpoint = frameBreakpoint(size.width, size.height);
  const apply = (label: string, edit: (screen: unknown) => Edited | null) => {
    const done = edit(value);
    if (!done) return;
    editFile(path, `${label} in ${id}`, (now) => edit(now)?.screen ?? now);
    selection.value = done.selected;
  };
  const part = { project, file: path, problems, canEdit, title: id };
  return (
    <div class="designer">
      <Frame
        id={id}
        screen={props.screen}
        theme={props.theme}
        view={props.view}
        log={SAMPLE_LOG}
        standing={props.standing}
        selected={row.at}
        select={(at) => (selection.value = at)}
        assetUrl={props.images}
      />
      <h4 class="designer-heading">Outline</h4>
      <Outline
        rows={rows}
        selected={row.at}
        select={(at) => (selection.value = at)}
        problems={problemsByRow(rows, problems)}
        marks={marksOf(value, rows)}
        view={props.view}
        breakpoint={breakpoint}
        canEdit={canEdit}
        drop={(dragged, to) => apply('Move', (s) => moveTo(s, dragged, to))}
      />
      <OutlineBar screen={value} row={row} canEdit={canEdit} apply={apply} />
      <h4 class="designer-heading">{rowName(row)}</h4>
      {row.role === 'screen' ? (
        <ScreenForm {...part} screen={value as Loose} modes={project.game.catalog?.modes ?? []} />
      ) : row.role === 'tab' ? (
        <TabForm key={row.at} {...part} at={row.at} tab={(valueAt(value, row.at) ?? {}) as Loose} />
      ) : row.role === 'empty' ? (
        <p class="muted">{`Nothing in ${row.slot ?? 'this slot'} yet: choose a widget above and Add it here.`}</p>
      ) : (
        <WidgetForm
          key={row.at}
          {...part}
          at={row.at}
          widget={(valueAt(value, row.at) ?? {}) as Loose}
          breakpoint={breakpoint}
          actions={project.game.catalog?.actions ?? []}
        />
      )}
    </div>
  );
}
