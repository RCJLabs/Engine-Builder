/**
 * Breakpoints, layout and the theme as CSS (docs/specs/screens.md#layout): a widget's own layout
 * with its `at` for the breakpoint laid over it, as inline styles, and the theme as variables.
 * The breakpoint is the game's box, not the window's, so the editor's Play panel lays a game out
 * as a phone would when it is a phone's width.
 */
import type { Breakpoint, Layout, Widget } from '../format/screen.ts';
import { DEFAULT_THEME, type Theme } from '../format/theme.ts';

/** Lower than 500 px is landscape; then narrower than 600 px a phone, up to 1,024 px a tablet. */
export function breakpointOf(width: number, height: number): Breakpoint {
  if (height < 500 && width > height) return 'landscape';
  if (width < 600) return 'phone';
  if (width <= 1024) return 'tablet';
  return 'desktop';
}

const JUSTIFY: Readonly<Record<NonNullable<Layout['justify']>, string>> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
};
const ALIGN: Readonly<Record<NonNullable<Layout['align']>, string>> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

/** A widget's layout at a breakpoint: its own fields, then its `at` for that breakpoint over them. */
export function layoutAt(widget: Widget, breakpoint: Breakpoint): Layout {
  const own: Layout = {};
  for (const key of ['direction', 'gap', 'align', 'justify', 'wrap', 'columns'] as const) {
    const value = (widget as unknown as Record<string, unknown>)[key];
    if (value !== undefined) (own as Record<string, unknown>)[key] = value;
  }
  return { ...own, ...widget.at?.[breakpoint] };
}

/** Inline style for a stack, a panel or a grid. Gaps are theme spacing steps. */
export function layoutStyle(widget: Widget, breakpoint: Breakpoint): Record<string, string> {
  const layout = layoutAt(widget, breakpoint);
  const style: Record<string, string> = { gap: `calc(var(--eb-space) * ${layout.gap ?? 1})` };
  if (widget.widget === 'grid') {
    style['grid-template-columns'] = `repeat(${layout.columns ?? 1}, minmax(0, 1fr))`;
    return style;
  }
  style['flex-direction'] = layout.direction ?? 'column';
  if (layout.align) style['align-items'] = ALIGN[layout.align];
  if (layout.justify) style['justify-content'] = JUSTIFY[layout.justify];
  if (layout.wrap) style['flex-wrap'] = 'wrap';
  return style;
}

/** The theme as the CSS variables the widgets' styles read. */
export function themeVars(theme: Theme = DEFAULT_THEME): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, colour] of Object.entries(theme.colors)) vars[`--eb-${name}`] = colour;
  vars['--eb-font'] = theme.font ?? DEFAULT_THEME.font ?? 'system-ui, sans-serif';
  vars['--eb-size'] = `${theme.size ?? DEFAULT_THEME.size}px`;
  vars['--eb-space'] = `${theme.space ?? DEFAULT_THEME.space}px`;
  vars['--eb-radius'] = `${theme.radius ?? DEFAULT_THEME.radius}px`;
  return vars;
}
