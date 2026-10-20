/**
 * One widget drawn (docs/specs/screens.md#widgets). Buttons are real buttons, at least 44 px each
 * way, disabled while the action they name isn't on offer; text wraps; nothing hovers.
 */
import { type ListWidget, listKey, type Widget } from '../format/screen.ts';
import type { Entry } from '../session/types.ts';
import { type Drawing, tabHolding } from './context.ts';
import { actionFor, amount, fill, holds } from './fill.ts';
import { LogView } from './LogView.tsx';
import { layoutStyle } from './layout.ts';
import { Tabs } from './Tabs.tsx';

interface Props {
  readonly widget: Widget;
  readonly drawing: Drawing;
  /** The list entry this widget is the item of. */
  readonly entry?: Entry;
  /** Where the widget sits in its screen, a JSON Pointer: given only while the screen is designed (M4.5). */
  readonly at?: string | undefined;
}

export function WidgetView(props: Props) {
  const { widget, drawing, entry, at } = props;
  if (!holds(widget, drawing.view, entry)) return null;
  // Designed, each widget's box says where it sits, so a tap in the frame selects it; the box lays out nothing.
  return at === undefined ? (
    <WidgetBody {...props} />
  ) : (
    <div class="eb-at" data-eb-at={at} data-eb-selected={drawing.design?.selected === at ? '' : undefined}>
      <WidgetBody {...props} />
    </div>
  );
}

function WidgetBody({ widget, drawing, entry, at }: Props) {
  const { view, breakpoint } = drawing;
  const under = (path: string) => (at === undefined ? undefined : `${at}${path}`);
  const children = (list: readonly Widget[], path = '/children') =>
    list.map((child, i) => (
      <WidgetView key={i} widget={child} drawing={drawing} entry={entry} at={under(`${path}/${i}`)} />
    ));
  switch (widget.widget) {
    case 'stack':
    case 'panel':
    case 'grid':
      return (
        <div class={`eb-${widget.widget}`} style={layoutStyle(widget, breakpoint)}>
          {children(widget.children)}
        </div>
      );
    case 'text': {
      const text = fill(widget.text, view, entry);
      const style = widget.style ?? 'body';
      return style === 'title' || style === 'heading' ? (
        <h3 class={`eb-text eb-${style}`}>{text}</h3>
      ) : (
        <p class={`eb-text eb-${style}`}>{text}</p>
      );
    }
    case 'image': {
      const url = drawing.assetUrl(widget.asset);
      return url ? (
        <img class="eb-image" src={url} alt={fill(widget.alt, view, entry)} />
      ) : (
        <span class="eb-image eb-no-image" role="img" aria-label={fill(widget.alt, view, entry)}>
          {fill(widget.alt, view, entry)}
        </span>
      );
    }
    case 'button':
      return <ButtonView widget={widget} drawing={drawing} entry={entry} />;
    case 'progress':
      return <ProgressView widget={widget} drawing={drawing} entry={entry} />;
    case 'list':
      return <ListView widget={widget} drawing={drawing} entry={entry} at={at} />;
    case 'tabs':
      return (
        <Tabs
          labels={widget.tabs.map((tab) => fill(tab.label, view, entry))}
          panel={(i) => children(widget.tabs[i]?.children ?? [], `/tabs/${i}/children`)}
          shown={at === undefined ? undefined : tabHolding(at, drawing.design?.selected)}
        />
      );
    case 'log':
      return <LogView widget={widget} drawing={drawing} entry={entry} />;
  }
}

/** A list's entries, each by its item; a codex entry held back by its `unknown`, which is given nothing of it. */
function ListView({ widget, drawing, entry, at }: Props & { readonly widget: ListWidget }) {
  const { view } = drawing;
  const { unknown } = widget;
  const under = (path: string) => (at === undefined ? undefined : `${at}${path}`);
  const entries = (view.lists[listKey(widget)] ?? []).filter((each) => each.known !== false || unknown !== undefined);
  if (entries.length === 0) {
    return widget.empty === undefined ? null : <p class="eb-text eb-empty">{fill(widget.empty, view, entry)}</p>;
  }
  return (
    <ul class="eb-list">
      {entries.map((each) => (
        <li key={each.key}>
          {each.known === false && unknown !== undefined ? (
            <WidgetView widget={unknown} drawing={drawing} at={under('/unknown')} />
          ) : (
            <WidgetView widget={widget.item} drawing={drawing} entry={each} at={under('/item')} />
          )}
        </li>
      ))}
    </ul>
  );
}

function ButtonView({ widget, drawing, entry }: Props & { readonly widget: Extract<Widget, { widget: 'button' }> }) {
  const { action } = widget;
  const label = fill(widget.label, drawing.view, entry);
  const style = `eb-button eb-${widget.style ?? 'plain'}`;
  if ('open' in action) {
    return (
      <button type="button" class={style} onClick={() => drawing.open(action.open)}>
        {label}
      </button>
    );
  }
  if ('shell' in action) {
    const { toShell } = drawing;
    return (
      <button type="button" class={style} disabled={toShell === undefined} onClick={() => toShell?.(action.shell)}>
        {label}
      </button>
    );
  }
  if ('close' in action) {
    return (
      <button type="button" class={style} disabled={drawing.close === undefined} onClick={drawing.close}>
        {label}
      </button>
    );
  }
  const taken = actionFor(action, drawing.view, entry, drawing.busy);
  return (
    <button type="button" class={style} disabled={taken === undefined} onClick={() => taken && drawing.act(taken)}>
      {label}
    </button>
  );
}

function ProgressView({
  widget,
  drawing,
  entry,
}: Props & { readonly widget: Extract<Widget, { widget: 'progress' }> }) {
  const value = amount(widget.value, drawing.view, entry);
  const max = amount(widget.max, drawing.view, entry);
  const label = fill(widget.label, drawing.view, entry);
  const known = value !== null && max !== null && max > 0;
  const share = known ? Math.min(Math.max(value / max, 0), 1) : 0;
  return (
    <div class="eb-progress">
      <span class="eb-progress-label">
        {label} {known ? `${value} / ${max}` : '—'}
      </span>
      <div
        class="eb-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max ?? undefined}
        aria-valuenow={value ?? undefined}
      >
        <div class="eb-progress-fill" style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}
