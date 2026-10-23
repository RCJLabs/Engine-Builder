/**
 * Make it yours, as plain functions (M4.11, D61): guide.json read for the Project panel, and where
 * each step's Open goes, which is where Problems would open a problem in the same file.
 */
import { checkGuide, GUIDE_FILE, GUIDE_TITLE, type GuideJson, type GuideStep } from '@eb/compiler';
import type { Catalog } from '../forms/catalog.ts';
import { type Place, placeOf } from '../problems/problemList.ts';

export interface Guide {
  readonly title: string;
  readonly steps: readonly GuideStep[];
}

/** guide.json's value as the section shows it, or null when its shape is wrong (E057, which Problems lists). */
export function readGuide(value: unknown): Guide | null {
  const { guide } = checkGuide(value, () => true);
  return guide ? { title: (guide as GuideJson).title ?? GUIDE_TITLE, steps: guide.steps } : null;
}

/** Where a step's Open goes, or null when the project has no place for it (W140). */
export function stepPlace(step: GuideStep, catalog: Catalog): Place | null {
  if ('panel' in step.open) return { kind: 'panel', panel: step.open.panel };
  const { file, at } = step.open;
  // A record's form at the field, a script or a scene, a screen: as a problem in the file would open.
  return placeOf({ code: 'W140', severity: 'warning', message: '', file, path: at ?? '' }, catalog);
}

/** The step that removes the guide: guide.json deleted, which undo brings back. */
export const REMOVE_GUIDE = { label: 'Remove the guide', file: GUIDE_FILE } as const;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** guide.json's value with every step that opens `from` opening `to`: a record renamed, its file moved. */
export function guideMoved(guide: unknown, from: string, to: string): unknown {
  if (!isObject(guide) || !Array.isArray(guide.steps)) return guide;
  const moved = (step: unknown) =>
    isObject(step) && isObject(step.open) && step.open.file === from
      ? { ...step, open: { ...step.open, file: to } }
      : step;
  return guide.steps.some((step) => moved(step) !== step) ? { ...guide, steps: guide.steps.map(moved) } : guide;
}
