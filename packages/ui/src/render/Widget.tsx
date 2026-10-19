/**
 * One widget drawn (docs/specs/screens.md#widgets). Buttons are real buttons, at least 44 px each
 * way, disabled while the action they name isn't on offer; text wraps; nothing hovers.
 */
import type { Widget } from '../format/screen.ts';
import type { Entry } from '../session/types.ts';
import type { Drawing } from './context.ts';
import { actionFor, amount, fill, holds } from './fill.ts';
import { layoutStyle } from './layout.ts';
import { Tabs } from './Tabs.tsx';

interface Props {
  readonly widget: Widget;
  readonly drawing: Drawing;
  /** The list entry this widget is the item of. */
  readonly entry?: Entry;
}

export function WidgetView({ widget, drawing, entry }: Props) {
  const { view, breakpoint } = drawing;
  if (!holds(widget, view)) return null;
  const children = (list: readonly Widget[]) =>
    list.map((child, i) => <WidgetView key={i} widget={child} drawing={drawing} entry={entry} />);
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
    case 'list': {
      const entries = view.lists[widget.of] ?? [];
      if (entries.length === 0) {
        return widget.empty === undefined ? null : <p class="eb-text eb-empty">{fill(widget.empty, view, entry)}</p>;
      }
      return (
        <ul class="eb-list">
          {entries.map((each) => (
            <li key={each.key}>
              <WidgetView widget={widget.item} drawing={drawing} entry={each} />
            </li>
          ))}
        </ul>
      );
    }
    case 'tabs':
      return (
        <Tabs
          labels={widget.tabs.map((tab) => fill(tab.label, view, entry))}
          panel={(i) => children(widget.tabs[i]?.children ?? [])}
        />
      );
  }
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
