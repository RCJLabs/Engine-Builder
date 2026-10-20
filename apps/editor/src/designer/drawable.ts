/**
 * A screen file as the frame can draw it (M4.5): a file being designed is often half made, and the
 * renderer draws only screens the checks passed. What it lacks or has wrong is drawn as a sample,
 * named for what is missing, and the checks say why at the field.
 */
import { type Screen, SHELL_GOES, SOURCES, WIDGETS, type Widget } from '@eb/ui/format';
import { sample } from './samples.ts';

type Loose = Record<string, unknown>;
const isObject = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, missing: string): string => (typeof value === 'string' ? value : sample(missing));
const amount = (value: unknown): number | string =>
  typeof value === 'number' || typeof value === 'string' ? value : 0;
const widgets = (value: unknown): Widget[] => (Array.isArray(value) ? value.map(drawableWidget) : []);

/** A widget's own fields, without a shows-when or an `at` of the wrong kind, which every kind may have. */
function kept(widget: Loose): Loose {
  const own = { ...widget };
  if (typeof own['shows-when'] !== 'string') delete own['shows-when'];
  if (!isObject(own.at)) delete own.at;
  return own;
}

function action(value: unknown): Extract<Widget, { widget: 'button' }>['action'] {
  if (!isObject(value)) return { take: '' };
  if (typeof value.take === 'string')
    return isObject(value.args) ? { take: value.take, args: value.args as never } : { take: value.take };
  if (typeof value.open === 'string') return { open: value.open };
  if (typeof value.shell === 'string' && SHELL_GOES.includes(value.shell as never))
    return { shell: value.shell as never };
  return { close: true };
}

/** A widget the renderer can draw: its own fields where they are of the right kind, samples where not. */
export function drawableWidget(value: unknown): Widget {
  if (!isObject(value) || !WIDGETS.includes(value.widget as never)) return { widget: 'text', text: sample('a widget') };
  const own = kept(value);
  switch (value.widget) {
    case 'stack':
    case 'panel':
      return { ...own, widget: value.widget, children: widgets(value.children) } as Widget;
    case 'grid':
      return {
        ...own,
        widget: 'grid',
        columns: typeof value.columns === 'number' ? value.columns : 1,
        children: widgets(value.children),
      } as Widget;
    case 'text':
      return { ...own, widget: 'text', text: text(value.text, 'text') } as Widget;
    case 'image':
      return { ...own, widget: 'image', asset: text(value.asset, 'image'), alt: text(value.alt, 'alt text') } as Widget;
    case 'button':
      return { ...own, widget: 'button', label: text(value.label, 'label'), action: action(value.action) } as Widget;
    case 'progress':
      return {
        ...own,
        widget: 'progress',
        value: amount(value.value),
        max: amount(value.max),
        label: text(value.label, 'label'),
      } as Widget;
    case 'list':
      return {
        ...kept,
        widget: 'list',
        of: SOURCES.includes(value.of as never) ? value.of : 'offered',
        item: value.item === undefined ? { widget: 'text', text: sample('item') } : drawableWidget(value.item),
        ...(value.unknown !== undefined ? { unknown: drawableWidget(value.unknown) } : {}),
      } as Widget;
    case 'tabs': {
      const tabs = Array.isArray(value.tabs) ? value.tabs : [];
      const drawn = tabs.map((tab) =>
        isObject(tab)
          ? { label: text(tab.label, 'tab'), children: widgets(tab.children) }
          : { label: sample('tab'), children: [] },
      );
      return { ...own, widget: 'tabs', tabs: drawn } as Widget;
    }
    default:
      return { ...own, widget: 'log' } as Widget;
  }
}

/** The screen as the frame draws it, or null for a file that isn't an object at all. */
export function drawableScreen(value: unknown): Screen | null {
  if (!isObject(value)) return null;
  const region = (key: string) => (value[key] === undefined ? {} : { [key]: drawableWidget(value[key]) });
  return {
    ...(typeof value.title === 'string' ? { title: value.title } : {}),
    ...(value.modal === true ? { modal: true } : {}),
    ...region('top'),
    ...region('bottom'),
    // A screen with no main yet is drawn with none: the checks say so (E047).
    ...region('main'),
  } as Screen;
}
