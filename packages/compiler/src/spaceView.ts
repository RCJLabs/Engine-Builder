/**
 * A space's view as plain values (M7.1, D83): apart from the checks so the 2D stage reads it without
 * the schemas they bring.
 */

/** The art pixels a 2D space wants in view when it doesn't say. */
export const FIT_DEFAULT: readonly [number, number] = [320, 180];

export const is2d = (space: { readonly view?: string }): boolean => space.view === '2d';

/** Whether a file's value, read but perhaps not sound, is a 2D space's. */
export const is2dValue = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && (value as { view?: unknown }).view === '2d';
