/**
 * Bands as content writes them (packages/kits/src/bands.ts holds the rule they are read by): ids
 * a condition can write, each once, lowest first, every one after the first saying where it
 * begins, within the bounds when there are any. A faction's bands, a rank ladder and a roster's
 * bonds are all checked so (E035).
 */
import { NAME_PATTERN } from '@eb/core';
import type { DiagnosticCode } from './diagnostics.ts';

type Report = (code: DiagnosticCode, path: string, message: string) => void;

export interface Bounds {
  readonly min?: number;
  readonly max?: number;
}

export const outside = (bounds: Bounds, n: number): boolean =>
  (bounds.min !== undefined && n < bounds.min) || (bounds.max !== undefined && n > bounds.max);

export const boundsText = (bounds: Bounds): string => `${bounds.min ?? 'no limit'} to ${bounds.max ?? 'no limit'}`;

/** `what` names one of them in messages: "band", "rank". */
export function checkBands(
  bands: readonly { readonly id: string; readonly from?: number }[],
  at: string,
  bounds: Bounds | undefined,
  what: string,
  report: Report,
): void {
  const seen = new Set<string>();
  let last: { id: string; from: number } | undefined;
  bands.forEach((band, i) => {
    const path = `${at}/${i}`;
    if (!NAME_PATTERN.test(band.id)) {
      report(
        'E035',
        `${path}/id`,
        `"${band.id}" can't be written in a condition: use lowercase words joined by hyphens`,
      );
    } else if (seen.has(band.id)) report('E035', `${path}/id`, `${band.id} is a ${what} twice`);
    seen.add(band.id);
    if (band.from === undefined) {
      if (i > 0) {
        report('E035', path, `${band.id} says nothing of where it begins: only the first ${what} can leave From out`);
      }
      return;
    }
    if (bounds !== undefined && outside(bounds, band.from)) {
      report('E035', `${path}/from`, `${band.id} begins at ${band.from}, outside ${boundsText(bounds)}`);
    } else if (last !== undefined && band.from <= last.from) {
      report(
        'E035',
        `${path}/from`,
        `${band.id} begins at ${band.from}, not above ${last.id}'s ${last.from}: lowest first`,
      );
    }
    last = { id: band.id, from: band.from };
  });
}
