/**
 * The shape of a screen, a theme, a game's feedback and its shell (M4.1, M4.2, M4.3), as zod: strict objects, so a
 * misspelt field is E047 at its path rather than ignored. What a screen names (facts, actions,
 * screens, modes) is uiCheck.ts's.
 */
import {
  ALIGNS,
  BREAKPOINTS,
  BUTTON_STYLES,
  COLOR_NAMES,
  DIRECTIONS,
  FEEDBACK_TO,
  type Feedback,
  JUSTIFIES,
  LOG_LINES_MAX,
  type Screen,
  SHELL_GOES,
  type ShellFile,
  SLOTS_MAX,
  SLOTS_MIN,
  SOURCES,
  TEXT_STYLES,
  type Theme,
  type Widget,
} from '@eb/ui/format';
import { z } from 'zod';

const steps = z.int().min(0).max(8);
const layout = {
  direction: z.enum(DIRECTIONS).optional(),
  gap: steps.optional(),
  align: z.enum(ALIGNS).optional(),
  justify: z.enum(JUSTIFIES).optional(),
  wrap: z.boolean().optional(),
  columns: z.int().min(1).max(6).optional(),
};
const base = {
  'shows-when': z.string().min(1).optional(),
  at: z.partialRecord(z.enum(BREAKPOINTS), z.strictObject(layout)).optional(),
};
const value = z.union([z.string(), z.number(), z.boolean()]);
const action = z.union([
  z.strictObject({ take: z.string().min(1), args: z.record(z.string(), value).optional() }),
  z.strictObject({ open: z.string().min(1) }),
  z.strictObject({ close: z.literal(true) }),
  z.strictObject({ shell: z.enum(SHELL_GOES) }),
]);
const text = z.string();
const children = z.array(z.lazy(() => widgetSchema));

/** A number, or a fact in braces. */
const amount = z.union([z.number(), z.string().regex(/^\{[^{}]+\}$/, 'A number, or a fact in braces like {time.day}')]);

const widgetSchema: z.ZodType<Widget> = z.lazy(() =>
  z.discriminatedUnion('widget', [
    z.strictObject({
      widget: z.literal('stack'),
      children,
      direction: layout.direction,
      gap: layout.gap,
      align: layout.align,
      justify: layout.justify,
      wrap: layout.wrap,
      ...base,
    }),
    z.strictObject({ widget: z.literal('panel'), children, direction: layout.direction, gap: layout.gap, ...base }),
    z.strictObject({ widget: z.literal('grid'), children, columns: z.int().min(1).max(6), gap: layout.gap, ...base }),
    z.strictObject({ widget: z.literal('text'), text, style: z.enum(TEXT_STYLES).optional(), ...base }),
    z.strictObject({ widget: z.literal('image'), asset: z.string().min(1), alt: z.string(), ...base }),
    z.strictObject({
      widget: z.literal('button'),
      label: z.string().min(1),
      action,
      style: z.enum(BUTTON_STYLES).optional(),
      ...base,
    }),
    z.strictObject({ widget: z.literal('progress'), value: amount, max: amount, label: z.string().min(1), ...base }),
    z.strictObject({
      widget: z.literal('list'),
      of: z.enum(SOURCES),
      item: z.lazy(() => widgetSchema),
      empty: text.optional(),
      type: z.string().min(1).optional(),
      known: z.string().min(1).optional(),
      unknown: z.lazy(() => widgetSchema).optional(),
      ...base,
    }),
    z.strictObject({
      widget: z.literal('tabs'),
      tabs: z.array(z.strictObject({ label: z.string().min(1), children })).min(1),
      ...base,
    }),
    z.strictObject({
      widget: z.literal('log'),
      lines: z.int().min(1).max(LOG_LINES_MAX).optional(),
      label: z.string().min(1).optional(),
      empty: text.optional(),
      ...base,
    }),
    z.strictObject({ widget: z.literal('map'), label: z.string().min(1).optional(), empty: text.optional(), ...base }),
  ]),
) as z.ZodType<Widget>;

export const screenSchema = z.strictObject({
  title: z.string().min(1).optional(),
  shows: z.array(z.string().min(1)).optional(),
  modal: z.boolean().optional(),
  top: widgetSchema.optional(),
  main: widgetSchema,
  bottom: widgetSchema.optional(),
}) as unknown as z.ZodType<Screen>;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'A colour as #rrggbb');

export const themeSchema = z.strictObject({
  colors: z.strictObject(Object.fromEntries(COLOR_NAMES.map((name) => [name, hex])) as Record<string, typeof hex>),
  font: z.string().min(1).optional(),
  size: z.int().min(12).max(24).optional(),
  space: z.int().min(2).max(16).optional(),
  radius: z.int().min(0).max(24).optional(),
}) as unknown as z.ZodType<Theme>;

/** ui/feedback.json (M4.2, docs/specs/input.md#feedback). What its lines name is feedbackCheck.ts's. */
export const feedbackSchema = z.strictObject({
  lines: z.array(
    z.strictObject({
      on: z.string().min(1),
      where: z.record(z.string(), value).optional(),
      say: z.string().min(1),
      to: z.enum(FEEDBACK_TO).optional(),
    }),
  ),
}) as unknown as z.ZodType<Feedback>;

/** ui/shell.json (M4.3, docs/specs/shell.md). What its slot line names is shellCheck.ts's. */
export const shellSchema = z.strictObject({
  title: z.string().min(1).optional(),
  tagline: z.string().min(1).optional(),
  slots: z.int().min(SLOTS_MIN).max(SLOTS_MAX).optional(),
  daily: z.boolean().optional(),
  'slot-line': z.string().min(1).optional(),
}) as unknown as z.ZodType<ShellFile>;
